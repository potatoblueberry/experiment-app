/**
 * POST /functions/v1/oura-sync   (signed-in user)
 * body: { reset?: boolean }
 *
 * Runs the Oura sync for the calling user. The app calls again while the
 * response says `backfillDone: false`.
 */
import { corsHeaders, json, NotConnectedError, requireUser, serviceClient } from '../_shared/oura.ts';
import { runOuraSync } from '../_shared/sync.ts';

const TIME_BUDGET_MS = 45_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: 'Not signed in' }, 401);
  const { reset } = (await req.json().catch(() => ({}))) as { reset?: boolean };

  try {
    const result = await runOuraSync(serviceClient(), user.id, { reset: !!reset, timeBudgetMs: TIME_BUDGET_MS });
    return json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('oura-sync', message);
    return json({ error: message }, e instanceof NotConnectedError ? 409 : 500);
  }
});
