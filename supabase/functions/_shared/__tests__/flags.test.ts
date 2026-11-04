import { computeAutoFlags, type FlagInput } from '../flags';

function series(metric: string, from: string, days: number, value: (i: number) => number): FlagInput[] {
  const out: FlagInput[] = [];
  const d0 = new Date(from + 'T00:00:00Z');
  for (let i = 0; i < days; i++) {
    const d = new Date(d0);
    d.setUTCDate(d0.getUTCDate() + i);
    out.push({ metric_id: metric, date: d.toISOString().slice(0, 10), value: value(i) });
  }
  return out;
}

describe('computeAutoFlags', () => {
  const from = '2026-10-01';
  const window = { from: '2026-10-29', to: '2026-11-04' }; // day index 28..34

  it('flags illness when temperature rises together with resting HR', () => {
    const rows = [
      ...series('temp_deviation', from, 35, (i) => (i === 31 ? 0.6 : 0.05)),
      ...series('resting_hr', from, 35, (i) => (i === 31 ? 60 : 55)),
      ...series('hrv', from, 35, () => 45),
      ...series('respiratory_rate', from, 35, () => 14.5),
    ];
    const out = computeAutoFlags(rows, window.from, window.to);
    expect(out).toEqual([{ date: '2026-11-01', flags: ['illness'] }]);
  });

  it('does not flag a lone mild temperature rise, but does flag a large one', () => {
    const base = [...series('resting_hr', from, 35, () => 55), ...series('hrv', from, 35, () => 45)];
    expect(computeAutoFlags([...base, ...series('temp_deviation', from, 35, (i) => (i === 31 ? 0.6 : 0))], window.from, window.to)).toEqual([]);
    expect(computeAutoFlags([...base, ...series('temp_deviation', from, 35, (i) => (i === 31 ? 1.0 : 0))], window.from, window.to)).toEqual([
      { date: '2026-11-01', flags: ['illness'] },
    ]);
  });

  it('flags travel on a time-zone change and the two days after it', () => {
    const rows = series('tz_offset', from, 35, (i) => (i >= 30 ? -5 : 2));
    const out = computeAutoFlags(rows, window.from, window.to);
    expect(out.map((f) => f.date)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(out.every((f) => f.flags.includes('travel'))).toBe(true);
  });

  it('is quiet on ordinary days', () => {
    const rows = [
      ...series('temp_deviation', from, 35, (i) => ((i % 7) - 3) * 0.05),
      ...series('resting_hr', from, 35, (i) => 54 + (i % 3)),
      ...series('tz_offset', from, 35, () => 2),
    ];
    expect(computeAutoFlags(rows, window.from, window.to)).toEqual([]);
  });
});
