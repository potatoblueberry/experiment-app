/**
 * App-side calls to the Oura Edge Functions. The app never touches Oura
 * directly and never sees a token: it asks the server for the authorization
 * URL, opens it, and later asks the server to sync.
 */
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export interface SyncResult {
  ok: true;
  from: string;
  to: string;
  readings: number;
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}

/** Where Oura should send the user back to: this page on web, the app's deep link on native. */
function returnTo(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}${window.location.pathname}`;
  return Linking.createURL('/');
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().functions.invoke<T & { error?: string }>(name, { body });
  if (error) {
    // The function's own JSON error message is more useful than "non-2xx status code".
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const payload = (await ctx.json().catch(() => null)) as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error(`${name}: empty response`);
  if (data.error) throw new Error(data.error);
  return data;
}

/** Starts the OAuth dance: the current tab navigates to Oura and comes back with ?oura=connected. */
export async function startOuraConnect(): Promise<void> {
  const { url } = await invoke<{ url: string }>('oura-connect', { returnTo: returnTo() });
  if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign(url);
  else await Linking.openURL(url);
}

export function syncOura(opts: { full?: boolean } = {}): Promise<SyncResult> {
  return invoke<SyncResult>('oura-sync', { full: !!opts.full });
}
