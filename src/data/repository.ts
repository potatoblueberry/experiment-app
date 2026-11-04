/**
 * The single door to all data. Screens and hooks only ever talk to this
 * interface. Today it is implemented by LocalMockRepository (AsyncStorage +
 * fake Oura data); later a SupabaseRepository implements the same methods.
 */
import type {
  AdherenceLog,
  CreateExperimentInput,
  DataSourceConnection,
  Experiment,
  ExperimentDetail,
  ExperimentStatus,
  LogAdherenceInput,
  MetricDefinition,
  MetricReading,
  ReadingQuery,
  UUID,
} from '../domain/types';

export interface Repository {
  // Sources
  getSources(): Promise<DataSourceConnection[]>;

  // Metrics
  getMetricDefinitions(): Promise<MetricDefinition[]>;
  getReadings(query?: ReadingQuery): Promise<MetricReading[]>;

  // Experiments
  listExperiments(filter?: { status?: ExperimentStatus[] }): Promise<Experiment[]>;
  listExperimentDetails(filter?: { status?: ExperimentStatus[] }): Promise<ExperimentDetail[]>;
  getExperiment(id: UUID): Promise<ExperimentDetail | null>;
  createExperiment(input: CreateExperimentInput): Promise<ExperimentDetail>;
  updateExperimentStatus(id: UUID, status: ExperimentStatus): Promise<void>;

  // Adherence
  getAdherenceLogs(experimentId: UUID): Promise<AdherenceLog[]>;
  getAllAdherenceLogs(): Promise<AdherenceLog[]>;
  /** Upsert: logging the same day twice overwrites, which is how past days get edited. */
  logAdherence(input: LogAdherenceInput): Promise<AdherenceLog>;

  // Dev helpers
  resetToSeed(): Promise<void>;
}
