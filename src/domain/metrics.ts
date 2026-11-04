import type { MetricDefinition, MetricId } from './types';

/**
 * The metric catalog. Mirrors the future metric_definitions table. Order here is
 * the order metrics appear in pickers.
 */
export const METRICS: Record<MetricId, MetricDefinition> = {
  sleep_duration: {
    id: 'sleep_duration',
    name: 'Sleep duration',
    shortName: 'Sleep',
    unit: 'h',
    decimals: 1,
    higherIsBetter: true,
    description: 'Total time asleep for the night ending on this day.',
  },
  sleep_efficiency: {
    id: 'sleep_efficiency',
    name: 'Sleep efficiency',
    shortName: 'Efficiency',
    unit: '%',
    decimals: 0,
    higherIsBetter: true,
    description: 'Share of time in bed actually spent asleep.',
  },
  hrv: {
    id: 'hrv',
    name: 'Heart rate variability',
    shortName: 'HRV',
    unit: 'ms',
    decimals: 0,
    higherIsBetter: true,
    description: 'Average overnight HRV (rMSSD). Higher usually means better recovery.',
  },
  resting_hr: {
    id: 'resting_hr',
    name: 'Resting heart rate',
    shortName: 'Resting HR',
    unit: 'bpm',
    decimals: 0,
    higherIsBetter: false,
    description: 'Lowest sustained heart rate during the night.',
  },
  readiness: {
    id: 'readiness',
    name: 'Readiness score',
    shortName: 'Readiness',
    unit: '',
    decimals: 0,
    higherIsBetter: true,
    description: "Oura's combined recovery score from 0 to 100.",
  },
  steps: {
    id: 'steps',
    name: 'Steps',
    shortName: 'Steps',
    unit: 'steps',
    decimals: 0,
    higherIsBetter: true,
    description: 'Daily step count.',
  },
  temp_deviation: {
    id: 'temp_deviation',
    name: 'Body temperature deviation',
    shortName: 'Temp dev.',
    unit: '°C',
    decimals: 2,
    higherIsBetter: null,
    description: 'Skin temperature compared with your personal norm. Spikes often mean illness.',
  },
};

export const METRIC_IDS: MetricId[] = [
  'sleep_duration',
  'sleep_efficiency',
  'hrv',
  'resting_hr',
  'readiness',
  'steps',
  'temp_deviation',
];

export const METRIC_LIST: MetricDefinition[] = METRIC_IDS.map((id) => METRICS[id]);

function unitSuffix(unit: string): string {
  if (!unit) return '';
  return unit === '%' || unit === '°C' ? unit : ` ${unit}`;
}

export function formatMetricValue(metricId: MetricId, value: number, withUnit = true): string {
  const def = METRICS[metricId];
  let text: string;
  if (metricId === 'steps') {
    text = Math.round(value).toLocaleString('en-US');
  } else if (metricId === 'temp_deviation') {
    text = (value >= 0 ? '+' : '') + value.toFixed(def.decimals);
  } else {
    text = value.toFixed(def.decimals);
  }
  return withUnit ? text + unitSuffix(def.unit) : text;
}

/** Signed delta string like "+0.4 h" or "−3 bpm". */
export function formatMetricDelta(metricId: MetricId, delta: number, withUnit = true): string {
  const def = METRICS[metricId];
  const abs = Math.abs(delta);
  const text = metricId === 'steps' ? Math.round(abs).toLocaleString('en-US') : abs.toFixed(def.decimals);
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  return `${sign}${text}${withUnit ? unitSuffix(def.unit) : ''}`;
}

/** Compact axis label: 8.5k for steps, otherwise the plain number. */
export function formatAxisValue(metricId: MetricId, value: number): string {
  if (metricId === 'steps') return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : String(Math.round(value));
  if (metricId === 'temp_deviation') return (value > 0 ? '+' : '') + value.toFixed(1);
  const def = METRICS[metricId];
  return value.toFixed(Math.min(def.decimals, 1));
}
