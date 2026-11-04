/**
 * Deterministic fake Oura data. Same inputs always produce the same numbers, so
 * the demo looks identical after a reload. Built in layers per day:
 *
 *   value = personal baseline
 *         + seasonal wave (annual cosine, winter = lower HRV, longer sleep)
 *         + slow linear trend
 *         + weekday effect (weekend lie-ins, Friday/Saturday nights)
 *         + shared "recovery" noise (so HRV, resting HR and readiness move together)
 *         + metric-specific noise
 *         + episodes (illness, travel) which also set flags
 *         + fake intervention effects for experiments that are running
 */
import type { ISODate, MetricId, MetricReading, ReadingFlag } from '../../domain/types';
import { addDays, nowISO, parseISODate, weekdayIndex } from '../../utils/dates';

export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';

export interface EffectWindow {
  from: ISODate;
  to: ISODate;
  /** Additive shift per metric while the window is active. */
  effects: Partial<Record<MetricId, number>>;
}

// --- small deterministic RNG -------------------------------------------------

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}

function dayOfYear(iso: ISODate): number {
  const d = parseISODate(iso);
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

// --- generator ------------------------------------------------------------------

export interface GenerateOptions {
  endDate: ISODate;
  days?: number;
  seed?: number;
  effectWindows?: EffectWindow[];
}

export function generateReadings({ endDate, days = 365, seed = 20241104, effectWindows = [] }: GenerateOptions): MetricReading[] {
  const rng = mulberry32(seed);
  const out: MetricReading[] = [];
  const syncedAt = nowISO();

  // Episodes are placed relative to the end so the demo always shows them.
  const illnessA = { start: days - 215, len: 5 };
  const illnessB = { start: days - 48, len: 4 };
  const travel = { start: days - 130, len: 7 };

  let recovery = 0; // AR(1) latent: how recovered the body is today
  let idCounter = 0;
  const makeId = () => {
    idCounter += 1;
    return `seed-${seed}-${idCounter.toString(36)}`;
  };

  for (let i = 0; i < days; i++) {
    const date = addDays(endDate, -(days - 1 - i));
    const wd = weekdayIndex(date); // 0 Mon .. 6 Sun
    const seasonal = Math.cos((2 * Math.PI * (dayOfYear(date) - 15)) / 365); // +1 mid-Jan, -1 mid-Jul
    const monthsFromStart = i / 30;

    recovery = 0.6 * recovery + gaussian(rng) * 0.8;

    const flags: ReadingFlag[] = [];
    let ill = 0; // 0..1 intensity
    if (i >= illnessA.start && i < illnessA.start + illnessA.len) ill = 1 - (i - illnessA.start) / illnessA.len;
    if (i >= illnessB.start && i < illnessB.start + illnessB.len) ill = 1 - (i - illnessB.start) / illnessB.len;
    const away = i >= travel.start && i < travel.start + travel.len;
    if (ill > 0) flags.push('illness');
    if (away) flags.push('travel');

    // Ring not worn ~3% of nights: no readings at all that day.
    if (rng() < 0.03) continue;

    const weekendMorning = wd === 5 || wd === 6; // Sat/Sun dates = Fri/Sat nights
    const lateNight = weekendMorning && rng() < 0.35; // some weekend nights are late ones

    const eff = (m: MetricId) =>
      effectWindows.reduce((acc, w) => (date >= w.from && date <= w.to ? acc + (w.effects[m] ?? 0) : acc), 0);

    const sleep = clamp(
      7.15 + 0.2 * seasonal + (weekendMorning ? 0.45 : 0) + 0.15 * recovery + gaussian(rng) * 0.55 + ill * 0.4 - (away ? 0.6 : 0) - (lateNight ? 0.5 : 0) + eff('sleep_duration'),
      4.5,
      10,
    );
    const efficiency = clamp(
      86 + 1.0 * recovery + gaussian(rng) * 2.5 - ill * 6 - (away ? 4 : 0) - (lateNight ? 3 : 0) + eff('sleep_efficiency'),
      60,
      98,
    );
    const hrv = clamp(
      42 - 3 * seasonal + 0.3 * monthsFromStart + 2.5 * recovery + gaussian(rng) * 4 - (lateNight ? 4 : 0) - ill * 12 - (away ? 5 : 0) + eff('hrv'),
      15,
      120,
    );
    const rhr = clamp(
      56 + 1.2 * seasonal - 0.1 * monthsFromStart - 1.2 * recovery + gaussian(rng) * 1.8 + (lateNight ? 2 : 0) + ill * 7 + (away ? 3 : 0) + eff('resting_hr'),
      38,
      90,
    );
    const readiness = clamp(
      78 + 3 * recovery + 0.35 * (hrv - 42) - 0.5 * (rhr - 56) + 2.5 * (sleep - 7.15) + gaussian(rng) * 4 - ill * 20 + eff('readiness'),
      20,
      99,
    );
    const steps = clamp(
      8500 - 1500 * seasonal + (wd === 6 ? -2000 : wd === 5 ? -500 : 0) + gaussian(rng) * 2200 - ill * 5000 + (away ? 3500 : 0) + eff('steps'),
      500,
      30000,
    );
    const temp = clamp(0.04 * seasonal - 0.05 * recovery + gaussian(rng) * 0.18 + ill * 0.75 + eff('temp_deviation'), -1.5, 2.5);

    const push = (metricId: MetricId, value: number) =>
      out.push({ id: makeId(), userId: DEMO_USER_ID, metricId, date, value, source: 'oura', flags: [...flags], syncedAt });

    push('sleep_duration', Math.round(sleep * 100) / 100);
    push('sleep_efficiency', Math.round(efficiency));
    push('hrv', Math.round(hrv));
    push('resting_hr', Math.round(rhr));
    push('readiness', Math.round(readiness));
    if (rng() > 0.02) push('steps', Math.round(steps)); // steps occasionally missing on their own
    push('temp_deviation', Math.round(temp * 100) / 100);
  }
  return out;
}

/**
 * The fake world responds to interventions: when an experiment built from a
 * preset is in its intervention phase, the generator nudges the metrics this
 * much. Custom (free-text) behaviours get no fake effect, which is also a
 * realistic outcome.
 */
export const PRESET_FAKE_EFFECTS: Record<string, Partial<Record<MetricId, number>>> = {
  morning_sunlight: { readiness: 4, sleep_duration: 0.2, sleep_efficiency: 1.5 },
  no_caffeine_after_12: { sleep_efficiency: 3, sleep_duration: 0.3, resting_hr: -1.5, hrv: 2 },
  daily_sauna: { hrv: 4, resting_hr: -2, sleep_duration: 0.1 },
};
