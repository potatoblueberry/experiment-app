/**
 * Helpers shared by the Oura Edge Functions: environment, Supabase clients,
 * the Oura OAuth2 token endpoint and paged data fetching.
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const OURA_AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize';
export const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';
export const OURA_API = 'https://api.ouraring.com/v2/usercollection';
export const OURA_SCOPES = 'daily heartrate tag';
export const STATE_MAX_AGE_MS = 15 * 60 * 1000;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra } });
}

export function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}. Set it with: npx supabase secrets set ${name}=...`);
  return v;
}

/** Client acting as the server: bypasses RLS. Only for tokens and state rows. */
export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** Resolves the signed-in user from the request's Authorization header, or null. */
export async function requireUser(req: Request): Promise<{ id: string } | null> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id };
}

/** Where the browser/app may be sent back to after Oura. Keeps the redirect from being abused. */
export function isAllowedReturnTo(url: string): boolean {
  const extra = (Deno.env.get('APP_RETURN_URLS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return (
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) ||
    url.startsWith('n1lab://') ||
    extra.some((prefix) => url.startsWith(prefix))
  );
}

export interface OuraTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<OuraTokenResponse> {
  const body = new URLSearchParams({ ...params, client_id: env('OURA_CLIENT_ID'), client_secret: env('OURA_CLIENT_SECRET') });
  const res = await fetch(OURA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'N1Lab/0.1' },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Oura token endpoint ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as OuraTokenResponse;
}

export function exchangeCode(code: string, redirectUri: string): Promise<OuraTokenResponse> {
  return tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
}

export function refreshToken(refresh: string): Promise<OuraTokenResponse> {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
}

export interface StoredToken {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string | null;
}

export function expiresAt(expiresIn: number): string {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

export async function saveToken(db: SupabaseClient, userId: string, t: OuraTokenResponse): Promise<void> {
  const { error } = await db.from('oura_tokens').upsert(
    { user_id: userId, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: expiresAt(t.expires_in), scope: t.scope ?? null },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`save token: ${error.message}`);
}

/** Returns a valid access token, refreshing (and persisting the rotated refresh token) when needed. */
export async function freshAccessToken(db: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await db.from('oura_tokens').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`load token: ${error.message}`);
  if (!data) throw new NotConnectedError();
  const t = data as StoredToken;
  const soon = Date.now() + 5 * 60 * 1000;
  if (new Date(t.expires_at).getTime() > soon) return t.access_token;
  const renewed = await refreshToken(t.refresh_token);
  await saveToken(db, userId, renewed);
  return renewed.access_token;
}

export class NotConnectedError extends Error {
  constructor() {
    super('Oura is not connected for this account.');
    this.name = 'NotConnectedError';
  }
}

export class OuraAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OuraAuthError';
  }
}

/** GET one Oura collection for a date range, following next_token pages. */
export async function fetchCollection<T>(accessToken: string, collection: string, startDate: string, endDate: string): Promise<T[]> {
  const out: T[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < 50; page++) {
    const url = new URL(`${OURA_API}/${collection}`);
    url.searchParams.set('start_date', startDate);
    url.searchParams.set('end_date', endDate);
    if (nextToken) url.searchParams.set('next_token', nextToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'N1Lab/0.1' } });
    if (res.status === 401 || res.status === 403) throw new OuraAuthError(`Oura rejected the token (${res.status}). Reconnect Oura.`);
    if (res.status === 429) throw new Error('Oura rate limit reached; try again in a few minutes.');
    if (!res.ok) throw new Error(`Oura ${collection} ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { data?: T[]; next_token?: string | null };
    out.push(...(body.data ?? []));
    if (!body.next_token) break;
    nextToken = body.next_token;
  }
  return out;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}
