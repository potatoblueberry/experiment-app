/**
 * GET /functions/v1/oura-callback?code=...&state=...   (called by Oura, no user session)
 *
 * Verifies the state, exchanges the code for tokens, stores them server-side,
 * marks the connection as connected and redirects back to the app with
 * ?oura=connected (or ?oura=error&reason=...).
 */
import { env, exchangeCode, saveToken, serviceClient, STATE_MAX_AGE_MS } from '../_shared/oura.ts';

function redirect(to: string, params: Record<string, string>): Response {
  const url = new URL(to);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req) => {
  const params = new URL(req.url).searchParams;
  const state = params.get('state');
  const code = params.get('code');
  const ouraError = params.get('error');

  const db = serviceClient();
  if (!state) return new Response('Missing state', { status: 400 });

  // Look the state up and burn it, whatever happens next.
  const { data: row, error } = await db.from('oauth_states').select('*').eq('state', state).maybeSingle();
  if (error || !row) return new Response('Unknown or expired sign-in attempt. Go back to the app and try again.', { status: 400 });
  await db.from('oauth_states').delete().eq('state', state);

  const returnTo: string = row.return_to;
  if (Date.now() - new Date(row.created_at).getTime() > STATE_MAX_AGE_MS) return redirect(returnTo, { oura: 'error', reason: 'expired' });
  if (ouraError) return redirect(returnTo, { oura: 'error', reason: ouraError });
  if (!code) return redirect(returnTo, { oura: 'error', reason: 'missing_code' });

  try {
    const redirectUri = `${env('SUPABASE_URL')}/functions/v1/oura-callback`;
    const token = await exchangeCode(code, redirectUri);
    await saveToken(db, row.user_id, token);
    const { error: connErr } = await db
      .from('data_source_connections')
      .upsert({ user_id: row.user_id, provider: 'oura', status: 'connected', last_error: null }, { onConflict: 'user_id,provider' });
    if (connErr) throw new Error(`save connection: ${connErr.message}`);
    return redirect(returnTo, { oura: 'connected' });
  } catch (e) {
    console.error('oura-callback', e);
    return redirect(returnTo, { oura: 'error', reason: 'exchange_failed' });
  }
});
