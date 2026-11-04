/**
 * POST /functions/v1/oura-connect   (signed-in user)
 * body: { returnTo: string }
 *
 * Creates a single-use state row and returns the Oura authorization URL the
 * app should open. Oura sends the user back to oura-callback afterwards.
 */
import { corsHeaders, env, isAllowedReturnTo, json, OURA_AUTHORIZE_URL, OURA_SCOPES, requireUser, serviceClient } from '../_shared/oura.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    if (!user) return json({ error: 'Not signed in' }, 401);

    const { returnTo } = (await req.json().catch(() => ({}))) as { returnTo?: string };
    if (!returnTo || !isAllowedReturnTo(returnTo)) return json({ error: 'returnTo is not an allowed address' }, 400);

    const db = serviceClient();
    const { data, error } = await db.from('oauth_states').insert({ user_id: user.id, provider: 'oura', return_to: returnTo }).select('state').single();
    if (error) throw new Error(`create state: ${error.message}`);

    const redirectUri = `${env('SUPABASE_URL')}/functions/v1/oura-callback`;
    const url = new URL(OURA_AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', env('OURA_CLIENT_ID'));
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', OURA_SCOPES);
    url.searchParams.set('state', data.state);
    return json({ url: url.toString() });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
