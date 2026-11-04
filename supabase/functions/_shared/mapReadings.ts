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
  average_heart_rate?: number | null; // bpm
  average_breath?: number | null; // breaths/min
  latency?: number | null; // seconds
  awake_time?: number | null; // seconds
  bedtime_start?: string | null; // ISO 8601 with offset, e.g. 2026-11-03T23:12:40+02:00
}

export interface OuraDailyReadiness {
  day: string;
  score?: number | null;
  temperature_deviation?: number | null; // °C
}

export interface OuraDailyActivity {
  day: string;
  steps?: number | null;
  active_calories?: number | null; // kcal
}

export interface OuraDailyStress {
  day: string;
  stress_high?: number | null; // seconds
  recovery_high?: number | null; // seconds
}

export type MetricId =
  | 'sleep_duration'
  | 'sleep_efficiency'
  | 'sleep_latency'
  | 'awake_time'
  | 'hrv'
  | 'resting_hr'
  | 'sleep_hr'
  | 'respiratory_rate'
  | 'readiness'
  | 'bedtime'
  | 'daytime_stress'
  | 'steps'
  | 'active_calories'
  | 'temp_deviation'
  | 'tz_offset';

export interface ReadingRow {
  metric_id: MetricId;
  date: string;
  value: number;
  source: 'oura';
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Local clock time of an ISO timestamp as hours past midnight; times before noon count as the next day (01:00 -> 25). */
export function bedtimeHours(iso: string): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  const h = Number(m[1]) + Number(m[2]) / 60;
  return h < 12 ? h + 24 : h;
}

/** UTC offset of an ISO timestamp in hours (+02:00 -> 2, Z -> 0). */
export function tzOffsetHours(iso: string): number | null {
  if (/Z$/.test(iso)) return 0;
  const m = /([+-])(\d{2}):?(\d{2})$/.exec(iso);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) + Number(m[3]) / 60);
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
  dailyStress?: OuraDailyStress[];
}): ReadingRow[] {
  const rows: ReadingRow[] = [];
  const push = (metric_id: MetricId, date: string, value: unknown, round = 2) => {
    if (!isNum(value)) return;
    const f = 10 ** round;
    rows.push({ metric_id, date, value: Math.round(value * f) / f, source: 'oura' });
  };

  for (const [day, p] of pickMainSleep(input.sleep ?? [])) {
    if (isNum(p.total_sleep_duration)) push('sleep_duration', day, p.total_sleep_duration / 3600);
    push('sleep_efficiency', day, p.efficiency, 0);
    push('hrv', day, p.average_hrv, 0);
    push('resting_hr', day, p.lowest_heart_rate, 0);
    push('sleep_hr', day, p.average_heart_rate, 1);
    push('respiratory_rate', day, p.average_breath, 1);
    if (isNum(p.latency)) push('sleep_latency', day, p.latency / 60, 0);
    if (isNum(p.awake_time)) push('awake_time', day, p.awake_time / 60, 0);
    if (p.bedtime_start) {
      push('bedtime', day, bedtimeHours(p.bedtime_start), 2);
      push('tz_offset', day, tzOffsetHours(p.bedtime_start), 2);
    }
  }
  for (const d of input.dailyReadiness ?? []) {
    if (!d.day) continue;
    push('readiness', d.day, d.score, 0);
    push('temp_deviation', d.day, d.temperature_deviation, 2);
  }
  for (const d of input.dailyActivity ?? []) {
    if (!d.day) continue;
    push('steps', d.day, d.steps, 0);
    push('active_calories', d.day, d.active_calories, 0);
  }
  for (const d of input.dailyStress ?? []) {
    if (!d.day) continue;
    if (isNum(d.stress_high)) push('daytime_stress', d.day, d.stress_high / 60, 0);
  }
  return rows;
}
