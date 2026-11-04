/**
 * Repository backed by Supabase (Postgres behind PostgREST). Row-level
 * security on the server already limits every query to the signed-in user;
 * `userId` is only needed when inserting rows.
 *
 * Same contract as LocalMockRepository, so screens cannot tell them apart.
 */
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { METRIC_LIST } from '../domain/metrics';
import { ActiveExperimentExistsError } from '../domain/rules';
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
import { nowISO, today } from '../utils/dates';
import type { Repository } from './repository';
import { buildDemoSeed, materializeExperiment, stripDetail } from './seed/demoSeed';
import {
  adherenceToRow,
  experimentToRow,
  outcomeMetricToRow,
  phaseToRow,
  readingToRow,
  rowToAdherence,
  rowToExperiment,
  rowToExperimentDetail,
  rowToReading,
  rowToSource,
  sourceToRow,
  type AdherenceLogRow,
  type DataSourceConnectionRow,
  type ExperimentRow,
  type ExperimentRowWithChildren,
  type MetricReadingRow,
} from './supabase/mappers';

/** PostgREST returns at most 1000 rows per request; a year of 7 metrics is ~2500. */
const PAGE = 1000;
/** Inserting thousands of rows in one request can time out; chunk them. */
const INSERT_CHUNK = 500;

const EXPERIMENT_WITH_CHILDREN = '*, experiment_phases(*), experiment_outcome_metrics(*)';

function unwrap<T>(res: { data: T | null; error: PostgrestError | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: no data returned`);
  return res.data;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export class SupabaseRepository implements Repository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: UUID,
  ) {}

  async getSources(): Promise<DataSourceConnection[]> {
    const rows = unwrap(await this.client.from('data_source_connections').select('*').order('created_at'), 'load sources');
    return (rows as DataSourceConnectionRow[]).map(rowToSource);
  }

  async getMetricDefinitions(): Promise<MetricDefinition[]> {
    // Reference data is identical to the seeded metric_definitions table; no round trip needed.
    return METRIC_LIST;
  }

  async getReadings(query: ReadingQuery = {}): Promise<MetricReading[]> {
    const out: MetricReading[] = [];
    for (let offset = 0; ; offset += PAGE) {
      let q = this.client.from('metric_readings').select('*').order('date').order('metric_id').range(offset, offset + PAGE - 1);
      if (query.metricIds) q = q.in('metric_id', query.metricIds);
      if (query.from) q = q.gte('date', query.from);
      if (query.to) q = q.lte('date', query.to);
      const rows = unwrap(await q, 'load readings') as MetricReadingRow[];
      out.push(...rows.map(rowToReading));
      if (rows.length < PAGE) break;
    }
    return out;
  }

  async listExperiments(filter?: { status?: ExperimentStatus[] }): Promise<Experiment[]> {
    let q = this.client.from('experiments').select('*').order('start_date', { ascending: false });
    if (filter?.status) q = q.in('status', filter.status);
    return (unwrap(await q, 'load experiments') as ExperimentRow[]).map(rowToExperiment);
  }

  async listExperimentDetails(filter?: { status?: ExperimentStatus[] }): Promise<ExperimentDetail[]> {
    let q = this.client.from('experiments').select(EXPERIMENT_WITH_CHILDREN).order('start_date', { ascending: false });
    if (filter?.status) q = q.in('status', filter.status);
    return (unwrap(await q, 'load experiments') as ExperimentRowWithChildren[]).map(rowToExperimentDetail);
  }

  async getExperiment(id: UUID): Promise<ExperimentDetail | null> {
    const res = await this.client.from('experiments').select(EXPERIMENT_WITH_CHILDREN).eq('id', id).maybeSingle();
    if (res.error) throw new Error(`load experiment: ${res.error.message}`);
    return res.data ? rowToExperimentDetail(res.data as ExperimentRowWithChildren) : null;
  }

  async createExperiment(input: CreateExperimentInput): Promise<ExperimentDetail> {
    const detail = materializeExperiment(input, 'active', this.userId);
    // Three inserts, parent first. If a child insert fails, remove the parent so
    // no half-built experiment is left behind (cascade deletes any children).
    // The database also refuses a second active experiment (partial unique index).
    const parent = await this.client.from('experiments').insert(experimentToRow(stripDetail(detail))).select('id');
    if (parent.error?.code === '23505') throw new ActiveExperimentExistsError();
    unwrap(parent, 'create experiment');
    try {
      unwrap(await this.client.from('experiment_phases').insert(detail.phases.map(phaseToRow)).select('id'), 'create phases');
      unwrap(await this.client.from('experiment_outcome_metrics').insert(detail.outcomeMetrics.map(outcomeMetricToRow)).select('id'), 'create outcome metrics');
    } catch (e) {
      await this.client.from('experiments').delete().eq('id', detail.id);
      throw e;
    }
    return detail;
  }

  async updateExperimentStatus(id: UUID, status: ExperimentStatus): Promise<void> {
    const res = await this.client.from('experiments').update({ status }).eq('id', id);
    if (res.error) throw new Error(`update experiment: ${res.error.message}`);
  }

  async getAdherenceLogs(experimentId: UUID): Promise<AdherenceLog[]> {
    const rows = unwrap(await this.client.from('adherence_logs').select('*').eq('experiment_id', experimentId).order('date'), 'load adherence');
    return (rows as AdherenceLogRow[]).map(rowToAdherence);
  }

  async getAllAdherenceLogs(): Promise<AdherenceLog[]> {
    const rows = unwrap(await this.client.from('adherence_logs').select('*').order('date'), 'load adherence');
    return (rows as AdherenceLogRow[]).map(rowToAdherence);
  }

  async logAdherence(input: LogAdherenceInput): Promise<AdherenceLog> {
    // Upsert on (experiment_id, date). Only the columns sent are overwritten, so
    // leaving `note` undefined keeps the existing note (same rule as the mock).
    const payload: Partial<AdherenceLogRow> = { experiment_id: input.experimentId, date: input.date, adhered: input.adhered, logged_at: nowISO() };
    if (input.note !== undefined) payload.note = input.note;
    const row = unwrap(await this.client.from('adherence_logs').upsert(payload, { onConflict: 'experiment_id,date' }).select('*').single(), 'save check-in');
    return rowToAdherence(row as unknown as AdherenceLogRow);
  }

  /**
   * "Load demo data": wipes everything this user owns and inserts the same demo
   * set the local mock uses. Lets the whole app be exercised against the real
   * backend before any wearable is connected.
   */
  async resetToSeed(): Promise<void> {
    await this.deleteAllOwnData();
    const seed = buildDemoSeed(this.userId, today());
    unwrap(await this.client.from('data_source_connections').insert(seed.sources.map(sourceToRow)).select('id'), 'seed sources');
    unwrap(await this.client.from('experiments').insert(seed.experiments.map(experimentToRow)).select('id'), 'seed experiments');
    unwrap(await this.client.from('experiment_phases').insert(seed.phases.map(phaseToRow)).select('id'), 'seed phases');
    unwrap(await this.client.from('experiment_outcome_metrics').insert(seed.outcomeMetrics.map(outcomeMetricToRow)).select('id'), 'seed outcome metrics');
    for (const part of chunks(seed.adherence.map(adherenceToRow), INSERT_CHUNK)) {
      unwrap(await this.client.from('adherence_logs').insert(part).select('id'), 'seed adherence');
    }
    for (const part of chunks(seed.readings.map(readingToRow), INSERT_CHUNK)) {
      unwrap(await this.client.from('metric_readings').insert(part).select('id'), 'seed readings');
    }
  }

  private async deleteAllOwnData(): Promise<void> {
    // Experiments cascade to phases, outcome metrics and adherence logs.
    for (const table of ['experiments', 'metric_readings', 'data_source_connections'] as const) {
      const res = await this.client.from(table).delete().eq('user_id', this.userId);
      if (res.error) throw new Error(`clear ${table}: ${res.error.message}`);
    }
  }
}
