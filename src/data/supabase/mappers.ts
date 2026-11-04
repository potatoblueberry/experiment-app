/**
 * The ONLY place where database rows (snake_case) and domain objects
 * (camelCase) meet. Row interfaces mirror supabase/migrations/*_init.sql.
 */
import type {
  AdherenceLog,
  AdherenceType,
  DataSourceConnection,
  DataSourceProvider,
  DesignType,
  Experiment,
  ExperimentDetail,
  ExperimentOutcomeMetric,
  ExperimentPhase,
  ExperimentStatus,
  ExpectedDirection,
  MetricId,
  MetricReading,
  PhaseType,
  ReadingFlag,
} from '../../domain/types';

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface DataSourceConnectionRow {
  id: string;
  user_id: string;
  provider: DataSourceProvider;
  status: DataSourceConnection['status'];
  last_sync_at: string | null;
  synced_through?: string | null;
  last_error?: string | null;
  created_at?: string;
}

export interface MetricReadingRow {
  id: string;
  user_id: string;
  metric_id: MetricId;
  date: string;
  value: number;
  source: DataSourceProvider;
  flags: ReadingFlag[];
  synced_at: string;
}

export interface ExperimentRow {
  id: string;
  user_id: string;
  title: string;
  behavior_change: string;
  behavior_preset_id: string | null;
  adherence_type: AdherenceType;
  design_type: DesignType;
  status: ExperimentStatus;
  start_date: string;
  end_date: string;
  created_at: string;
  updated_at: string;
}

export interface ExperimentPhaseRow {
  id: string;
  experiment_id: string;
  type: PhaseType;
  order: number;
  start_date: string;
  end_date: string;
}

export interface ExperimentOutcomeMetricRow {
  id: string;
  experiment_id: string;
  metric_id: MetricId;
  is_primary: boolean;
  expected_direction: ExpectedDirection;
}

export interface AdherenceLogRow {
  id: string;
  experiment_id: string;
  date: string;
  adhered: boolean;
  note: string | null;
  logged_at: string;
}

export interface ExperimentRowWithChildren extends ExperimentRow {
  experiment_phases: ExperimentPhaseRow[];
  experiment_outcome_metrics: ExperimentOutcomeMetricRow[];
}

// ---------------------------------------------------------------------------
// Row -> domain
// ---------------------------------------------------------------------------

export function rowToSource(r: DataSourceConnectionRow): DataSourceConnection {
  return { id: r.id, userId: r.user_id, provider: r.provider, status: r.status, lastSyncAt: r.last_sync_at, syncedThrough: r.synced_through ?? null, lastError: r.last_error ?? null };
}

export function rowToReading(r: MetricReadingRow): MetricReading {
  return { id: r.id, userId: r.user_id, metricId: r.metric_id, date: r.date, value: r.value, source: r.source, flags: r.flags ?? [], syncedAt: r.synced_at };
}

export function rowToExperiment(r: ExperimentRow): Experiment {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    behaviorChange: r.behavior_change,
    behaviorPresetId: r.behavior_preset_id,
    adherenceType: r.adherence_type,
    designType: r.design_type,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rowToPhase(r: ExperimentPhaseRow): ExperimentPhase {
  return { id: r.id, experimentId: r.experiment_id, type: r.type, order: r.order, startDate: r.start_date, endDate: r.end_date };
}

export function rowToOutcomeMetric(r: ExperimentOutcomeMetricRow): ExperimentOutcomeMetric {
  return { id: r.id, experimentId: r.experiment_id, metricId: r.metric_id, isPrimary: r.is_primary, expectedDirection: r.expected_direction };
}

export function rowToAdherence(r: AdherenceLogRow): AdherenceLog {
  return { id: r.id, experimentId: r.experiment_id, date: r.date, adhered: r.adhered, note: r.note, loggedAt: r.logged_at };
}

export function rowToExperimentDetail(r: ExperimentRowWithChildren): ExperimentDetail {
  return {
    ...rowToExperiment(r),
    phases: (r.experiment_phases ?? []).map(rowToPhase).sort((a, b) => a.order - b.order),
    outcomeMetrics: (r.experiment_outcome_metrics ?? []).map(rowToOutcomeMetric),
  };
}

// ---------------------------------------------------------------------------
// Domain -> row (for inserts)
// ---------------------------------------------------------------------------

export function sourceToRow(s: DataSourceConnection): DataSourceConnectionRow {
  return { id: s.id, user_id: s.userId, provider: s.provider, status: s.status, last_sync_at: s.lastSyncAt };
}

/** Readings generated locally carry non-UUID ids, so the database assigns ids. */
export function readingToRow(r: MetricReading): Omit<MetricReadingRow, 'id'> {
  return { user_id: r.userId, metric_id: r.metricId, date: r.date, value: r.value, source: r.source, flags: r.flags, synced_at: r.syncedAt };
}

export function experimentToRow(e: Experiment): ExperimentRow {
  return {
    id: e.id,
    user_id: e.userId,
    title: e.title,
    behavior_change: e.behaviorChange,
    behavior_preset_id: e.behaviorPresetId,
    adherence_type: e.adherenceType,
    design_type: e.designType,
    status: e.status,
    start_date: e.startDate,
    end_date: e.endDate,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

export function phaseToRow(p: ExperimentPhase): ExperimentPhaseRow {
  return { id: p.id, experiment_id: p.experimentId, type: p.type, order: p.order, start_date: p.startDate, end_date: p.endDate };
}

export function outcomeMetricToRow(m: ExperimentOutcomeMetric): ExperimentOutcomeMetricRow {
  return { id: m.id, experiment_id: m.experimentId, metric_id: m.metricId, is_primary: m.isPrimary, expected_direction: m.expectedDirection };
}

export function adherenceToRow(a: AdherenceLog): AdherenceLogRow {
  return { id: a.id, experiment_id: a.experimentId, date: a.date, adhered: a.adhered, note: a.note, logged_at: a.loggedAt };
}
