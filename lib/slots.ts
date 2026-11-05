import { booking } from "./config.ts";

// Pure scheduling logic. No database, no clock reads, so it is easy to test.
// Dates are "YYYY-MM-DD" in Nairobi time; times are minutes after midnight, Nairobi time.

export type Busy = { startMin: number; durationMin: number };
export type Slot = { startMin: number; label: string };

export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function isoDateParts(date: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return { y, m, d };
}

export function dayOfWeek(date: string): number {
  const p = isoDateParts(date);
  if (!p) return -1;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

// Epoch ms of a Nairobi wall-clock moment. Kenya is a fixed UTC+3, so no DST maths needed.
export function nairobiToEpoch(date: string, minutes: number): number {
  const p = isoDateParts(date);
  if (!p) return NaN;
  return Date.UTC(p.y, p.m - 1, p.d, 0, minutes - 180, 0, 0);
}

export function overlaps(a: Busy, b: Busy): boolean {
  return a.startMin < b.startMin + b.durationMin && b.startMin < a.startMin + a.durationMin;
}

export function isBookableDate(date: string, nowMs: number): boolean {
  if (!isoDateParts(date)) return false;
  if (!(booking.workingDays as readonly number[]).includes(dayOfWeek(date))) return false;
  const dayEnd = nairobiToEpoch(date, booking.closeHour * 60);
  const latest = nowMs + booking.maxDaysAhead * 86_400_000;
  return dayEnd > nowMs && nairobiToEpoch(date, 0) <= latest;
}

export function availableSlots(date: string, durationMin: number, busy: Busy[], nowMs: number): Slot[] {
  if (!isBookableDate(date, nowMs)) return [];
  const open = booking.openHour * 60;
  const close = booking.closeHour * 60;
  const earliest = nowMs + booking.minNoticeHours * 3_600_000;
  const out: Slot[] = [];
  for (let start = open; start + durationMin <= close; start += booking.slotStepMinutes) {
    if (nairobiToEpoch(date, start) < earliest) continue;
    const candidate = { startMin: start, durationMin };
    if (busy.some((b) => overlaps(candidate, b))) continue;
    out.push({ startMin: start, label: minutesToLabel(start) });
  }
  return out;
}

export function nairobiNowDate(nowMs: number): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: booking.timezone }).format(new Date(nowMs));
}

export function addDays(date: string, days: number): string {
  const p = isoDateParts(date)!;
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return d.toISOString().slice(0, 10);
}
