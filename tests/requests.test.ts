import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { clearTestRows, TAG } from "./support.ts";

delete process.env.BOOKING_PAYMENTS;

const { createRequest, createHold, getBooking, adminUpdateBooking, listBookings, adminCounts, retryHold, slotsFor } = await import("../lib/bookings.ts");
const { addDays, nairobiNowDate } = await import("../lib/slots.ts");
const { paymentMode, depositInstructions } = await import("../lib/payments.ts");
const { publicView } = await import("../lib/publicView.ts");

before(clearTestRows);
after(clearTestRows);

const DATE = addDays(nairobiNowDate(Date.now()), 3);
const base = {
  name: `${TAG}Request`, phone: "0712345678", style: "Fine line", concept: "A small swallow on the wrist",
  size: "small" as const, placement: "Wrist", refs: [] as string[], date: DATE,
};

test("request mode is the default, and M-Pesa is opt-in", () => {
  assert.equal(paymentMode(), "request");
  process.env.BOOKING_PAYMENTS = "mpesa";
  assert.equal(paymentMode(), "mpesa");
  process.env.BOOKING_PAYMENTS = "anything-else";
  assert.equal(paymentMode(), "request", "unknown values fall back to request mode");
  delete process.env.BOOKING_PAYMENTS;
});

test("a request holds its slot with no timer and no payment prompt", async () => {
  const r = await createRequest({ ...base, startMin: 10 * 60 });
  assert.ok(r.ok);
  assert.equal(r.booking.status, "requested");
  assert.equal(r.booking.hold_expires_at, 0, "requests never expire on a timer");
  assert.equal(r.booking.checkout_request_id, null, "no M-Pesa checkout is created");
  // The slot is now taken for everyone else, including an M-Pesa hold.
  assert.equal((await createRequest({ ...base, startMin: 10 * 60 })).ok, false);
  assert.equal((await createHold({ ...base, startMin: 10 * 60 })).ok, false);
  assert.ok(!(await slotsFor(DATE, "small")).some((s) => s.startMin === 10 * 60));
});

test("a request cannot be pushed into the M-Pesa retry flow", async () => {
  const r = await createRequest({ ...base, startMin: 13 * 60 });
  assert.ok(r.ok);
  assert.equal((await retryHold(r.booking.id)).ok, false);
  assert.equal((await getBooking(r.booking.id))!.status, "requested");
});

test("accepting confirms the deposit and stores the M-Pesa code", async () => {
  const r = await createRequest({ ...base, startMin: 15 * 60 });
  assert.ok(r.ok);
  const res = await adminUpdateBooking(r.booking.id, "accept", "  SGR7XYZ123  ");
  assert.equal(res.ok, true);
  const row = (await getBooking(r.booking.id))!;
  assert.equal(row.status, "confirmed");
  assert.equal(row.mpesa_receipt, "SGR7XYZ123");
  assert.equal(row.paid_amount, row.deposit_kes);
  assert.ok(row.confirmed_at);
});

test("accepting without a code is fine, and the code is optional", async () => {
  const r = await createRequest({ ...base, startMin: 17 * 60 });
  assert.ok(r.ok);
  assert.equal((await adminUpdateBooking(r.booking.id, "accept")).ok, true);
  assert.equal((await getBooking(r.booking.id))!.mpesa_receipt, null);
});

test("declining frees the slot for someone else", async () => {
  const r = await createRequest({ ...base, startMin: 19 * 60 });
  assert.ok(r.ok);
  assert.equal((await adminUpdateBooking(r.booking.id, "decline")).ok, true);
  assert.equal((await getBooking(r.booking.id))!.status, "cancelled");
  assert.ok((await createRequest({ ...base, startMin: 19 * 60 })).ok, "the freed slot can be requested again");
});

test("accept and decline only work on requests", async () => {
  const confirmedReq = await createRequest({ ...base, startMin: 21 * 60 });
  assert.ok(confirmedReq.ok);
  const id = confirmedReq.booking.id;
  await adminUpdateBooking(id, "accept");
  assert.equal((await adminUpdateBooking(id, "decline")).ok, false, "a confirmed booking can't be declined");
  assert.equal((await adminUpdateBooking(id, "accept")).ok, false, "and can't be accepted twice");
});

test("the dashboard lists requests and counts them", async () => {
  const r = await createRequest({ ...base, startMin: 7 * 60 });
  assert.ok(r.ok);
  const requests = await listBookings("requests");
  assert.ok(requests.some((x) => x.id === r.booking.id));
  assert.ok(requests.every((x) => x.status === "requested"));
  assert.ok((await adminCounts()).requests >= 1);
});

test("the client's status page gets the deposit instructions and a short reference", async () => {
  const r = await createRequest({ ...base, date: addDays(DATE, 1), startMin: 8 * 60 });
  assert.ok(r.ok);
  const view = publicView(r.booking);
  assert.equal(view.status, "requested");
  assert.match(view.instructions, /KES 500/);
  assert.match(view.instructions, /Send Money/);
  assert.equal(view.reference, r.booking.id.slice(0, 8).toUpperCase());
  assert.ok(depositInstructions(500).includes("500"));
});
