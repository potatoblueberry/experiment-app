/**
 * Repository backed by AsyncStorage (localStorage in the browser). All data is
 * loaded into memory once, mutations write through to storage. On first run it
 * seeds a year of fake Oura data plus two demo experiments.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { METRIC_LIST } from '../domain/metrics';
import { ActiveExperimentExistsError } from '../domain/rules';
import type {
  AdherenceLog,
  CreateExperimentInput,
  DataSourceConnection,
  Experiment,
  ExperimentDetail,
  ExperimentOutcomeMetric,
  ExperimentPhase,
  ExperimentStatus,
  LogAdherenceInput,
  MetricDefinition,
  MetricReading,
  ReadingQuery,
  UUID,
} from '../domain/types';
import { nowISO, today } from '../utils/dates';
import type { Repository } from './repository';
import { buildDemoSeed, effectWindowsFor, materializeExperiment, stripDetail, uuid } from './seed/demoSeed';
import { DEMO_USER_ID, generateReadings } from './seed/generateReadings';

const SEED_VERSION = 6; // bumped 2026-11-04: new Oura metrics in the demo set
const KEY = 'n1lab:v1';
const KEYS = {
  meta: `${KEY}:meta`,
  readings: `${KEY}:readings`,
  experiments: `${KEY}:experiments`,
  phases: `${KEY}:phases`,
  outcomeMetrics: `${KEY}:outcomeMetrics`,
  adherence: `${KEY}:adherence`,
  sources: `${KEY}:sources`,
};

interface Meta {
  seedVersion: number;
  readingsEndDate: string;
}

interface State {
  readings: MetricReading[];
  experiments: Experiment[];
  phases: ExperimentPhase[];
  outcomeMetrics: ExperimentOutcomeMetric[];
  adherence: AdherenceLog[];
  sources: DataSourceConnection[];
}

async function readJSON<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export class LocalMockRepository implements Repository {
  private state: State | null = null;
  private initPromise: Promise<State> | null = null;

  private async ensure(): Promise<State> {
    if (this.state) return this.state;
    if (!this.initPromise) this.initPromise = this.load();
    return this.initPromise;
  }

  private async load(): Promise<State> {
    const meta = await readJSON<Meta>(KEYS.meta);
    if (!meta || meta.seedVersion !== SEED_VERSION) {
      this.state = await this.seedAll();
      return this.state;
    }
    const [readings, experiments, phases, outcomeMetrics, adherence, sources] = await Promise.all([
      readJSON<MetricReading[]>(KEYS.readings),
      readJSON<Experiment[]>(KEYS.experiments),
      readJSON<ExperimentPhase[]>(KEYS.phases),
      readJSON<ExperimentOutcomeMetric[]>(KEYS.outcomeMetrics),
      readJSON<AdherenceLog[]>(KEYS.adherence),
      readJSON<DataSourceConnection[]>(KEYS.sources),
    ]);
    const state: State = {
      readings: readings ?? [],
      experiments: experiments ?? [],
      phases: phases ?? [],
      outcomeMetrics: outcomeMetrics ?? [],
      adherence: adherence ?? [],
      sources: sources ?? [],
    };
    // A new day: pretend Oura synced overnight by regenerating the fake history up to today.
    if (meta.readingsEndDate !== today()) {
      state.readings = generateReadings({ endDate: today(), effectWindows: effectWindowsFor(state.experiments, state.phases) });
      state.sources = state.sources.map((s) => ({ ...s, lastSyncAt: nowISO() }));
      await writeJSON(KEYS.readings, state.readings);
      await writeJSON(KEYS.sources, state.sources);
      await writeJSON(KEYS.meta, { seedVersion: SEED_VERSION, readingsEndDate: today() } satisfies Meta);
    }
    this.state = state;
    return state;
  }

  private async persistAll(state: State): Promise<void> {
    await Promise.all([
      writeJSON(KEYS.readings, state.readings),
      writeJSON(KEYS.experiments, state.experiments),
      writeJSON(KEYS.phases, state.phases),
      writeJSON(KEYS.outcomeMetrics, state.outcomeMetrics),
      writeJSON(KEYS.adherence, state.adherence),
      writeJSON(KEYS.sources, state.sources),
      writeJSON(KEYS.meta, { seedVersion: SEED_VERSION, readingsEndDate: today() } satisfies Meta),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Seeding
  // ---------------------------------------------------------------------------

  private async seedAll(): Promise<State> {
    const seed = buildDemoSeed(DEMO_USER_ID, today());
    const state: State = {
      readings: seed.readings,
      experiments: seed.experiments,
      phases: seed.phases,
      outcomeMetrics: seed.outcomeMetrics,
      adherence: seed.adherence,
      sources: seed.sources,
    };
    await this.persistAll(state);
    return state;
  }

  // ---------------------------------------------------------------------------
  // Repository implementation
  // ---------------------------------------------------------------------------

  async getSources(): Promise<DataSourceConnection[]> {
    return [...(await this.ensure()).sources];
  }

  async getMetricDefinitions(): Promise<MetricDefinition[]> {
    return METRIC_LIST;
  }

  async getReadings(query: ReadingQuery = {}): Promise<MetricReading[]> {
    const { readings } = await this.ensure();
    const ids = query.metricIds ? new Set(query.metricIds) : null;
    return readings.filter(
      (r) => (!ids || ids.has(r.metricId)) && (!query.from || r.date >= query.from) && (!query.to || r.date <= query.to),
    );
  }

  async listExperiments(filter?: { status?: ExperimentStatus[] }): Promise<Experiment[]> {
    const { experiments } = await this.ensure();
    const list = filter?.status ? experiments.filter((e) => filter.status!.includes(e.status)) : [...experiments];
    return list.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  }

  async listExperimentDetails(filter?: { status?: ExperimentStatus[] }): Promise<ExperimentDetail[]> {
    const list = await this.listExperiments(filter);
    const state = await this.ensure();
    return list.map((e) => this.withDetail(state, e));
  }

  async getExperiment(id: UUID): Promise<ExperimentDetail | null> {
    const state = await this.ensure();
    const e = state.experiments.find((x) => x.id === id);
    return e ? this.withDetail(state, e) : null;
  }

  private withDetail(state: State, e: Experiment): ExperimentDetail {
    return {
      ...e,
      phases: state.phases.filter((p) => p.experimentId === e.id).sort((a, b) => a.order - b.order),
      outcomeMetrics: state.outcomeMetrics.filter((m) => m.experimentId === e.id),
    };
  }

  async createExperiment(input: CreateExperimentInput): Promise<ExperimentDetail> {
    const state = await this.ensure();
    if (state.experiments.some((e) => e.status === 'active')) throw new ActiveExperimentExistsError();
    const detail = materializeExperiment(input, 'active', DEMO_USER_ID);
    state.experiments.push(stripDetail(detail));
    state.phases.push(...detail.phases);
    state.outcomeMetrics.push(...detail.outcomeMetrics);
    await Promise.all([
      writeJSON(KEYS.experiments, state.experiments),
      writeJSON(KEYS.phases, state.phases),
      writeJSON(KEYS.outcomeMetrics, state.outcomeMetrics),
    ]);
    return detail;
  }

  async updateExperimentStatus(id: UUID, status: ExperimentStatus): Promise<void> {
    const state = await this.ensure();
    const e = state.experiments.find((x) => x.id === id);
    if (!e) throw new Error(`Experiment ${id} not found`);
    e.status = status;
    e.updatedAt = nowISO();
    await writeJSON(KEYS.experiments, state.experiments);
  }

  async getAdherenceLogs(experimentId: UUID): Promise<AdherenceLog[]> {
    const { adherence } = await this.ensure();
    return adherence.filter((a) => a.experimentId === experimentId).sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  async getAllAdherenceLogs(): Promise<AdherenceLog[]> {
    return [...(await this.ensure()).adherence];
  }

  async logAdherence(input: LogAdherenceInput): Promise<AdherenceLog> {
    const state = await this.ensure();
    const existing = state.adherence.find((a) => a.experimentId === input.experimentId && a.date === input.date);
    let log: AdherenceLog;
    if (existing) {
      existing.adhered = input.adhered;
      if (input.note !== undefined) existing.note = input.note;
      existing.loggedAt = nowISO();
      log = existing;
    } else {
      log = { id: uuid(), experimentId: input.experimentId, date: input.date, adhered: input.adhered, note: input.note ?? null, loggedAt: nowISO() };
      state.adherence.push(log);
    }
    await writeJSON(KEYS.adherence, state.adherence);
    return { ...log };
  }

  async resetToSeed(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(KEYS));
    this.state = null;
    this.initPromise = null;
    await this.ensure();
  }
}

