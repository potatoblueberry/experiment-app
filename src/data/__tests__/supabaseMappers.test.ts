import { buildDemoSeed } from '../seed/demoSeed';
import {
  adherenceToRow,
  experimentToRow,
  outcomeMetricToRow,
  phaseToRow,
  readingToRow,
  rowToAdherence,
  rowToExperimentDetail,
  rowToReading,
  rowToSource,
  sourceToRow,
} from '../supabase/mappers';

const USER = '11111111-1111-4111-8111-111111111111';

describe('supabase mappers', () => {
  const seed = buildDemoSeed(USER, '2026-11-04');

  it('round-trips experiments with phases and outcome metrics', () => {
    const e = seed.experiments[0];
    const row = {
      ...experimentToRow(e),
      experiment_phases: seed.phases.filter((p) => p.experimentId === e.id).reverse().map(phaseToRow),
      experiment_outcome_metrics: seed.outcomeMetrics.filter((m) => m.experimentId === e.id).map(outcomeMetricToRow),
    };
    const back = rowToExperimentDetail(row);
    const { phases, outcomeMetrics, ...plain } = back;
    expect(plain).toEqual(e);
    // phases come back sorted by order even if the database returns them shuffled
    expect(phases.map((p) => p.order)).toEqual([0, 1, 2]);
    expect(outcomeMetrics).toEqual(seed.outcomeMetrics.filter((m) => m.experimentId === e.id));
  });

  it('round-trips adherence logs and sources', () => {
    const a = seed.adherence[0];
    expect(rowToAdherence(adherenceToRow(a))).toEqual(a);
    const s = seed.sources[0];
    expect(rowToSource(sourceToRow(s))).toEqual(s);
  });

  it('drops the local id on readings and keeps everything else', () => {
    const r = seed.readings[0];
    const row = readingToRow(r);
    expect('id' in row).toBe(false);
    expect(rowToReading({ id: 'db-assigned', ...row })).toEqual({ ...r, id: 'db-assigned' });
  });

  it('every row key is snake_case', () => {
    const keys = [
      ...Object.keys(experimentToRow(seed.experiments[0])),
      ...Object.keys(phaseToRow(seed.phases[0])),
      ...Object.keys(outcomeMetricToRow(seed.outcomeMetrics[0])),
      ...Object.keys(adherenceToRow(seed.adherence[0])),
      ...Object.keys(readingToRow(seed.readings[0])),
      ...Object.keys(sourceToRow(seed.sources[0])),
    ];
    for (const k of keys) expect(k).toMatch(/^[a-z_]+$/);
  });
});
