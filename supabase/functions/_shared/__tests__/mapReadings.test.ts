import { mapOuraToReadings, pickMainSleep } from '../mapReadings';

describe('Oura -> metric_readings mapping', () => {
  it('prefers the long sleep of a day and ignores naps and deleted periods', () => {
    const main = pickMainSleep([
      { day: '2026-11-03', type: 'late_nap', total_sleep_duration: 1800, average_hrv: 99 },
      { day: '2026-11-03', type: 'long_sleep', total_sleep_duration: 27000, average_hrv: 41 },
      { day: '2026-11-03', type: 'deleted', total_sleep_duration: 30000 },
      { day: '2026-11-04', type: 'sleep', total_sleep_duration: 20000 },
      { day: '2026-11-04', type: 'sleep', total_sleep_duration: 25000 },
    ]);
    expect(main.get('2026-11-03')?.average_hrv).toBe(41);
    expect(main.get('2026-11-04')?.total_sleep_duration).toBe(25000);
  });

  it('maps every metric, converts seconds to hours and skips nulls', () => {
    const rows = mapOuraToReadings({
      sleep: [{ day: '2026-11-04', type: 'long_sleep', total_sleep_duration: 27000, efficiency: 88, average_hrv: null, lowest_heart_rate: 52 }],
      dailyReadiness: [{ day: '2026-11-04', score: 81, temperature_deviation: -0.12 }],
      dailyActivity: [{ day: '2026-11-04', steps: 9321 }],
    });
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric_id, r.value]));
    expect(byMetric).toEqual({ sleep_duration: 7.5, sleep_efficiency: 88, resting_hr: 52, readiness: 81, temp_deviation: -0.12, steps: 9321 });
    expect(rows.every((r) => r.source === 'oura' && r.date === '2026-11-04')).toBe(true);
  });
});
