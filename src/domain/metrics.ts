import type { DataSourceConnection, DataSourceProvider, MetricDefinition, MetricId } from './types';

/**
 * The metric catalog. Mirrors the metric_definitions table. Order here is the
 * order metrics appear in pickers. `hidden` metrics are stored and used by the
 * automatic flagging (e.g. time-zone offset) but never shown as a chart.
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
  sleep_latency: {
    id: 'sleep_latency',
    name: 'Sleep latency',
    shortName: 'Latency',
    unit: 'min',
    decimals: 0,
    higherIsBetter: false,
    description: 'Minutes from going to bed to falling asleep.',
  },
  awake_time: {
    id: 'awake_time',
    name: 'Time awake at night',
    shortName: 'Awake',
    unit: 'min',
    decimals: 0,
    higherIsBetter: false,
    description: 'Minutes awake during the night after first falling asleep.',
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
  sleep_hr: {
    id: 'sleep_hr',
    name: 'Average sleep heart rate',
    shortName: 'Sleep HR',
    unit: 'bpm',
    decimals: 0,
    higherIsBetter: false,
    description: 'Average heart rate across the whole night. Rises with alcohol, caffeine, late meals and illness.',
  },
  respiratory_rate: {
    id: 'respiratory_rate',
    name: 'Respiratory rate',
    shortName: 'Breaths',
    unit: '/min',
    decimals: 1,
    higherIsBetter: null,
    description: 'Average breaths per minute during sleep. A rise often precedes illness.',
  },
  readiness: {
    id: 'readiness',
    name: 'Readiness score',
    shortName: 'Readiness',
    unit: '',
    decimals: 0,
    higherIsBetter: true,
    description: 'Oura combined recovery score 0–100.',
  },
  bedtime: {
    id: 'bedtime',
    name: 'Bedtime',
    shortName: 'Bedtime',
    unit: 'h',
    decimals: 2,
    higherIsBetter: null,
    description: 'When you fell asleep. Stored as hours past midnight of the previous day (23.5 = 23:30, 25.0 = 01:00).',
  },
  daytime_stress: {
    id: 'daytime_stress',
    name: 'Daytime stress',
    shortName: 'Stress',
    unit: 'min',
    decimals: 0,
    higherIsBetter: false,
    description: 'Minutes Oura classified as high stress during the day.',
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
  active_calories: {
    id: 'active_calories',
    name: 'Active calories',
    shortName: 'Activity',
    unit: 'kcal',
    decimals: 0,
    higherIsBetter: null,
    description: 'Energy spent on activity. A proxy for training load.',
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
  tz_offset: {
    id: 'tz_offset',
    name: 'Time zone offset',
    shortName: 'Time zone',
    unit: 'h',
    decimals: 1,
    higherIsBetter: null,
    description: 'UTC offset of the night. Changes mark travel.',
    hidden: true,
  },
};

export const METRIC_IDS: MetricId[] = [
  'sleep_duration',
  'sleep_efficiency',
  'sleep_latency',
  'awake_time',
  'hrv',
  'resting_hr',
  'sleep_hr',
  'respiratory_rate',
  'readiness',
  'bedtime',
  'daytime_stress',
  'steps',
  'active_calories',
  'temp_deviation',
  'tz_offset',
];

export const METRIC_LIST: MetricDefinition[] = METRIC_IDS.map((id) => METRICS[id]);

/** Metrics shown in pickers and charts (hidden ones are internal). */
export const VISIBLE_METRIC_IDS: MetricId[] = METRIC_IDS.filter((id) => !METRICS[id].hidden);
export const VISIBLE_METRIC_LIST: MetricDefinition[] = VISIBLE_METRIC_IDS.map((id) => METRICS[id]);

function unitSuffix(unit: string): string {
  if (!unit) return '';
  return unit === '%' || unit === '°C' || unit === '/min' ? unit : ` ${unit}`;
}

/** 23.5 -> "23:30", 25.25 -> "01:15". */
export function formatClock(hoursPastMidnight: number): string {
  const total = Math.round(hoursPastMidnight * 60);
  const h = ((Math.floor(total / 60) % 24) + 24) % 24;
  const m = ((total % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatMetricValue(metricId: MetricId, value: number, withUnit = true): string {
  const def = METRICS[metricId];
  let text: string;
  if (metricId === 'steps') {
    text = Math.round(value).toLocaleString('en-US');
  } else if (metricId === 'temp_deviation') {
    text = (value >= 0 ? '+' : '') + value.toFixed(def.decimals);
  } else if (metricId === 'bedtime') {
    return formatClock(value);
  } else {
    text = value.toFixed(def.decimals);
  }
  return withUnit ? text + unitSuffix(def.unit) : text;
}

/** Signed delta string like "+0.4 h" or "−3 bpm". Bedtime deltas are shown in minutes. */
export function formatMetricDelta(metricId: MetricId, delta: number, withUnit = true): string {
  const def = METRICS[metricId];
  const abs = Math.abs(delta);
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  if (metricId === 'bedtime') return `${sign}${Math.round(abs * 60)}${withUnit ? ' min' : ''}`;
  const text = metricId === 'steps' ? Math.round(abs).toLocaleString('en-US') : abs.toFixed(def.decimals);
  return `${sign}${text}${withUnit ? unitSuffix(def.unit) : ''}`;
}

/** Compact axis label: 8.5k for steps, 23:30 for bedtime, otherwise the plain number. */
export function formatAxisValue(metricId: MetricId, value: number): string {
  if (metricId === 'steps') return value >= 1000 ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k` : String(Math.round(value));
  if (metricId === 'temp_deviation') return (value > 0 ? '+' : '') + value.toFixed(1);
  if (metricId === 'bedtime') return formatClock(value);
  const def = METRICS[metricId];
  return value.toFixed(Math.min(def.decimals, 1));
}

// ---------------------------------------------------------------------------
// Which data source supplies which metric
// ---------------------------------------------------------------------------

/** Metrics each provider can deliver. Order of PROVIDER_PRIORITY decides when several could. */
export const PROVIDER_METRICS: Record<DataSourceProvider, MetricId[]> = {
  oura: [...METRIC_IDS],
  manual: [],
};

export const PROVIDER_PRIORITY: DataSourceProvider[] = ['oura', 'manual'];

export const PROVIDER_NAMES: Record<DataSourceProvider, string> = { oura: 'Oura', manual: 'Manual' };

/**
 * The single connected source a metric will come from, or null when none of the
 * connected sources provides it. A metric never mixes sources: if two could
 * supply it, the first in PROVIDER_PRIORITY wins.
 */
export function metricProvider(metricId: MetricId, sources: Pick<DataSourceConnection, 'provider' | 'status'>[]): DataSourceProvider | null {
  const connected = new Set(sources.filter((s) => s.status === 'connected').map((s) => s.provider));
  return PROVIDER_PRIORITY.find((p) => connected.has(p) && PROVIDER_METRICS[p].includes(metricId)) ?? null;
}
