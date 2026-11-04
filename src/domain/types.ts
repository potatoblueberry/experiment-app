/**
 * Core data model. Each interface mirrors a future Postgres table (name in the
 * comment). TypeScript uses camelCase; the database will use snake_case and the
 * SupabaseRepository will translate in one place.
 */

export type ISODate = string; // 'YYYY-MM-DD', local calendar day
export type ISODateTime = string; // full ISO timestamp
export type UUID = string;

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export type MetricId =
  | 'sleep_duration'
  | 'sleep_efficiency'
  | 'hrv'
  | 'resting_hr'
  | 'readiness'
  | 'steps'
  | 'temp_deviation';

/** table: metric_definitions (reference data, same for every user) */
export interface MetricDefinition {
  id: MetricId;
  name: string;
  shortName: string;
  unit: string;
  decimals: number;
  /** null = neutral, e.g. temperature deviation where 0 is ideal */
  higherIsBetter: boolean | null;
  description: string;
}

export type DataSourceProvider = 'oura' | 'manual';

/** Markers on a day that the stats should treat with care. */
export type ReadingFlag = 'illness' | 'travel' | 'alcohol' | 'outlier';

/** table: metric_readings — UNIQUE (user_id, metric_id, date) */
export interface MetricReading {
  id: UUID;
  userId: UUID;
  metricId: MetricId;
  date: ISODate;
  value: number;
  source: DataSourceProvider;
  flags: ReadingFlag[];
  syncedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

/** AB = baseline then intervention. ABA = baseline, intervention, washout (return to baseline). */
export type DesignType = 'AB' | 'ABA';
export type ExperimentStatus = 'active' | 'completed' | 'abandoned';
/** Only daily yes/no for now; room for 'daily_count' or 'daily_duration' later. */
export type AdherenceType = 'daily_boolean';
export type PhaseType = 'baseline' | 'intervention' | 'washout';
export type ExpectedDirection = 'increase' | 'decrease' | 'any';

/** table: experiments */
export interface Experiment {
  id: UUID;
  userId: UUID;
  title: string;
  behaviorChange: string;
  behaviorPresetId: string | null;
  adherenceType: AdherenceType;
  designType: DesignType;
  status: ExperimentStatus;
  /** First day of the intervention phase. */
  startDate: ISODate;
  /** Planned last day of the final phase. */
  endDate: ISODate;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** table: experiment_phases */
export interface ExperimentPhase {
  id: UUID;
  experimentId: UUID;
  type: PhaseType;
  order: number;
  startDate: ISODate;
  endDate: ISODate;
}

/** table: experiment_outcome_metrics */
export interface ExperimentOutcomeMetric {
  id: UUID;
  experimentId: UUID;
  metricId: MetricId;
  isPrimary: boolean;
  expectedDirection: ExpectedDirection;
}

/** table: adherence_logs — UNIQUE (experiment_id, date) */
export interface AdherenceLog {
  id: UUID;
  experimentId: UUID;
  date: ISODate;
  adhered: boolean;
  note: string | null;
  loggedAt: ISODateTime;
}

/** table: data_source_connections */
export interface DataSourceConnection {
  id: UUID;
  userId: UUID;
  provider: DataSourceProvider;
  status: 'connected' | 'disconnected' | 'error';
  lastSyncAt: ISODateTime | null;
  /** Last day the provider sync covered; the next incremental sync starts a week before it. */
  syncedThrough?: ISODate | null;
  lastError?: string | null;
}

// ---------------------------------------------------------------------------
// Composite shapes used by the UI (not tables)
// ---------------------------------------------------------------------------

export interface ExperimentDetail extends Experiment {
  phases: ExperimentPhase[];
  outcomeMetrics: ExperimentOutcomeMetric[];
}

export interface OutcomeMetricInput {
  metricId: MetricId;
  isPrimary: boolean;
  expectedDirection: ExpectedDirection;
}

export interface CreateExperimentInput {
  title: string;
  behaviorChange: string;
  behaviorPresetId: string | null;
  adherenceType: AdherenceType;
  designType: DesignType;
  startDate: ISODate;
  baselineDays: number;
  interventionDays: number;
  /** Only used for ABA designs. */
  washoutDays?: number;
  outcomeMetrics: OutcomeMetricInput[];
}

export interface ReadingQuery {
  metricIds?: MetricId[];
  from?: ISODate;
  to?: ISODate;
}

export interface LogAdherenceInput {
  experimentId: UUID;
  date: ISODate;
  adhered: boolean;
  note?: string | null;
}
