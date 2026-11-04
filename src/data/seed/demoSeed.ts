/**
 * The demo data set, built as plain objects. Two consumers:
 *   - LocalMockRepository seeds AsyncStorage with it on first run
 *   - SupabaseRepository can load it into a real account ("Load demo data")
 * Keeping it here means both back ends show exactly the same demo.
 */
import * as Crypto from 'expo-crypto';

import { suggestedOutcomeMetrics } from '../../domain/behaviors';
import { buildPhasePlan } from '../../domain/phases';
import type {
  AdherenceLog,
  CreateExperimentInput,
  DataSourceConnection,
  Experiment,
  ExperimentDetail,
  ExperimentOutcomeMetric,
  ExperimentPhase,
  ExperimentStatus,
  MetricReading,
  UUID,
} from '../../domain/types';
import { addDays, nowISO } from '../../utils/dates';
import { generateReadings, mulberry32, PRESET_FAKE_EFFECTS, type EffectWindow } from './generateReadings';

export interface DemoSeed {
  sources: DataSourceConnection[];
  experiments: Experiment[];
  phases: ExperimentPhase[];
  outcomeMetrics: ExperimentOutcomeMetric[];
  adherence: AdherenceLog[];
  readings: MetricReading[];
}

export function uuid(): UUID {
  return Crypto.randomUUID();
}

/** Turns a create input into a full experiment with phases and outcome metrics (no storage). */
export function materializeExperiment(input: CreateExperimentInput, status: ExperimentStatus, userId: UUID): ExperimentDetail {
  const id = uuid();
  const plan = buildPhasePlan(input);
  const now = nowISO();
  const phases: ExperimentPhase[] = plan.map((p) => ({ id: uuid(), experimentId: id, ...p }));
  const outcomeMetrics: ExperimentOutcomeMetric[] = input.outcomeMetrics.map((m) => ({ id: uuid(), experimentId: id, ...m }));
  return {
    id,
    userId,
    title: input.title,
    behaviorChange: input.behaviorChange,
    behaviorPresetId: input.behaviorPresetId,
    adherenceType: input.adherenceType,
    designType: input.designType,
    status,
    startDate: input.startDate,
    endDate: plan[plan.length - 1].endDate,
    createdAt: now,
    updatedAt: now,
    phases,
    outcomeMetrics,
  };
}

export function stripDetail(d: ExperimentDetail): Experiment {
  const { phases: _p, outcomeMetrics: _m, ...e } = d;
  return e;
}

/** Intervention phases of preset-based experiments become fake effect windows in the generated readings. */
export function effectWindowsFor(experiments: Experiment[], phases: ExperimentPhase[]): EffectWindow[] {
  const windows: EffectWindow[] = [];
  for (const e of experiments) {
    const effects = e.behaviorPresetId ? PRESET_FAKE_EFFECTS[e.behaviorPresetId] : undefined;
    if (!effects) continue;
    const intv = phases.find((p) => p.experimentId === e.id && p.type === 'intervention');
    if (intv) windows.push({ from: intv.startDate, to: intv.endDate, effects });
  }
  return windows;
}

const JOURNAL_NOTES = [
  'Felt sharper by mid-morning.',
  'Rainy, only managed 5 minutes on the balcony.',
  'Slept badly last night, unrelated (neighbours).',
  'Easy day, did it on the walk to work.',
  'Skipped: overslept.',
  'Great mood all day.',
];

function addDemoExperiment(
  seed: DemoSeed,
  userId: UUID,
  today: string,
  input: CreateExperimentInput,
  opts: { status: ExperimentStatus; adherenceRate: number; seed: number; untilYesterday?: boolean },
): void {
  const detail = materializeExperiment(input, opts.status, userId);
  seed.experiments.push(stripDetail(detail));
  seed.phases.push(...detail.phases);
  seed.outcomeMetrics.push(...detail.outcomeMetrics);

  const intv = detail.phases.find((p) => p.type === 'intervention')!;
  const lastLogDay = opts.untilYesterday ? addDays(today, -1) : intv.endDate;
  const rand = mulberry32(opts.seed);
  let d = intv.startDate;
  let i = 0;
  while (d <= lastLogDay && d <= today) {
    const adhered = rand() < opts.adherenceRate;
    const note = rand() < 0.25 ? JOURNAL_NOTES[i % JOURNAL_NOTES.length] : null;
    seed.adherence.push({ id: uuid(), experimentId: detail.id, date: d, adhered, note, loggedAt: nowISO() });
    d = addDays(d, 1);
    i += 1;
  }
}

/**
 * One connected Oura source, a finished sauna trial (with washout) and a
 * sunlight trial that is 12 days into its intervention, plus a year of readings
 * in which the preset effects are baked into the intervention windows.
 */
export function buildDemoSeed(userId: UUID, today: string): DemoSeed {
  const seed: DemoSeed = {
    sources: [{ id: uuid(), userId, provider: 'oura', status: 'connected', lastSyncAt: nowISO() }],
    experiments: [],
    phases: [],
    outcomeMetrics: [],
    adherence: [],
    readings: [],
  };

  addDemoExperiment(seed, userId, today, {
    title: 'Daily sauna',
    behaviorChange: 'At least 15 minutes of sauna every day.',
    behaviorPresetId: 'daily_sauna',
    adherenceType: 'daily_boolean',
    designType: 'ABA',
    startDate: addDays(today, -140),
    baselineDays: 42,
    interventionDays: 42,
    washoutDays: 14,
    outcomeMetrics: suggestedOutcomeMetrics('daily_sauna'),
  }, { status: 'completed', adherenceRate: 0.9, seed: 7 });

  addDemoExperiment(seed, userId, today, {
    title: 'Morning sunlight',
    behaviorChange: 'Get 10+ minutes of outdoor light within an hour of waking.',
    behaviorPresetId: 'morning_sunlight',
    adherenceType: 'daily_boolean',
    designType: 'AB',
    startDate: addDays(today, -12),
    baselineDays: 56,
    interventionDays: 42,
    outcomeMetrics: suggestedOutcomeMetrics('morning_sunlight'),
  }, { status: 'active', adherenceRate: 0.85, seed: 11, untilYesterday: true });

  seed.readings = generateReadings({ endDate: today, userId, effectWindows: effectWindowsFor(seed.experiments, seed.phases) });
  return seed;
}
