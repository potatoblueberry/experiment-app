/**
 * Automatic day flags from the ring alone (no user input). Pure, no imports.
 *
 *  illness: skin temperature clearly above the personal norm together with at
 *           least one other sign (raised resting HR or respiratory rate, or
 *           suppressed HRV) relative to the previous 28 days; a very large
 *           temperature rise counts on its own.
 *  travel:  the night's UTC offset differs from the previous night's; the two
 *           following days are flagged too (jet lag).
 */

export type Flag = 'illness' | 'travel';

export interface FlagInput {
  metric_id: string;
  date: string;
  value: number;
}

export interface DayFlags {
  date: string;
  flags: Flag[];
}

const LOOKBACK_DAYS = 28;
const MIN_SAMPLES = 10;
const TEMP_RISE = 0.5; // °C above norm, with another sign
const TEMP_RISE_ALONE = 0.9; // °C above norm, enough on its own
const RHR_RISE = 3; // bpm above the 28-day median
const RESP_RISE = 1.0; // breaths/min above the 28-day median
const HRV_DROP = 0.8; // fraction of the 28-day median
const JETLAG_DAYS = 2;
/** Daylight-saving switches move the offset by exactly 1 h and are not travel; a 1 h trip barely disturbs sleep either. */
const MIN_TZ_CHANGE_H = 2;

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Builds date -> value maps per metric. */
function index(rows: FlagInput[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!out.has(r.metric_id)) out.set(r.metric_id, new Map());
    out.get(r.metric_id)!.set(r.date, r.value);
  }
  return out;
}

function priorValues(series: Map<string, number> | undefined, date: string, days: number): number[] {
  if (!series) return [];
  const out: number[] = [];
  for (let i = 1; i <= days; i++) {
    const v = series.get(addDays(date, -i));
    if (v !== undefined) out.push(v);
  }
  return out;
}

/**
 * Flags for every day in [from, to]. `rows` should include the window plus at
 * least 28 days before it for context.
 */
export function computeAutoFlags(rows: FlagInput[], from: string, to: string): DayFlags[] {
  const by = index(rows);
  const temp = by.get('temp_deviation');
  const rhr = by.get('resting_hr');
  const resp = by.get('respiratory_rate');
  const hrv = by.get('hrv');
  const tz = by.get('tz_offset');

  const travelDays = new Set<string>();
  const out: DayFlags[] = [];

  for (let d = from; d <= to; d = addDays(d, 1)) {
    const flags: Flag[] = [];

    // --- illness ---------------------------------------------------------------
    const t = temp?.get(d);
    if (t !== undefined && t >= TEMP_RISE) {
      const rhrMed = median(priorValues(rhr, d, LOOKBACK_DAYS).slice(0, 60));
      const respMed = median(priorValues(resp, d, LOOKBACK_DAYS));
      const hrvMed = median(priorValues(hrv, d, LOOKBACK_DAYS));
      const enough = priorValues(rhr, d, LOOKBACK_DAYS).length >= MIN_SAMPLES;
      const rhrUp = rhrMed !== null && rhr?.get(d) !== undefined && rhr.get(d)! >= rhrMed + RHR_RISE;
      const respUp = respMed !== null && resp?.get(d) !== undefined && resp.get(d)! >= respMed + RESP_RISE;
      const hrvDown = hrvMed !== null && hrv?.get(d) !== undefined && hrv.get(d)! <= hrvMed * HRV_DROP;
      if (t >= TEMP_RISE_ALONE || (enough && (rhrUp || respUp || hrvDown)) || (!enough && t >= 0.8)) flags.push('illness');
    }

    // --- travel ------------------------------------------------------------------
    // A change against the most recent earlier night (up to 3 days back) marks travel;
    // after that the new zone is simply the new normal, so a week abroad is flagged
    // on arrival and on return, not every day in between.
    const offset = tz?.get(d);
    if (offset !== undefined) {
      const prev = priorValues(tz, d, 3)[0];
      if (prev !== undefined && Math.abs(offset - prev) >= MIN_TZ_CHANGE_H) {
        for (let k = 0; k <= JETLAG_DAYS; k++) travelDays.add(addDays(d, k));
      }
    }
    if (travelDays.has(d)) flags.push('travel');

    if (flags.length) out.push({ date: d, flags });
  }
  // Jet-lag days after a change inside the window but past `to` are dropped; the next sync's overlap recomputes them.
  return out;
}
