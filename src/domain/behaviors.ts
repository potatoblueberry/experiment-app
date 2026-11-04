/**
 * Curated experiment protocols. The app designs the experiment and fixes its
 * scientific boundaries (run-in, minimum length, washout rule, primary outcome);
 * the user chooses within them (length above the minimum, secondary metrics,
 * start date, washout unless required). There is no free-form experiment: a
 * vague behaviour cannot be answered with a daily yes/no, and the boundaries
 * are what make results valid.
 */
import type { ExpectedDirection, MetricId, OutcomeMetricInput } from './types';

export type WashoutRule = 'required' | 'recommended' | 'optional';

export interface BehaviorPreset {
  id: string;
  title: string;
  /** Default behaviour description, phrased so a daily yes/no is obvious. */
  description: string;
  /** Metrics the app proposes, in order; the first one is the primary outcome and is fixed. */
  suggestedMetrics: { metricId: MetricId; direction: ExpectedDirection }[];
  /**
   * Days at the start where the user already does the behaviour but the data is
   * NOT counted as intervention: adaptation or withdrawal effects would otherwise
   * be mistaken for the effect itself. 0 = none.
   */
  runInDays: number;
  /** Shown to the user when runInDays > 0. */
  runInNote?: string;
  /** Shortest intervention the protocol accepts, in whole weeks. */
  minWeeks: number;
  defaultWeeks: number;
  washout: WashoutRule;
  /** True when the behaviour has carry-over effects (derived from the washout rule). */
  carryOver: boolean;
  /** One line explaining why these metrics were proposed. */
  rationale: string;
  /** Plain-language rules shown on the protocol card. */
  rules: string[];
}

function preset(p: Omit<BehaviorPreset, 'carryOver'>): BehaviorPreset {
  return { ...p, carryOver: p.washout !== 'optional' };
}

export const BEHAVIOR_PRESETS: BehaviorPreset[] = [
  preset({
    id: 'morning_sunlight',
    title: 'Morning sunlight',
    description: 'Get 10+ minutes of outdoor light within an hour of waking.',
    suggestedMetrics: [
      { metricId: 'readiness', direction: 'increase' },
      { metricId: 'sleep_duration', direction: 'increase' },
      { metricId: 'sleep_efficiency', direction: 'increase' },
      { metricId: 'hrv', direction: 'increase' },
    ],
    runInDays: 0,
    minWeeks: 4,
    defaultWeeks: 6,
    washout: 'optional',
    rationale: 'Morning light anchors the circadian clock, which mostly shows up in sleep quality and recovery.',
    rules: ['At least 4 weeks', 'No run-in needed: the effect builds within days', 'Washout optional'],
  }),
  preset({
    id: 'no_caffeine',
    title: 'No caffeine',
    description: 'No coffee, tea, energy drinks or other caffeine at any time of day.',
    suggestedMetrics: [
      { metricId: 'sleep_efficiency', direction: 'increase' },
      { metricId: 'sleep_duration', direction: 'increase' },
      { metricId: 'resting_hr', direction: 'decrease' },
      { metricId: 'hrv', direction: 'increase' },
    ],
    runInDays: 7,
    runInNote: 'The first week is caffeine withdrawal: headaches, worse sleep and tiredness are common. You already follow the rule and log it daily, but those days are not counted as intervention, so withdrawal cannot be mistaken for the effect of being caffeine-free.',
    minWeeks: 4,
    defaultWeeks: 6,
    washout: 'recommended',
    rationale: 'Caffeine has a long half-life, so even morning intake fragments sleep and keeps the night-time heart rate up.',
    rules: ['1-week withdrawal period first, not counted', 'Then at least 4 weeks caffeine-free', 'Washout recommended: reintroduce and watch the effect reverse'],
  }),
  preset({
    id: 'daily_sauna',
    title: 'Daily sauna',
    description: 'At least 15 minutes of sauna every day.',
    suggestedMetrics: [
      { metricId: 'hrv', direction: 'increase' },
      { metricId: 'resting_hr', direction: 'decrease' },
      { metricId: 'sleep_duration', direction: 'increase' },
    ],
    runInDays: 3,
    runInNote: 'The first 3 days are an adaptation period: heat stress initially raises heart rate and disturbs sleep. They are logged but not counted.',
    minWeeks: 4,
    defaultWeeks: 6,
    washout: 'recommended',
    rationale: 'Heat exposure trains the cardiovascular system, which shows up first in HRV and resting heart rate.',
    rules: ['3-day adaptation period, not counted', 'Then at least 4 weeks', 'Washout recommended'],
  }),
];

/** Kept for stored experiments created before protocols were curated; not offered in the wizard. */
export const CUSTOM_PRESET_ID = 'custom';

export const CUSTOM_SUGGESTED_METRICS: { metricId: MetricId; direction: ExpectedDirection }[] = [
  { metricId: 'hrv', direction: 'increase' },
  { metricId: 'sleep_duration', direction: 'increase' },
  { metricId: 'readiness', direction: 'increase' },
];

export function getPreset(id: string | null): BehaviorPreset | undefined {
  return BEHAVIOR_PRESETS.find((p) => p.id === id);
}

export function suggestedOutcomeMetrics(presetId: string | null): OutcomeMetricInput[] {
  const list = getPreset(presetId)?.suggestedMetrics ?? CUSTOM_SUGGESTED_METRICS;
  return list.map((m, i) => ({ metricId: m.metricId, expectedDirection: m.direction, isPrimary: i === 0 }));
}

/** Week choices the protocol allows, never below its minimum. */
export function allowedWeeks(p: BehaviorPreset, options: number[]): number[] {
  return options.filter((w) => w >= p.minWeeks);
}
