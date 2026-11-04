import AsyncStorage from '@react-native-async-storage/async-storage';

import { LocalMockRepository } from '../LocalMockRepository';
import { suggestedOutcomeMetrics } from '../../domain/behaviors';
import { addDays, today } from '../../utils/dates';

describe('LocalMockRepository', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('seeds a year of readings, two demo experiments and a connected Oura source on first run', async () => {
    const repo = new LocalMockRepository();
    const [sources, readings, experiments] = await Promise.all([repo.getSources(), repo.getReadings(), repo.listExperimentDetails()]);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ provider: 'oura', status: 'connected' });
    expect(new Set(readings.map((r) => r.date)).size).toBeGreaterThan(330);
    expect(experiments.map((e) => e.status).sort()).toEqual(['active', 'completed']);
    const active = experiments.find((e) => e.status === 'active')!;
    expect(active.phases.map((p) => p.type)).toEqual(['baseline', 'intervention']);
    expect(active.outcomeMetrics.some((m) => m.isPrimary)).toBe(true);
  });

  it('refuses a second active experiment', async () => {
    const repo = new LocalMockRepository();
    const input = {
      title: 'Cold shower',
      behaviorChange: '2 minutes cold at the end of every shower.',
      behaviorPresetId: null,
      adherenceType: 'daily_boolean' as const,
      designType: 'AB' as const,
      startDate: today(),
      baselineDays: 28,
      interventionDays: 14,
      outcomeMetrics: suggestedOutcomeMetrics(null),
    };
    await expect(repo.createExperiment(input)).rejects.toThrow(/already have an experiment running/);
  });

  it('persists across instances', async () => {
    const first = new LocalMockRepository();
    const running = (await first.listExperiments({ status: ['active'] }))[0];
    await first.updateExperimentStatus(running.id, 'abandoned');
    const created = await first.createExperiment({
      title: 'Cold shower',
      behaviorChange: '2 minutes cold at the end of every shower.',
      behaviorPresetId: null,
      adherenceType: 'daily_boolean',
      designType: 'AB',
      startDate: today(),
      baselineDays: 28,
      interventionDays: 14,
      outcomeMetrics: suggestedOutcomeMetrics(null),
    });
    const second = new LocalMockRepository();
    const loaded = await second.getExperiment(created.id);
    expect(loaded?.title).toBe('Cold shower');
    expect(loaded?.endDate).toBe(addDays(today(), 13));
    expect(loaded?.phases[0]).toMatchObject({ type: 'baseline', startDate: addDays(today(), -28) });
  });

  it('upserts adherence logs so a past day can be edited', async () => {
    const repo = new LocalMockRepository();
    const active = (await repo.listExperiments({ status: ['active'] }))[0];
    const date = addDays(today(), -3);
    await repo.logAdherence({ experimentId: active.id, date, adhered: false, note: 'forgot' });
    await repo.logAdherence({ experimentId: active.id, date, adhered: true });
    const logs = (await repo.getAdherenceLogs(active.id)).filter((l) => l.date === date);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ adhered: true, note: 'forgot' }); // note kept when not provided
    await repo.logAdherence({ experimentId: active.id, date, adhered: true, note: null });
    expect((await repo.getAdherenceLogs(active.id)).find((l) => l.date === date)?.note).toBeNull();
  });

  it('filters readings by metric and date range', async () => {
    const repo = new LocalMockRepository();
    const from = addDays(today(), -6);
    const rs = await repo.getReadings({ metricIds: ['hrv'], from, to: today() });
    expect(rs.every((r) => r.metricId === 'hrv' && r.date >= from && r.date <= today())).toBe(true);
    expect(rs.length).toBeGreaterThan(0);
    expect(rs.length).toBeLessThanOrEqual(7);
  });

  it('updates status and resets to seed', async () => {
    const repo = new LocalMockRepository();
    const active = (await repo.listExperiments({ status: ['active'] }))[0];
    await repo.updateExperimentStatus(active.id, 'abandoned');
    expect((await repo.getExperiment(active.id))?.status).toBe('abandoned');
    await repo.resetToSeed();
    expect((await repo.listExperiments({ status: ['active'] })).length).toBe(1);
  });
});
