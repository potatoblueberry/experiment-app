/**
 * Builds the N-of-1 phase structure for an experiment and recommends how long the
 * baseline comparison window should be, based on how clean the recent data is.
 *
 * Two different "baselines" live in this app:
 *  - the personal baseline MODEL (stats.ts) uses all history: variability, weekday
 *    pattern, long-term trend;
 *  - the baseline PHASE of an experiment is the 4–8 week comparison window right
 *    before the intervention. Reaching further back would compare against a
 *    different life (different season, job, illness), so it is kept short.
 */
import type { DesignType, ExperimentPhase, ISODate, MetricId, MetricReading, PhaseType } from './types';
import { addDays, diffDays, eachDay } from '../utils/dates';

export const DEFAULT_INTERVENTION_WEEKS = 6;
export const INTERVENTION_WEEK_OPTIONS = [2, 4, 6, 8, 12];
export const DEFAULT_WASHOUT_DAYS = 14;
export const MIN_BASELINE_DAYS = 28;
export const MAX_BASELINE_DAYS = 56;

export interface PhasePlan {
  type: PhaseType;
  order: number;
  startDate: ISODate;
  endDate: ISODate;
}

export interface BuildPhasesInput {
  designType: DesignType;
  startDate: ISODate; // first day of the behaviour (run-in if any, else intervention)
  baselineDays: number;
  runInDays?: number;
  interventionDays: number;
  washoutDays?: number;
}

/** Lays the phases back to back: baseline | run-in (optional) | intervention | washout (ABA). */
export function buildPhasePlan(input: BuildPhasesInput): PhasePlan[] {
  const { startDate, baselineDays, interventionDays } = input;
  const runInDays = input.runInDays ?? 0;
  const plan: PhasePlan[] = [{ type: 'baseline', order: 0, startDate: addDays(startDate, -baselineDays), endDate: addDays(startDate, -1) }];
  let cursor = startDate;
  if (runInDays > 0) {
    plan.push({ type: 'run_in', order: plan.length, startDate: cursor, endDate: addDays(cursor, runInDays - 1) });
    cursor = addDays(cursor, runInDays);
  }
  plan.push({ type: 'intervention', order: plan.length, startDate: cursor, endDate: addDays(cursor, interventionDays - 1) });
  cursor = addDays(cursor, interventionDays);
  if (input.designType === 'ABA') {
    const washoutDays = input.washoutDays ?? DEFAULT_WASHOUT_DAYS;
    plan.push({ type: 'washout', order: plan.length, startDate: cursor, endDate: addDays(cursor, washoutDays - 1) });
  }
  return plan;
}

/** First phase in which the user actually does the behaviour (run-in if present, else intervention). */
export function firstActivePhase(phases: ExperimentPhase[]): ExperimentPhase | undefined {
  return phases.filter((p) => p.type !== 'baseline').sort((a, b) => a.order - b.order)[0];
}

export function phaseLengthDays(p: { startDate: ISODate; endDate: ISODate }): number {
  return diffDays(p.startDate, p.endDate) + 1;
}

export function phaseFor(phases: ExperimentPhase[], date: ISODate): ExperimentPhase | undefined {
  return phases.find((p) => date >= p.startDate && date <= p.endDate);
}

export function interventionPhase(phases: ExperimentPhase[]): ExperimentPhase | undefined {
  return phases.find((p) => p.type === 'intervention');
}

export function baselinePhase(phases: ExperimentPhase[]): ExperimentPhase | undefined {
  return phases.find((p) => p.type === 'baseline');
}

// ---------------------------------------------------------------------------
// Baseline length recommendation
// ---------------------------------------------------------------------------

export interface BaselineRecommendation {
  days: number;
  /** 0–1 share of days with readings in the recommended window. */
  coverage: number;
  flaggedDays: number;
  reason: string;
}

/**
 * Looks at the 8 weeks before `startDate`. If the data there is complete and free
 * of illness/travel days, use all 8 weeks; otherwise fall back to 6 or the 4-week
 * minimum. "Clean" means ≥ 90% of days have readings and ≤ 3 flagged days.
 */
export function recommendBaselineDays(
  readings: MetricReading[],
  metricIds: MetricId[],
  startDate: ISODate,
): BaselineRecommendation {
  const ids = new Set(metricIds);
  const relevant = readings.filter((r) => ids.has(r.metricId) && r.date < startDate && r.date >= addDays(startDate, -MAX_BASELINE_DAYS));
  const byDate = new Map<ISODate, { n: number; flagged: boolean }>();
  for (const r of relevant) {
    const cur = byDate.get(r.date) ?? { n: 0, flagged: false };
    cur.n += 1;
    cur.flagged = cur.flagged || r.flags.length > 0;
    byDate.set(r.date, cur);
  }

  const evaluate = (days: number) => {
    const window = eachDay(addDays(startDate, -days), addDays(startDate, -1));
    let withData = 0;
    let flagged = 0;
    for (const d of window) {
      const e = byDate.get(d);
      if (e && e.n > 0) withData += 1;
      if (e?.flagged) flagged += 1;
    }
    return { coverage: withData / window.length, flagged };
  };

  for (const days of [56, 42, 28]) {
    const { coverage, flagged } = evaluate(days);
    const clean = coverage >= 0.9 && flagged <= 3;
    if (clean || days === MIN_BASELINE_DAYS) {
      const weeks = days / 7;
      let reason: string;
      if (days === 56) reason = `The last 8 weeks are complete and free of disruptions, so all of them are used as the comparison window.`;
      else if (days === 42) reason = `The last 6 weeks are clean; going back further would include days with gaps or disruptions.`;
      else if (clean) reason = `The last 4 weeks are clean. Longer windows included gaps or flagged days, so the comparison stays at the 4-week minimum.`;
      else reason = `Recent data has gaps or flagged days (${Math.round(coverage * 100)}% coverage, ${flagged} flagged). The minimum 4-week window is used; results will carry more uncertainty.`;
      return { days, coverage, flaggedDays: flagged, reason: `${weeks} weeks. ${reason}` };
    }
  }
  // unreachable, but keeps TypeScript happy
  return { days: MIN_BASELINE_DAYS, coverage: 0, flaggedDays: 0, reason: '4 weeks.' };
}

/** Plain-language copy for the duration step. */
export function durationExplanation(weeks: number): string {
  if (weeks <= 2) return 'Two weeks is rarely enough. Night-to-night noise is large and a single bad week can hide or fake an effect.';
  if (weeks <= 4) return 'Four weeks covers each weekday four times, which is the minimum for separating a real change from weekly rhythm.';
  if (weeks <= 6) return 'Six weeks is a good default: enough days to shrink the uncertainty band and to see whether the effect holds up.';
  if (weeks <= 8) return 'Eight weeks gives tight uncertainty bands. The trade-off is staying consistent for two months.';
  return 'Twelve weeks is excellent statistically, but long enough that season and life changes start to blur the comparison.';
}
