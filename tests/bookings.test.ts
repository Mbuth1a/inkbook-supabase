import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { clearTestRows, TAG } from "./support.ts";

const { createHold, applyPaymentResult, setCheckout, getBooking, expireStale, retryHold, slotsFor } = await import(
  "../lib/bookings.ts"
);
const { nairobiToEpoch } = await import("../lib/slots.ts");

before(clearTestRows);
after(clearTestRows);

const NOW = nairobiToEpoch("2026-10-18", 12 * 60); // Sunday noon, Nairobi
const DATE = "2026-10-22"; // Thursday

const base = {
  name: `${TAG}Client`, phone: "254712345678", style: "Fine line", concept: "A small olive branch",
  size: "small" as const, placement: "Forearm", refs: [] as string[], date: DATE,
};
const ok = { success: true, resultCode: 0, resultDesc: "ok", amount: 3000, receipt: "ABC123" };

async function hold(startMin: number, now = NOW) {
  const r = await createHold({ ...base, startMin }, now);
  assert.ok(r.ok, "expected hold to succeed");
  return r.booking;
}

test("two people cannot hold overlapping slots", async () => {
  await hold(10 * 60);
  const second = await createHold({ ...base, startMin: 11 * 60 }, NOW); // overlaps 10-12
  assert.deepEqual(second, { ok: false, error: "slot_taken" });
  assert.ok((await createHold({ ...base, startMin: 12 * 60 }, NOW)).ok); // back to back is fine
});

test("successful payment confirms; duplicate callbacks are harmless", async () => {
  const b = await hold(15 * 60);
  await setCheckout(b.id, "co-1", "mr-1");
  assert.equal(await applyPaymentResult("co-1", ok, NOW + 30_000), "confirmed");
  assert.equal(await applyPaymentResult("co-1", ok, NOW + 31_000), "already_settled");
  const row = (await getBooking(b.id))!;
  assert.equal(row.status, "confirmed");
  assert.equal(row.mpesa_receipt, "ABC123");
});

test("cancelled payment frees the slot, and retry can re-take it", async () => {
  const date = "2026-10-23";
  const r = await createHold({ ...base, date, startMin: 10 * 60 }, NOW);
  assert.ok(r.ok);
  await setCheckout(r.booking.id, "co-2", "mr-2");
  assert.equal(await applyPaymentResult("co-2", { success: false, resultCode: 1032, resultDesc: "cancelled" }, NOW), "failed");
  assert.ok((await slotsFor(date, "small", NOW)).some((s) => s.startMin === 10 * 60), "slot is free again");
  assert.ok((await retryHold(r.booking.id, NOW + 1000)).ok);
  assert.equal((await getBooking(r.booking.id))!.status, "pending");
});

test("an unpaid hold expires and releases the slot", async () => {
  const date = "2026-10-24";
  const r = await createHold({ ...base, date, startMin: 10 * 60 }, NOW);
  assert.ok(r.ok);
  const later = NOW + 6 * 60_000;
  await expireStale(later);
  assert.equal((await getBooking(r.booking.id))!.status, "expired");
  assert.ok((await createHold({ ...base, date, startMin: 10 * 60 }, later)).ok);
});

test("late payment after the slot was re-booked is flagged for refund, not double-booked", async () => {
  const date = "2026-10-27";
  const a = await createHold({ ...base, date, startMin: 10 * 60 }, NOW);
  assert.ok(a.ok);
  await setCheckout(a.booking.id, "co-3", "mr-3");
  const later = NOW + 6 * 60_000;
  await expireStale(later);
  const b = await createHold({ ...base, name: `${TAG}Someone else`, date, startMin: 10 * 60 }, later);
  assert.ok(b.ok);
  assert.equal(await applyPaymentResult("co-3", ok, later + 10_000), "paid_conflict");
  const row = (await getBooking(a.booking.id))!;
  assert.equal(row.status, "paid_conflict");
  assert.equal(row.needs_review, true);
});

test("late payment is still honoured when the slot is still free", async () => {
  const date = "2026-10-28";
  const a = await createHold({ ...base, date, startMin: 10 * 60 }, NOW);
  assert.ok(a.ok);
  await setCheckout(a.booking.id, "co-4", "mr-4");
  const later = NOW + 7 * 60_000;
  await expireStale(later);
  assert.equal(await applyPaymentResult("co-4", ok, later), "confirmed");
});

test("underpayment is flagged, not confirmed", async () => {
  const date = "2026-10-29";
  const a = await createHold({ ...base, date, startMin: 10 * 60 }, NOW);
  assert.ok(a.ok);
  await setCheckout(a.booking.id, "co-5", "mr-5");
  assert.equal(await applyPaymentResult("co-5", { ...ok, amount: 100 }, NOW), "paid_conflict");
});
