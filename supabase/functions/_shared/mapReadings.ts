/**
 * Pure mapping from Oura API v2 documents to metric_readings rows.
 * No imports on purpose: this file runs in Deno (Edge Functions) and is
 * unit-tested with Jest from the app side.
 *
 * Oura semantics: a document's `day` is the calendar day the night ended on,
 * which is exactly the app's "one reading per metric per day" rule.
 */

export interface OuraSleepPeriod {
  day: string;
  type?: string; // 'long_sleep' | 'sleep' | 'late_nap' | 'rest' | 'deleted'
  total_sleep_duration?: number | null; // seconds
  efficiency?: number | null; // 0-100
  average_hrv?: number | null; // ms
  lowest_heart_rate?: number | null; // bpm
}

export interface OuraDailyReadiness {
  day: string;
  score?: number | null;
  temperature_deviation?: number | null; // °C
}

export interface OuraDailyActivity {
  day: string;
  steps?: number | null;
}

export interface ReadingRow {
  metric_id: 'sleep_duration' | 'sleep_efficiency' | 'hrv' | 'resting_hr' | 'readiness' | 'steps' | 'temp_deviation';
  date: string;
  value: number;
  source: 'oura';
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** The main sleep of each day: a 'long_sleep' period, else the longest 'sleep' period. Naps and rests are ignored. */
export function pickMainSleep(periods: OuraSleepPeriod[]): Map<string, OuraSleepPeriod> {
  const byDay = new Map<string, OuraSleepPeriod>();
  const rank = (p: OuraSleepPeriod) => (p.type === 'long_sleep' ? 2 : p.type === 'sleep' || p.type === undefined ? 1 : 0);
  for (const p of periods) {
    if (!p.day || rank(p) === 0) continue;
    const cur = byDay.get(p.day);
    if (!cur) {
      byDay.set(p.day, p);
      continue;
    }
    const better = rank(p) > rank(cur) || (rank(p) === rank(cur) && (p.total_sleep_duration ?? 0) > (cur.total_sleep_duration ?? 0));
    if (better) byDay.set(p.day, p);
  }
  return byDay;
}

export function mapOuraToReadings(input: {
  sleep?: OuraSleepPeriod[];
  dailyReadiness?: OuraDailyReadiness[];
  dailyActivity?: OuraDailyActivity[];
}): ReadingRow[] {
  const rows: ReadingRow[] = [];
  const push = (metric_id: ReadingRow['metric_id'], date: string, value: unknown) => {
    if (isNum(value)) rows.push({ metric_id, date, value, source: 'oura' });
  };

  for (const [day, p] of pickMainSleep(input.sleep ?? [])) {
    if (isNum(p.total_sleep_duration)) push('sleep_duration', day, Math.round((p.total_sleep_duration / 3600) * 100) / 100);
    push('sleep_efficiency', day, p.efficiency);
    push('hrv', day, p.average_hrv);
    push('resting_hr', day, p.lowest_heart_rate);
  }
  for (const d of input.dailyReadiness ?? []) {
    if (!d.day) continue;
    push('readiness', d.day, d.score);
    push('temp_deviation', d.day, d.temperature_deviation);
  }
  for (const d of input.dailyActivity ?? []) {
    if (!d.day) continue;
    push('steps', d.day, d.steps);
  }
  return rows;
}
