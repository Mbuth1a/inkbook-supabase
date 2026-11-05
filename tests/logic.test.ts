import { test } from "node:test";
import assert from "node:assert/strict";
import { booking } from "../lib/config.ts";
import { normalizeKenyanPhone } from "../lib/phone.ts";
import { addDays, availableSlots, isBookableDate, nairobiToEpoch, overlaps } from "../lib/slots.ts";

test("phone numbers normalise to 2547/2541 format", () => {
  assert.equal(normalizeKenyanPhone("0712 345 678"), "254712345678");
  assert.equal(normalizeKenyanPhone("+254712345678"), "254712345678");
  assert.equal(normalizeKenyanPhone("712345678"), "254712345678");
  assert.equal(normalizeKenyanPhone("0112345678"), "254112345678");
  assert.equal(normalizeKenyanPhone("0212345678"), null);
  assert.equal(normalizeKenyanPhone("12345"), null);
  assert.equal(normalizeKenyanPhone("+1 415 555 0100"), null);
});

test("Nairobi wall-clock converts to UTC+3", () => {
  assert.equal(nairobiToEpoch("2026-11-03", 10 * 60), Date.UTC(2026, 10, 3, 7, 0));
});

test("overlap detection", () => {
  assert.equal(overlaps({ startMin: 600, durationMin: 120 }, { startMin: 660, durationMin: 60 }), true);
  assert.equal(overlaps({ startMin: 600, durationMin: 120 }, { startMin: 720, durationMin: 60 }), false);
});

// These tests read the hours from lib/config.ts, so they stay valid when the artist changes them.
const NOW = nairobiToEpoch("2026-10-18", 12 * 60); // Sunday noon, Nairobi
const OPEN = booking.openHour * 60;
const CLOSE = booking.closeHour * 60;

function bookableDateAfter(days: number): string {
  let d = addDays("2026-10-18", days);
  for (let i = 0; i < 14; i++, d = addDays(d, 1)) if (isBookableDate(d, NOW)) return d;
  throw new Error("no bookable date found; check workingDays in lib/config.ts");
}

test("invalid, past and closed days are not bookable", () => {
  assert.equal(isBookableDate("2026-02-30", NOW), false); // not a real date
  assert.equal(isBookableDate("2026-10-13", NOW), false); // in the past
  const open: readonly number[] = booking.workingDays;
  const closedWeekday = [0, 1, 2, 3, 4, 5, 6].find((d) => !open.includes(d));
  if (closedWeekday !== undefined) {
    let d = addDays("2026-10-18", 1);
    while (new Date(d + "T00:00:00Z").getUTCDay() !== closedWeekday) d = addDays(d, 1);
    assert.equal(isBookableDate(d, NOW), false);
  }
});

test("minimum notice hides slots that start too soon", () => {
  const earliest = NOW + booking.minNoticeHours * 3_600_000;
  const date = bookableDateAfter(1);
  for (const s of availableSlots(date, 120, [], NOW)) {
    assert.ok(nairobiToEpoch(date, s.startMin) >= earliest, `${s.label} on ${date} is inside the notice window`);
  }
  // A date well beyond the notice window offers the very first slot of the day.
  const far = bookableDateAfter(5);
  assert.equal(availableSlots(far, 120, [], NOW)[0].startMin, OPEN);
});

test("long sessions must finish before closing", () => {
  const date = bookableDateAfter(5);
  const slots = availableSlots(date, 360, [], NOW);
  assert.ok(slots.length > 0);
  for (const s of slots) assert.ok(s.startMin + 360 <= CLOSE, `${s.label} would run past closing`);
  // The next hourly start after the last one offered would not fit.
  assert.ok(slots[slots.length - 1].startMin + booking.slotStepMinutes + 360 > CLOSE);
});

test("busy ranges block overlapping slots but allow back-to-back", () => {
  const date = bookableDateAfter(5);
  const busy = { startMin: OPEN + 120, durationMin: 240 };
  const slots = availableSlots(date, 120, [busy], NOW);
  for (const s of slots) {
    assert.equal(overlaps({ startMin: s.startMin, durationMin: 120 }, busy), false, `${s.label} overlaps the busy range`);
  }
  // A session that ends exactly when the busy block starts is allowed.
  assert.ok(slots.some((s) => s.startMin === OPEN));
});
