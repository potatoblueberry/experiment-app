import { generateReadings } from '../seed/generateReadings';
import { METRIC_IDS } from '../../domain/metrics';
import { addDays } from '../../utils/dates';

const END = '2026-11-04';

describe('generateReadings', () => {
  it('is deterministic for the same inputs', () => {
    const a = generateReadings({ endDate: END, days: 60 });
    const b = generateReadings({ endDate: END, days: 60 });
    expect(a.map((r) => r.value)).toEqual(b.map((r) => r.value));
  });

  it('produces at most one reading per metric per day and covers most days', () => {
    const rs = generateReadings({ endDate: END, days: 365 });
    const keys = new Set(rs.map((r) => `${r.metricId}|${r.date}`));
    expect(keys.size).toBe(rs.length);
    const days = new Set(rs.map((r) => r.date));
    expect(days.size).toBeGreaterThan(330);
    expect(days.size).toBeLessThanOrEqual(365);
    for (const id of METRIC_IDS) expect(rs.some((r) => r.metricId === id)).toBe(true);
  });

  it('keeps values in physiologically plausible ranges', () => {
    const rs = generateReadings({ endDate: END, days: 365 });
    const range = (id: string) => {
      const v = rs.filter((r) => r.metricId === id).map((r) => r.value);
      return [Math.min(...v), Math.max(...v)];
    };
    expect(range('sleep_duration')[0]).toBeGreaterThanOrEqual(4.5);
    expect(range('sleep_duration')[1]).toBeLessThanOrEqual(10);
    expect(range('sleep_efficiency')[1]).toBeLessThanOrEqual(98);
    expect(range('readiness')[1]).toBeLessThanOrEqual(99);
    expect(range('resting_hr')[0]).toBeGreaterThan(38);
  });

  it('flags illness episodes and raises temperature on those days', () => {
    const rs = generateReadings({ endDate: END, days: 365 });
    const flagged = rs.filter((r) => r.metricId === 'temp_deviation' && r.flags.includes('illness'));
    const clean = rs.filter((r) => r.metricId === 'temp_deviation' && r.flags.length === 0);
    expect(flagged.length).toBeGreaterThanOrEqual(6);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(flagged.map((r) => r.value))).toBeGreaterThan(avg(clean.map((r) => r.value)) + 0.3);
    expect(rs.some((r) => r.flags.includes('travel'))).toBe(true);
  });

  it('applies effect windows additively', () => {
    const from = addDays(END, -20);
    const base = generateReadings({ endDate: END, days: 60 });
    const shifted = generateReadings({ endDate: END, days: 60, effectWindows: [{ from, to: END, effects: { hrv: 10 } }] });
    const byKey = new Map(base.map((r) => [`${r.metricId}|${r.date}`, r.value]));
    for (const r of shifted.filter((r) => r.metricId === 'hrv')) {
      const b = byKey.get(`hrv|${r.date}`)!;
      if (r.date >= from) expect(r.value - b).toBeGreaterThanOrEqual(9); // rounding + clamp
      else expect(r.value).toBe(b);
    }
  });
});
