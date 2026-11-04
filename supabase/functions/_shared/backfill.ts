/**
 * Pure planning for the resumable history import (no imports: Deno + Jest).
 *
 * Newest data is fetched first (one chunk ending today), then the import walks
 * backwards chunk by chunk. It stops after a year of consecutive empty chunks,
 * which means we are before the account existed, or at a hard cap.
 */
export const CHUNK_DAYS = 120;
export const OVERLAP_DAYS = 7;
/** Three empty 120-day chunks in a row = about a year with nothing: stop. Gaps shorter than that are fine. */
export const EMPTY_CHUNKS_TO_STOP = 3;
export const MAX_HISTORY_DAYS = 15 * 365;

export interface SyncProgress {
  syncedThrough: string | null;
  syncedFrom: string | null;
  backfillDone: boolean;
  emptyStreak: number;
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The forward window: from a week before the last synced day (Oura revises recent days) to today. */
export function forwardWindow(p: SyncProgress, today: string): { start: string; end: string } {
  const start = p.syncedThrough ? addDays(p.syncedThrough, -OVERLAP_DAYS) : addDays(today, -(CHUNK_DAYS - 1));
  return { start: start > today ? today : start, end: today };
}

/** The next backward chunk, or null when the import is complete. */
export function nextBackfillWindow(p: SyncProgress, today: string): { start: string; end: string } | null {
  if (p.backfillDone || !p.syncedFrom) return null;
  const end = addDays(p.syncedFrom, -1);
  const start = addDays(end, -(CHUNK_DAYS - 1));
  if (end < addDays(today, -MAX_HISTORY_DAYS)) return null;
  return { start, end };
}

/** Progress after one backward chunk was fetched. */
export function afterBackfillChunk(p: SyncProgress, window: { start: string; end: string }, rowsFound: number, today: string): SyncProgress {
  const emptyStreak = rowsFound > 0 ? 0 : p.emptyStreak + 1;
  const reachedCap = window.start <= addDays(today, -MAX_HISTORY_DAYS);
  return { ...p, syncedFrom: window.start, emptyStreak, backfillDone: emptyStreak >= EMPTY_CHUNKS_TO_STOP || reachedCap };
}
