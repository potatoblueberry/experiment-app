import { bedtimeHours, mapOuraToReadings, pickMainSleep, tzOffsetHours } from '../mapReadings';

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

  it('maps every metric, converts units and skips nulls', () => {
    const rows = mapOuraToReadings({
      sleep: [
        {
          day: '2026-11-04',
          type: 'long_sleep',
          total_sleep_duration: 27000,
          efficiency: 88,
          average_hrv: null,
          lowest_heart_rate: 52,
          average_heart_rate: 57.4,
          average_breath: 14.25,
          latency: 600,
          awake_time: 1800,
          bedtime_start: '2026-11-03T23:30:00+02:00',
        },
      ],
      dailyReadiness: [{ day: '2026-11-04', score: 81, temperature_deviation: -0.12 }],
      dailyActivity: [{ day: '2026-11-04', steps: 9321, active_calories: 512 }],
      dailyStress: [{ day: '2026-11-04', stress_high: 5400, recovery_high: 1200 }],
    });
    const byMetric = Object.fromEntries(rows.map((r) => [r.metric_id, r.value]));
    expect(byMetric).toEqual({
      sleep_duration: 7.5,
      sleep_efficiency: 88,
      resting_hr: 52,
      sleep_hr: 57.4,
      respiratory_rate: 14.3,
      sleep_latency: 10,
      awake_time: 30,
      bedtime: 23.5,
      tz_offset: 2,
      readiness: 81,
      temp_deviation: -0.12,
      steps: 9321,
      active_calories: 512,
      daytime_stress: 90,
    });
    expect(rows.every((r) => r.source === 'oura' && r.date === '2026-11-04')).toBe(true);
  });

  it('treats a bedtime after midnight as hours past 24 and reads negative offsets', () => {
    expect(bedtimeHours('2026-11-04T01:15:00-05:00')).toBe(25.25);
    expect(tzOffsetHours('2026-11-04T01:15:00-05:00')).toBe(-5);
    expect(tzOffsetHours('2026-11-04T01:15:00Z')).toBe(0);
  });
});
