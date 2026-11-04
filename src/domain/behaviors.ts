import type { ExpectedDirection, MetricId, OutcomeMetricInput } from './types';

export interface BehaviorPreset {
  id: string;
  title: string;
  /** Shown as a sub-line and used as the default behaviour description. */
  description: string;
  /** Metrics the app proposes, in order; the first one is the primary outcome. */
  suggestedMetrics: { metricId: MetricId; direction: ExpectedDirection }[];
  /** True when the behaviour has carry-over effects, so a washout phase is recommended. */
  carryOver: boolean;
  /** One line explaining why these metrics were proposed. */
  rationale: string;
}

export const BEHAVIOR_PRESETS: BehaviorPreset[] = [
  {
    id: 'morning_sunlight',
    title: 'Morning sunlight',
    description: 'Get 10+ minutes of outdoor light within an hour of waking.',
    suggestedMetrics: [
      { metricId: 'readiness', direction: 'increase' },
      { metricId: 'sleep_duration', direction: 'increase' },
      { metricId: 'sleep_efficiency', direction: 'increase' },
      { metricId: 'hrv', direction: 'increase' },
    ],
    carryOver: false,
    rationale: 'Morning light anchors the circadian clock, which mostly shows up in sleep quality and recovery.',
  },
  {
    id: 'no_caffeine',
    title: 'No caffeine',
    description: 'No coffee, tea, energy drinks or other caffeine at any time of day.',
    suggestedMetrics: [
      { metricId: 'sleep_efficiency', direction: 'increase' },
      { metricId: 'sleep_duration', direction: 'increase' },
      { metricId: 'resting_hr', direction: 'decrease' },
      { metricId: 'hrv', direction: 'increase' },
    ],
    carryOver: true,
    rationale: 'Caffeine has a long half-life, so even morning intake fragments sleep and keeps the night-time heart rate up.',
  },
  {
    id: 'daily_sauna',
    title: 'Daily sauna',
    description: 'At least 15 minutes of sauna every day.',
    suggestedMetrics: [
      { metricId: 'hrv', direction: 'increase' },
      { metricId: 'resting_hr', direction: 'decrease' },
      { metricId: 'sleep_duration', direction: 'increase' },
    ],
    carryOver: false,
    rationale: 'Heat exposure trains the cardiovascular system, which shows up first in HRV and resting heart rate.',
  },
];

export const CUSTOM_PRESET_ID = 'custom';

/** Sensible defaults when the user types their own behaviour. */
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
