import { afterBackfillChunk, CHUNK_DAYS, EMPTY_CHUNKS_TO_STOP, forwardWindow, nextBackfillWindow, type SyncProgress } from '../backfill';

const today = '2026-11-04';
const fresh: SyncProgress = { syncedThrough: null, syncedFrom: null, backfillDone: false, emptyStreak: 0 };

describe('sync planning', () => {
  it('first forward window is one chunk ending today, later ones overlap a week', () => {
    expect(forwardWindow(fresh, today)).toEqual({ start: '2026-07-08', end: today });
    expect(forwardWindow({ ...fresh, syncedThrough: '2026-11-01' }, today)).toEqual({ start: '2026-10-25', end: today });
  });

  it('walks backwards in contiguous chunks', () => {
    const p = { ...fresh, syncedFrom: '2026-07-08' };
    const w = nextBackfillWindow(p, today)!;
    expect(w.end).toBe('2026-07-07');
    expect(w.start).toBe('2026-03-10');
    const w2 = nextBackfillWindow(afterBackfillChunk(p, w, 300, today), today)!;
    expect(w2.end).toBe('2026-03-09');
  });

  it('stops after a year of empty chunks but tolerates shorter gaps', () => {
    let p: SyncProgress = { ...fresh, syncedFrom: '2026-07-08' };
    for (let i = 0; i < EMPTY_CHUNKS_TO_STOP - 1; i++) p = afterBackfillChunk(p, nextBackfillWindow(p, today)!, 0, today);
    expect(p.backfillDone).toBe(false);
    // data again: streak resets
    p = afterBackfillChunk(p, nextBackfillWindow(p, today)!, 12, today);
    expect(p.emptyStreak).toBe(0);
    for (let i = 0; i < EMPTY_CHUNKS_TO_STOP; i++) p = afterBackfillChunk(p, nextBackfillWindow(p, today)!, 0, today);
    expect(p.backfillDone).toBe(true);
    expect(nextBackfillWindow(p, today)).toBeNull();
  });

  it('chunk length is what the constant says', () => {
    const w = nextBackfillWindow({ ...fresh, syncedFrom: '2026-07-08' }, today)!;
    const days = (Date.parse(w.end) - Date.parse(w.start)) / 86_400_000 + 1;
    expect(days).toBe(CHUNK_DAYS);
  });
});
