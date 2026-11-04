/**
 * Date helpers. The whole app works with calendar days as 'YYYY-MM-DD' strings
 * (type ISODate) so that "a day" means the same thing in storage, in the UI and
 * later in Postgres (DATE column). Only convert to JS Date objects at the edges.
 */
import { format } from 'date-fns';
import type { ISODate } from '../domain/types';

/** Format a JS Date as a local calendar day. */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse 'YYYY-MM-DD' as a local date at midnight (never UTC, to avoid off-by-one days). */
export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(): ISODate {
  return toISODate(new Date());
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Whole days from a to b (positive when b is after a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** 0 = Monday ... 6 = Sunday. Monday-first matches how people think about weeks. */
export function weekdayIndex(iso: ISODate): number {
  return (parseISODate(iso).getDay() + 6) % 7;
}

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function isWeekend(iso: ISODate): boolean {
  return weekdayIndex(iso) >= 5;
}

/** Inclusive range check. */
export function isWithin(iso: ISODate, from: ISODate, to: ISODate): boolean {
  return iso >= from && iso <= to;
}

/** Every day from `from` to `to` inclusive. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function formatShort(iso: ISODate): string {
  return format(parseISODate(iso), 'EEE d MMM');
}

export function formatMedium(iso: ISODate): string {
  return format(parseISODate(iso), 'd MMM yyyy');
}

export function formatMonth(iso: ISODate): string {
  return format(parseISODate(iso), 'MMM');
}

export function formatDayNumber(iso: ISODate): string {
  return format(parseISODate(iso), 'd');
}

export function formatDayMonth(iso: ISODate): string {
  return format(parseISODate(iso), 'd MMM');
}

export function formatRange(from: ISODate, to: ISODate): string {
  return `${formatDayMonth(from)} – ${formatDayMonth(to)}`;
}

export function relativeDayLabel(iso: ISODate): string {
  const t = today();
  if (iso === t) return 'Today';
  if (iso === addDays(t, -1)) return 'Yesterday';
  if (iso === addDays(t, 1)) return 'Tomorrow';
  return formatShort(iso);
}

export function nowISO(): string {
  return new Date().toISOString();
}
