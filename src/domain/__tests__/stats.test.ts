import type { ExperimentPhase, MetricReading } from '../types';
import { buildBaselineModel, estimateEffect, findBaselineContamination, findConfounds, mean, quantile, rollingMean, sd } from '../stats';
import { addDays, weekdayIndex } from '../../utils/dates';
import { mulberry32 } from '../../data/seed/generateReadings';

function reading(date: string, value: number, flags: MetricReading['flags'] = []): MetricReading {
  return { id: date, userId: 'u', metricId: 'hrv', date, value, source: 'oura', flags, syncedAt: '' };
}

/** Deterministic Gaussian noise (fixed seed) so tests do not depend on Math.random. */
const noiseTable: number[] = (() => {
  const rng = mulberry32(42);
  return Array.from({ length: 2000 }, () => {
    const u = rng() || 1e-9;
    const v = rng() || 1e-9;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  });
})();
function noise(i: number): number {
  return noiseTable[i % noiseTable.length];
}

describe('basic statistics', () => {
  it('mean, sd and quantiles', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5], 0.1)).toBeCloseTo(1.4, 6);
    expect(Number.isNaN(mean([]))).toBe(true);
  });
});

describe('rollingMean', () => {
  it('averages over calendar days, not over samples', () => {
    const pts = [
      { date: '2026-01-01', value: 10 },
      { date: '2026-01-02', value: 20 },
      { date: '2026-01-03', value: 30 },
      { date: '2026-01-04', value: 40 },
      // gap of 10 days: the window must not stretch back across it
      { date: '2026-01-15', value: 100 },
      { date: '2026-01-16', value: 100 },
      { date: '2026-01-17', value: 100 },
      { date: '2026-01-18', value: 100 },
    ];
    const out = rollingMean(pts, 7, 4);
    expect(out.map((p) => p.date)).toEqual(['2026-01-04', '2026-01-18']);
    expect(out[0].value).toBe(25);
    expect(out[1].value).toBe(100);
  });
});

describe('buildBaselineModel', () => {
  it('recovers weekday effects, trend and excludes flagged days', () => {
    const start = '2026-01-05'; // a Monday
    const readings: MetricReading[] = [];
    for (let i = 0; i < 280; i++) {
      const date = addDays(start, i);
      const wd = weekdayIndex(date);
      // 40 baseline, +0.1/day trend, Sunday +5, small noise
      readings.push(reading(date, 40 + 0.1 * i + (wd === 6 ? 5 : 0) + noise(i) * 0.5));
    }
    // One absurd flagged day must not move anything.
    readings.push(reading(addDays(start, 300), 10_000, ['illness']));
    const m = buildBaselineModel(readings, 'hrv');
    expect(m.n).toBe(281);
    expect(m.flaggedDays).toBe(1);
    expect(m.trendPer30Days).toBeCloseTo(3, 0);
    expect(m.weekdayEffects[6]).toBeGreaterThan(3.5);
    expect(Math.abs(m.weekdayEffects[2])).toBeLessThan(1.5);
    expect(m.mean).toBeLessThan(100);
  });
});

describe('estimateEffect', () => {
  const start = '2026-03-02'; // Monday
  const phases: ExperimentPhase[] = [
    { id: 'b', experimentId: 'e', type: 'baseline', order: 0, startDate: addDays(start, -56), endDate: addDays(start, -1) },
    { id: 'i', experimentId: 'e', type: 'intervention', order: 1, startDate: start, endDate: addDays(start, 41) },
  ];

  function series(step: number, slopePerDay = 0): MetricReading[] {
    const out: MetricReading[] = [];
    const from = addDays(start, -56);
    for (let i = 0; i < 98; i++) {
      const date = addDays(from, i);
      const inIntervention = date >= start;
      const wd = weekdayIndex(date);
      out.push(reading(date, 45 + slopePerDay * i + (wd >= 5 ? -3 : 0) + (inIntervention ? step : 0) + noise(i) * 2));
    }
    return out;
  }

  it('finds a real step change and reports uncertainty', () => {
    const est = estimateEffect(series(6), 'hrv', phases)!;
    expect(est.verdict).toBe('likely_effect');
    expect(est.adjustedEffect).toBeGreaterThan(4);
    expect(est.adjustedEffect).toBeLessThan(8);
    expect(est.ci95).toBeGreaterThan(0);
    expect(est.ci95).toBeLessThan(3);
  });

  it('does not mistake a slow drift for an effect', () => {
    // +0.1 per day drift, no step: raw difference is large, adjusted effect should be near zero.
    const est = estimateEffect(series(0, 0.1), 'hrv', phases)!;
    expect(est.rawDiff).toBeGreaterThan(3.5);
    expect(Math.abs(est.adjustedEffect)).toBeLessThan(Math.abs(est.rawDiff) / 2);
    expect(Math.abs(est.adjustedEffect)).toBeLessThan(2);
  });

  it('is honest when there is no effect', () => {
    const est = estimateEffect(series(0), 'hrv', phases)!;
    expect(est.verdict).toBe('no_clear_effect');
    expect(Math.abs(est.adjustedEffect)).toBeLessThan(est.ci95);
  });

  it('respects upTo and reports insufficient data early', () => {
    const est = estimateEffect(series(6), 'hrv', phases, { upTo: addDays(start, 6) })!;
    expect(est.interventionN).toBe(7);
    expect(est.verdict).toBe('insufficient');
  });

  it('can restrict to adhered days (per-protocol)', () => {
    const only = new Set(Array.from({ length: 20 }, (_, i) => addDays(start, i * 2)));
    const est = estimateEffect(series(6), 'hrv', phases, { onlyInterventionDates: only })!;
    expect(est.interventionN).toBe(20);
  });

  it('returns null without a baseline and intervention phase', () => {
    expect(estimateEffect(series(6), 'hrv', [phases[0]])).toBeNull();
  });
});

describe('findConfounds', () => {
  it('flags overlapping experiments that share an outcome metric', () => {
    const target = { id: 'a', startDate: '2026-11-04', endDate: '2026-12-15', metricIds: ['hrv', 'sleep_duration'] as const };
    const others = [
      { id: 'b', title: 'Sunlight', startDate: '2026-10-23', endDate: '2026-12-03', metricIds: ['readiness', 'hrv'] as const },
      { id: 'c', title: 'Steps', startDate: '2026-10-01', endDate: '2026-12-31', metricIds: ['steps'] as const },
      { id: 'd', title: 'Old', startDate: '2026-01-01', endDate: '2026-02-01', metricIds: ['hrv'] as const },
    ];
    const out = findConfounds({ ...target, metricIds: [...target.metricIds] }, others.map((o) => ({ ...o, metricIds: [...o.metricIds] })));
    expect(out).toHaveLength(1);
    expect(out[0].otherTitle).toBe('Sunlight');
    expect(out[0].sharedMetrics).toEqual(['hrv']);
    expect(out[0].overlapDays).toBe(30);
  });
});

describe('findBaselineContamination', () => {
  const sauna = {
    id: 's',
    title: 'Daily sauna',
    phases: [
      { type: 'baseline', startDate: '2026-05-06', endDate: '2026-06-16' },
      { type: 'intervention', startDate: '2026-06-17', endDate: '2026-07-28' },
      { type: 'washout', startDate: '2026-07-29', endDate: '2026-08-11' },
    ],
  };

  it('flags a comparison window that reaches into an earlier intervention or washout', () => {
    const out = findBaselineContamination({ from: '2026-07-20', to: '2026-08-30' }, [sauna]);
    expect(out.map((c) => [c.phaseType, c.overlapDays])).toEqual([
      ['intervention', 9],
      ['washout', 14],
    ]);
    expect(out[1].phaseEndDate).toBe('2026-08-11');
  });

  it('ignores earlier baselines and non-overlapping windows', () => {
    expect(findBaselineContamination({ from: '2026-05-10', to: '2026-06-10' }, [sauna])).toEqual([]);
    expect(findBaselineContamination({ from: '2026-08-12', to: '2026-10-01' }, [sauna])).toEqual([]);
  });
});
