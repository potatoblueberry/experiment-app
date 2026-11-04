/**
 * POST /functions/v1/oura-sync   (signed-in user)
 *
 * 1. Forward: fetch from a week before the last synced day up to today.
 * 2. Backward: keep importing older chunks until the time budget for this call
 *    runs out or the history is exhausted. Progress is saved after each chunk,
 *    so the app simply calls again while `backfillDone` is false.
 * After every window the automatic day flags (illness, travel) are recomputed
 * for that window from the stored readings and written to day_flags.
 */
import { afterBackfillChunk, forwardWindow, nextBackfillWindow, type SyncProgress } from '../_shared/backfill.ts';
import { computeAutoFlags } from '../_shared/flags.ts';
import { mapOuraToReadings, type OuraDailyActivity, type OuraDailyReadiness, type OuraDailyStress, type OuraSleepPeriod } from '../_shared/mapReadings.ts';
import { addDaysISO, corsHeaders, fetchCollection, freshAccessToken, isoDate, json, NotConnectedError, OuraAuthError, requireUser, serviceClient } from '../_shared/oura.ts';

const TIME_BUDGET_MS = 45_000;
const INSERT_CHUNK = 500;
const FLAG_CONTEXT_DAYS = 35;
const FLAG_METRICS = ['temp_deviation', 'resting_hr', 'respiratory_rate', 'hrv', 'tz_offset'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: 'Not signed in' }, 401);
  const db = serviceClient();
  const startedAt = Date.now();

  const saveConnection = async (patch: Record<string, unknown>) => {
    const { error } = await db.from('data_source_connections').upsert({ user_id: user.id, provider: 'oura', ...patch }, { onConflict: 'user_id,provider' });
    if (error) throw new Error(`update connection: ${error.message}`);
  };

  const importWindow = async (accessToken: string, w: { start: string; end: string }): Promise<number> => {
    const [sleep, dailyReadiness, dailyActivity, dailyStress] = await Promise.all([
      fetchCollection<OuraSleepPeriod>(accessToken, 'sleep', w.start, w.end),
      fetchCollection<OuraDailyReadiness>(accessToken, 'daily_readiness', w.start, w.end),
      fetchCollection<OuraDailyActivity>(accessToken, 'daily_activity', w.start, w.end),
      // Needs the `stress` scope; users who connected before it was requested get [] until they reconnect.
      fetchCollection<OuraDailyStress>(accessToken, 'daily_stress', w.start, w.end, { optional: true }),
    ]);
    const now = new Date().toISOString();
    const rows = mapOuraToReadings({ sleep, dailyReadiness, dailyActivity, dailyStress }).map((r) => ({ ...r, user_id: user.id, synced_at: now }));
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { error } = await db.from('metric_readings').upsert(rows.slice(i, i + INSERT_CHUNK), { onConflict: 'user_id,metric_id,date' });
      if (error) throw new Error(`save readings: ${error.message}`);
    }
    await refreshFlags(w);
    return rows.length;
  };

  const refreshFlags = async (w: { start: string; end: string }) => {
    const { data, error } = await db
      .from('metric_readings')
      .select('metric_id, date, value')
      .eq('user_id', user.id)
      .in('metric_id', FLAG_METRICS)
      .gte('date', addDaysISO(w.start, -FLAG_CONTEXT_DAYS))
      .lte('date', w.end)
      .limit(5000);
    if (error) throw new Error(`load readings for flags: ${error.message}`);
    const flagged = computeAutoFlags(data ?? [], w.start, w.end);
    const del = await db.from('day_flags').delete().eq('user_id', user.id).eq('source', 'auto').gte('date', w.start).lte('date', w.end);
    if (del.error) throw new Error(`clear flags: ${del.error.message}`);
    if (flagged.length) {
      const ins = await db.from('day_flags').insert(flagged.map((f) => ({ user_id: user.id, date: f.date, flags: f.flags, source: 'auto' })));
      if (ins.error) throw new Error(`save flags: ${ins.error.message}`);
    }
  };

  try {
    const accessToken = await freshAccessToken(db, user.id);
    const { data: conn } = await db
      .from('data_source_connections')
      .select('synced_through, synced_from, backfill_done, empty_streak')
      .eq('user_id', user.id)
      .eq('provider', 'oura')
      .maybeSingle();
    const today = isoDate(new Date());
    let progress: SyncProgress = {
      syncedThrough: conn?.synced_through ?? null,
      syncedFrom: conn?.synced_from ?? null,
      backfillDone: conn?.backfill_done ?? false,
      emptyStreak: conn?.empty_streak ?? 0,
    };
    let readings = 0;

    // 1. Forward (recent days)
    const fw = forwardWindow(progress, today);
    readings += await importWindow(accessToken, fw);
    progress = { ...progress, syncedThrough: today, syncedFrom: progress.syncedFrom ?? fw.start };
    await saveConnection({ status: 'connected', last_sync_at: new Date().toISOString(), synced_through: today, synced_from: progress.syncedFrom, last_error: null });

    // 2. Backward (older history) within this call's time budget
    let chunks = 0;
    while (Date.now() - startedAt < TIME_BUDGET_MS) {
      const w = nextBackfillWindow(progress, today);
      if (!w) {
        progress = { ...progress, backfillDone: true };
        break;
      }
      const found = await importWindow(accessToken, w);
      readings += found;
      chunks += 1;
      progress = afterBackfillChunk(progress, w, found, today);
      await saveConnection({ synced_from: progress.syncedFrom, backfill_done: progress.backfillDone, empty_streak: progress.emptyStreak });
      if (progress.backfillDone) break;
    }
    if (progress.backfillDone) await saveConnection({ backfill_done: true });

    return json({ ok: true, readings, chunks, syncedFrom: progress.syncedFrom, syncedThrough: progress.syncedThrough, backfillDone: progress.backfillDone });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('oura-sync', message);
    if (e instanceof NotConnectedError) return json({ error: message }, 409);
    await saveConnection({ status: e instanceof OuraAuthError ? 'error' : 'connected', last_error: message }).catch(() => {});
    return json({ error: message }, 500);
  }
});
