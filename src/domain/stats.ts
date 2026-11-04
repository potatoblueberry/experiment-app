/**
 * Pure statistics over readings. No React, no storage. Everything here takes
 * arrays in and returns plain numbers/objects out, so it is easy to unit test and
 * easy to move into a server function later.
 */
import type { ExperimentPhase, ISODate, MetricId, MetricReading } from './types';
import { diffDays, weekdayIndex } from '../utils/dates';

export interface Point {
  date: ISODate;
  value: number;
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function sd(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function toPoints(readings: MetricReading[], metricId: MetricId): Point[] {
  return readings
    .filter((r) => r.metricId === metricId)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((r) => ({ date: r.date, value: r.value }));
}

/**
 * Trailing rolling mean over calendar days (not over samples), so a missing day
 * does not stretch the window. Returns a point for each input point that has at
 * least `minSamples` days in its window.
 */
export function rollingMean(points: Point[], windowDays = 7, minSamples = 4): Point[] {
  const out: Point[] = [];
  let start = 0;
  for (let i = 0; i < points.length; i++) {
    while (diffDays(points[start].date, points[i].date) >= windowDays) start++;
    const slice = points.slice(start, i + 1);
    if (slice.length >= minSamples) out.push({ date: points[i].date, value: mean(slice.map((p) => p.value)) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Personal baseline model: "what is normal for this person"
// ---------------------------------------------------------------------------

export interface BaselineModel {
  metricId: MetricId;
  n: number;
  firstDate: ISODate | null;
  lastDate: ISODate | null;
  /** Share of calendar days between first and last that have a reading. */
  coverage: number;
  mean: number;
  sd: number;
  median: number;
  p10: number;
  p90: number;
  /** Mean per weekday (Mon..Sun) minus the overall mean. */
  weekdayEffects: number[];
  /** Linear trend expressed per 30 days, fitted on the whole history. */
  trendPer30Days: number;
  /** Last 7 days mean minus the overall mean. */
  recentDelta: number;
  flaggedDays: number;
}

export function buildBaselineModel(readings: MetricReading[], metricId: MetricId): BaselineModel {
  const rs = readings.filter((r) => r.metricId === metricId).sort((a, b) => (a.date < b.date ? -1 : 1));
  const clean = rs.filter((r) => r.flags.length === 0);
  const values = clean.map((r) => r.value);
  const m = mean(values);
  const first = rs[0]?.date ?? null;
  const last = rs[rs.length - 1]?.date ?? null;
  const span = first && last ? diffDays(first, last) + 1 : 0;

  const buckets: number[][] = [[], [], [], [], [], [], []];
  for (const r of clean) buckets[weekdayIndex(r.date)].push(r.value);
  const weekdayEffects = buckets.map((b) => (b.length ? mean(b) - m : 0));

  const slope = first ? olsSlope(clean.map((r) => [diffDays(first, r.date), r.value] as [number, number])) : 0;

  const recent = last ? clean.filter((r) => diffDays(r.date, last) < 7).map((r) => r.value) : [];

  return {
    metricId,
    n: rs.length,
    firstDate: first,
    lastDate: last,
    coverage: span ? rs.length / span : 0,
    mean: m,
    sd: sd(values),
    median: quantile(values, 0.5),
    p10: quantile(values, 0.1),
    p90: quantile(values, 0.9),
    weekdayEffects,
    trendPer30Days: slope * 30,
    recentDelta: recent.length ? mean(recent) - m : 0,
    flaggedDays: rs.length - clean.length,
  };
}

function olsSlope(xy: [number, number][]): number {
  if (xy.length < 2) return 0;
  const mx = mean(xy.map((p) => p[0]));
  const my = mean(xy.map((p) => p[1]));
  let num = 0;
  let den = 0;
  for (const [x, y] of xy) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// ---------------------------------------------------------------------------
// Effect estimate for an experiment (preliminary while running, final at the end)
// ---------------------------------------------------------------------------

export interface EffectEstimate {
  metricId: MetricId;
  baselineN: number;
  interventionN: number;
  baselineMean: number;
  interventionMean: number;
  /** Raw difference of means. */
  rawDiff: number;
  /**
   * Intervention mean minus what the baseline trend + weekday pattern predicted
   * for those same days. This is the number to trust more than rawDiff.
   */
  adjustedEffect: number;
  /** Half-width of an approximate 95% interval around adjustedEffect. */
  ci95: number;
  /** Rough reading of the evidence for the UI. */
  verdict: 'insufficient' | 'no_clear_effect' | 'likely_effect';
}

/**
 * Fits "value = a + b·day + weekday offset" on the clean baseline days, projects
 * that forward over the intervention days, and reports the average gap between
 * what happened and what the baseline predicted. A slow seasonal drift is
 * absorbed by the trend term; the intervention has to beat it as a step change.
 */
export interface EstimateOptions {
  /** Ignore readings after this day (normally today, so a running experiment is judged on data so far). */
  upTo?: ISODate;
  /**
   * Restrict intervention days to this set, e.g. only the days the user actually
   * did the behaviour ("per-protocol" analysis). Baseline days are unaffected.
   */
  onlyInterventionDates?: Set<ISODate>;
}

export function estimateEffect(readings: MetricReading[], metricId: MetricId, phases: ExperimentPhase[], options: EstimateOptions = {}): EffectEstimate | null {
  const { upTo, onlyInterventionDates } = options;
  const base = phases.find((p) => p.type === 'baseline');
  const intv = phases.find((p) => p.type === 'intervention');
  if (!base || !intv) return null;

  const rs = readings.filter((r) => r.metricId === metricId && r.flags.length === 0);
  const inRange = (r: MetricReading, p: ExperimentPhase) => r.date >= p.startDate && r.date <= p.endDate && (!upTo || r.date <= upTo);
  const bRows = rs.filter((r) => inRange(r, base));
  const iRows = rs.filter((r) => inRange(r, intv) && (!onlyInterventionDates || onlyInterventionDates.has(r.date)));

  const bVals = bRows.map((r) => r.value);
  const iVals = iRows.map((r) => r.value);
  const bMean = mean(bVals);
  const iMean = mean(iVals);

  const empty: EffectEstimate = {
    metricId,
    baselineN: bRows.length,
    interventionN: iRows.length,
    baselineMean: bMean,
    interventionMean: iMean,
    rawDiff: iMean - bMean,
    adjustedEffect: NaN,
    ci95: NaN,
    verdict: 'insufficient',
  };
  if (bRows.length < 10 || iRows.length < 5) return empty;

  // Baseline model: linear trend + weekday offsets (offsets computed from trend residuals).
  const origin = base.startDate;
  const slope = olsSlope(bRows.map((r) => [diffDays(origin, r.date), r.value] as [number, number]));
  const intercept = bMean - slope * mean(bRows.map((r) => diffDays(origin, r.date)));
  const buckets: number[][] = [[], [], [], [], [], [], []];
  for (const r of bRows) buckets[weekdayIndex(r.date)].push(r.value - (intercept + slope * diffDays(origin, r.date)));
  const wd = buckets.map((b) => (b.length ? mean(b) : 0));
  const predict = (date: ISODate) => intercept + slope * diffDays(origin, date) + wd[weekdayIndex(date)];

  const bResid = bRows.map((r) => r.value - predict(r.date));
  const iGaps = iRows.map((r) => r.value - predict(r.date));
  const effect = mean(iGaps);
  const sB = sd(bResid);
  const sI = sd(iGaps);
  const se = Math.sqrt((sB * sB) / bRows.length + (sI * sI) / iRows.length);
  const ci95 = 1.96 * se;

  let verdict: EffectEstimate['verdict'] = 'no_clear_effect';
  if (iRows.length < 14) verdict = 'insufficient';
  else if (Math.abs(effect) > ci95) verdict = 'likely_effect';

  return { ...empty, adjustedEffect: effect, ci95, verdict };
}

// ---------------------------------------------------------------------------
// Confound detection between concurrent experiments
// ---------------------------------------------------------------------------

export interface ConfoundWarning {
  otherExperimentId: string;
  otherTitle: string;
  sharedMetrics: MetricId[];
  overlapDays: number;
}

export function findConfounds(
  target: { id: string; startDate: ISODate; endDate: ISODate; metricIds: MetricId[] },
  others: { id: string; title: string; startDate: ISODate; endDate: ISODate; metricIds: MetricId[] }[],
): ConfoundWarning[] {
  const out: ConfoundWarning[] = [];
  for (const o of others) {
    if (o.id === target.id) continue;
    const from = target.startDate > o.startDate ? target.startDate : o.startDate;
    const to = target.endDate < o.endDate ? target.endDate : o.endDate;
    const overlap = diffDays(from, to) + 1;
    if (overlap <= 0) continue;
    const shared = target.metricIds.filter((m) => o.metricIds.includes(m));
    if (shared.length === 0) continue;
    out.push({ otherExperimentId: o.id, otherTitle: o.title, sharedMetrics: shared, overlapDays: overlap });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Baseline contamination: with one experiment at a time, the remaining risk is
// that the new comparison window reaches back into an earlier experiment's
// intervention or washout, so "baseline" would already contain an effect.
// ---------------------------------------------------------------------------

export interface BaselineContamination {
  otherExperimentId: string;
  otherTitle: string;
  phaseType: 'intervention' | 'washout';
  overlapDays: number;
  /** Last day of the overlapping phase: starting after it keeps the baseline clean. */
  phaseEndDate: ISODate;
}

export function findBaselineContamination(
  baseline: { from: ISODate; to: ISODate },
  others: { id: string; title: string; phases: { type: string; startDate: ISODate; endDate: ISODate }[] }[],
): BaselineContamination[] {
  const out: BaselineContamination[] = [];
  for (const o of others) {
    for (const p of o.phases) {
      if (p.type !== 'intervention' && p.type !== 'washout') continue;
      const from = baseline.from > p.startDate ? baseline.from : p.startDate;
      const to = baseline.to < p.endDate ? baseline.to : p.endDate;
      const overlap = diffDays(from, to) + 1;
      if (overlap <= 0) continue;
      out.push({ otherExperimentId: o.id, otherTitle: o.title, phaseType: p.type, overlapDays: overlap, phaseEndDate: p.endDate });
    }
  }
  return out;
}
