import { buildPhasePlan, phaseLengthDays, recommendBaselineDays } from '../phases';
import type { MetricReading } from '../types';
import { addDays, eachDay } from '../../utils/dates';

function reading(date: string, flags: MetricReading['flags'] = []): MetricReading {
  return { id: date, userId: 'u', metricId: 'hrv', date, value: 42, source: 'oura', flags, syncedAt: '' };
}

describe('buildPhasePlan', () => {
  it('lays AB phases back to back around the start date', () => {
    const plan = buildPhasePlan({ designType: 'AB', startDate: '2026-11-04', baselineDays: 28, interventionDays: 42 });
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ type: 'baseline', startDate: '2026-10-07', endDate: '2026-11-03' });
    expect(plan[1]).toMatchObject({ type: 'intervention', startDate: '2026-11-04', endDate: '2026-12-15' });
    expect(phaseLengthDays(plan[0])).toBe(28);
    expect(phaseLengthDays(plan[1])).toBe(42);
  });

  it('adds a washout for ABA designs with no gaps between phases', () => {
    const plan = buildPhasePlan({ designType: 'ABA', startDate: '2026-11-04', baselineDays: 56, interventionDays: 14, washoutDays: 14 });
    expect(plan.map((p) => p.type)).toEqual(['baseline', 'intervention', 'washout']);
    for (let i = 1; i < plan.length; i++) expect(plan[i].startDate).toBe(addDays(plan[i - 1].endDate, 1));
    expect(phaseLengthDays(plan[2])).toBe(14);
  });
});

describe('buildPhasePlan with run-in', () => {
  it('inserts the run-in between baseline and intervention and shifts everything after it', () => {
    const plan = buildPhasePlan({ designType: 'ABA', startDate: '2026-11-04', baselineDays: 28, runInDays: 7, interventionDays: 28, washoutDays: 14 });
    expect(plan.map((p) => p.type)).toEqual(['baseline', 'run_in', 'intervention', 'washout']);
    expect(plan.map((p) => p.order)).toEqual([0, 1, 2, 3]);
    expect(plan[0].endDate).toBe('2026-11-03');
    expect(plan[1]).toMatchObject({ startDate: '2026-11-04', endDate: '2026-11-10' });
    expect(plan[2]).toMatchObject({ startDate: '2026-11-11', endDate: '2026-12-08' });
    for (let i = 1; i < plan.length; i++) expect(plan[i].startDate).toBe(addDays(plan[i - 1].endDate, 1));
  });

  it('omits the run-in phase when runInDays is 0', () => {
    const plan = buildPhasePlan({ designType: 'AB', startDate: '2026-11-04', baselineDays: 28, runInDays: 0, interventionDays: 28 });
    expect(plan.map((p) => p.type)).toEqual(['baseline', 'intervention']);
  });
});

describe('recommendBaselineDays', () => {
  const start = '2026-11-04';
  const fullWindow = eachDay(addDays(start, -56), addDays(start, -1));

  it('uses 8 weeks when the data is complete and clean', () => {
    const rec = recommendBaselineDays(fullWindow.map((d) => reading(d)), ['hrv'], start);
    expect(rec.days).toBe(56);
    expect(rec.coverage).toBe(1);
  });

  it('falls back to 6 weeks when the older part is disrupted', () => {
    const readings = fullWindow.map((d, i) => reading(d, i < 7 ? ['illness'] : []));
    const rec = recommendBaselineDays(readings, ['hrv'], start);
    expect(rec.days).toBe(42);
  });

  it('falls back to the 4-week minimum when coverage is poor, and says so', () => {
    const readings = fullWindow.filter((_, i) => i % 3 !== 0).map((d) => reading(d)); // ~67% coverage
    const rec = recommendBaselineDays(readings, ['hrv'], start);
    expect(rec.days).toBe(28);
    expect(rec.reason).toMatch(/uncertainty/);
  });

  it('ignores readings of other metrics and readings after the start', () => {
    const readings = [...fullWindow.map((d) => ({ ...reading(d), metricId: 'steps' as const })), reading(start), reading(addDays(start, 3))];
    const rec = recommendBaselineDays(readings, ['hrv'], start);
    expect(rec.days).toBe(28);
    expect(rec.coverage).toBe(0);
  });
});
