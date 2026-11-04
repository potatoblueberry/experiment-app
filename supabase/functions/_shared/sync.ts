/**
 * The Oura sync for one user, shared by the user-triggered function
 * (oura-sync) and the scheduled one (oura-sync-all).
 *
 * 1. Forward: fetch from a week before the last synced day up to today.
 * 2. Backward: keep importing older chunks until the time budget runs out or
 *    the history is exhausted. Progress is saved after each chunk, so the next
 *    call continues where this one stopped.
 * After every window the automatic day flags (illness, travel) are recomputed
 * for that window from the stored readings and written to day_flags.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { afterBackfillChunk, forwardWindow, nextBackfillWindow, type SyncProgress } from './backfill.ts';
import { computeAutoFlags } from './flags.ts';
import { mapOuraToReadings, type OuraDailyActivity, type OuraDailyReadiness, type OuraDailyStress, type OuraSleepPeriod } from './mapReadings.ts';
import { addDaysISO, fetchCollection, freshAccessToken, isoDate, OuraAuthError } from './oura.ts';

const INSERT_CHUNK = 500;
const FLAG_CONTEXT_DAYS = 35;
const FLAG_METRICS = ['temp_deviation', 'resting_hr', 'respiratory_rate', 'hrv', 'tz_offset'];

export interface SyncOptions {
  /** Forget the backfill progress so the whole history is walked again. */
  reset?: boolean;
  /** Stop starting new backward chunks after this many milliseconds. */
  timeBudgetMs: number;
}

export interface SyncOutcome {
  readings: number;
  chunks: number;
  syncedFrom: string | null;
  syncedThrough: string | null;
  backfillDone: boolean;
}

export async function runOuraSync(db: SupabaseClient, userId: string, opts: SyncOptions): Promise<SyncOutcome> {
  const startedAt = Date.now();

  const saveConnection = async (patch: Record<string, unknown>) => {
    const { error } = await db.from('data_source_connections').upsert({ user_id: userId, provider: 'oura', ...patch }, { onConflict: 'user_id,provider' });
    if (error) throw new Error(`update connection: ${error.message}`);
  };

  const refreshFlags = async (w: { start: string; end: string }) => {
    const { data, error } = await db
      .from('metric_readings')
      .select('metric_id, date, value')
      .eq('user_id', userId)
      .in('metric_id', FLAG_METRICS)
      .gte('date', addDaysISO(w.start, -FLAG_CONTEXT_DAYS))
      .lte('date', w.end)
      .limit(5000);
    if (error) throw new Error(`load readings for flags: ${error.message}`);
    const flagged = computeAutoFlags(data ?? [], w.start, w.end);
    const del = await db.from('day_flags').delete().eq('user_id', userId).eq('source', 'auto').gte('date', w.start).lte('date', w.end);
    if (del.error) throw new Error(`clear flags: ${del.error.message}`);
    if (flagged.length) {
      const ins = await db.from('day_flags').insert(flagged.map((f) => ({ user_id: userId, date: f.date, flags: f.flags, source: 'auto' })));
      if (ins.error) throw new Error(`save flags: ${ins.error.message}`);
    }
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
    const rows = mapOuraToReadings({ sleep, dailyReadiness, dailyActivity, dailyStress }).map((r) => ({ ...r, user_id: userId, synced_at: now }));
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const { error } = await db.from('metric_readings').upsert(rows.slice(i, i + INSERT_CHUNK), { onConflict: 'user_id,metric_id,date' });
      if (error) throw new Error(`save readings: ${error.message}`);
    }
    await refreshFlags(w);
    return rows.length;
  };

  try {
    const accessToken = await freshAccessToken(db, userId);
    const { data: conn } = await db
      .from('data_source_connections')
      .select('synced_through, synced_from, backfill_done, empty_streak')
      .eq('user_id', userId)
      .eq('provider', 'oura')
      .maybeSingle();
    const today = isoDate(new Date());
    let progress: SyncProgress = {
      syncedThrough: conn?.synced_through ?? null,
      syncedFrom: conn?.synced_from ?? null,
      backfillDone: conn?.backfill_done ?? false,
      emptyStreak: conn?.empty_streak ?? 0,
    };
    if (opts.reset) progress = { ...progress, syncedFrom: null, backfillDone: false, emptyStreak: 0 };
    let readings = 0;

    // 1. Forward (recent days)
    const fw = forwardWindow(progress, today);
    readings += await importWindow(accessToken, fw);
    progress = { ...progress, syncedThrough: today, syncedFrom: progress.syncedFrom ?? fw.start };
    await saveConnection({ status: 'connected', last_sync_at: new Date().toISOString(), synced_through: today, synced_from: progress.syncedFrom, last_error: null });

    // 2. Backward (older history) within the time budget
    let chunks = 0;
    while (Date.now() - startedAt < opts.timeBudgetMs) {
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

    return { readings, chunks, syncedFrom: progress.syncedFrom, syncedThrough: progress.syncedThrough, backfillDone: progress.backfillDone };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await saveConnection({ status: e instanceof OuraAuthError ? 'error' : 'connected', last_error: message }).catch(() => {});
    throw e;
  }
}
