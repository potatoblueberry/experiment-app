/**
 * POST /functions/v1/oura-sync-all   (called by pg_cron every 15 minutes, no user)
 * header: x-cron-secret: <CRON_SECRET>
 *
 * Syncs the connected Oura accounts that have not been synced for a while,
 * a few per run, oldest first. Each user gets a short time budget, so a long
 * backfill simply continues over several runs. Users who press "Sync now"
 * themselves are skipped until they go stale again.
 */
import { json, serviceClient } from '../_shared/oura.ts';
import { runOuraSync } from '../_shared/sync.ts';

const STALE_HOURS = 8;
const USERS_PER_RUN = 10;
const PER_USER_BUDGET_MS = 20_000;
const TOTAL_BUDGET_MS = 110_000;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const expected = Deno.env.get('CRON_SECRET');
  if (!expected || req.headers.get('x-cron-secret') !== expected) return json({ error: 'Forbidden' }, 403);

  const db = serviceClient();
  const startedAt = Date.now();
  const staleBefore = new Date(Date.now() - STALE_HOURS * 3600_000).toISOString();

  const { data: conns, error } = await db
    .from('data_source_connections')
    .select('user_id, last_sync_at')
    .eq('provider', 'oura')
    .eq('status', 'connected')
    .or(`last_sync_at.is.null,last_sync_at.lt.${staleBefore}`)
    .order('last_sync_at', { ascending: true, nullsFirst: true })
    .limit(USERS_PER_RUN);
  if (error) return json({ error: `list connections: ${error.message}` }, 500);

  const results: { user: string; ok: boolean; readings?: number; error?: string }[] = [];
  for (const c of conns ?? []) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;
    try {
      const r = await runOuraSync(db, c.user_id, { timeBudgetMs: PER_USER_BUDGET_MS });
      results.push({ user: c.user_id, ok: true, readings: r.readings });
    } catch (e) {
      // runOuraSync already recorded last_error on the connection; keep going with the next user.
      results.push({ user: c.user_id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  console.log('oura-sync-all', JSON.stringify(results));
  return json({ ok: true, synced: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
});
