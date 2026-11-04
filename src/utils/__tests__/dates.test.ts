import { addDays, diffDays, eachDay, isWithin, parseISODate, toISODate, weekdayIndex } from '../dates';

describe('dates', () => {
  it('round-trips a local calendar day', () => {
    expect(toISODate(parseISODate('2026-11-04'))).toBe('2026-11-04');
    expect(toISODate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('survives daylight-saving transitions (Europe) without off-by-one days', () => {
    // Last Sunday of March / October are DST switch days in Finland.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('computes signed day differences', () => {
    expect(diffDays('2026-11-01', '2026-11-04')).toBe(3);
    expect(diffDays('2026-11-04', '2026-11-01')).toBe(-3);
  });

  it('uses Monday-first weekday indices', () => {
    expect(weekdayIndex('2026-11-02')).toBe(0); // Monday
    expect(weekdayIndex('2026-11-08')).toBe(6); // Sunday
  });

  it('enumerates inclusive ranges', () => {
    expect(eachDay('2026-11-01', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(eachDay('2026-11-03', '2026-11-01')).toEqual([]);
    expect(isWithin('2026-11-02', '2026-11-01', '2026-11-03')).toBe(true);
    expect(isWithin('2026-11-04', '2026-11-01', '2026-11-03')).toBe(false);
  });
});
