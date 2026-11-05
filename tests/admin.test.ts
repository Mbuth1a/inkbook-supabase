import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { clearTestRows, TAG } from "./support.ts";

const { createHold, setCheckout, applyPaymentResult, adminUpdateBooking, adminCounts, listBookings, getBooking } = await import(
  "../lib/bookings.ts"
);
const { validateGalleryInput, galleryStyles } = await import("../lib/gallery.ts");
const { nairobiToEpoch } = await import("../lib/slots.ts");

before(clearTestRows);
after(clearTestRows);

const NOW = nairobiToEpoch("2026-10-18", 12 * 60);
const DATE = "2026-10-22";
const base = {
  name: `${TAG}Admin`, phone: "254711222333", style: "Fine line", concept: "Test",
  size: "small" as const, placement: "Arm", refs: [] as string[], date: DATE,
};
const ok = { success: true, resultCode: 0, resultDesc: "ok", amount: 3000, receipt: "RCT1" };

// Creates a confirmed booking at the given start minute.
async function confirmed(startMin: number) {
  const r = await createHold({ ...base, startMin }, NOW);
  assert.ok(r.ok);
  await setCheckout(r.booking.id, `ck-${startMin}-${Math.random()}`, "mr");
  const row = (await getBooking(r.booking.id))!;
  await applyPaymentResult(row.checkout_request_id!, ok, NOW);
  return (await getBooking(r.booking.id))!;
}

test("artist can mark a confirmed session done, and it stays taken", async () => {
  const b = await confirmed(9 * 60);
  const r = await adminUpdateBooking(b.id, "complete");
  assert.equal(r.ok, true);
  assert.equal((await getBooking(b.id))!.status, "completed");
  assert.equal((await adminUpdateBooking(b.id, "cancel")).ok, false, "a completed session cannot be cancelled");
});

test("cancelling frees the slot and records who did it", async () => {
  const b = await confirmed(14 * 60);
  const r = await adminUpdateBooking(b.id, "cancel");
  assert.equal(r.ok, true);
  assert.equal((await getBooking(b.id))!.status, "cancelled");
  assert.match((await getBooking(b.id))!.failure_reason!, /Cancelled by the studio/);
  const again = await createHold({ ...base, startMin: 14 * 60 }, NOW);
  assert.ok(again.ok, "the cancelled slot can be booked again");
});

test("unknown booking ids are reported, not crashed on", async () => {
  assert.deepEqual(await adminUpdateBooking("00000000-0000-4000-8000-000000000000", "complete"), { ok: false, error: "not_found" });
});

test("resolve only works on payment problems", async () => {
  const b = await confirmed(16 * 60);
  assert.equal((await adminUpdateBooking(b.id, "resolve")).ok, false);
});

test("the action list and counts reflect the bookings", async () => {
  const counts = await adminCounts(NOW);
  assert.ok(counts.upcoming >= 0);
  const upcoming = await listBookings("upcoming", NOW);
  assert.ok(upcoming.every((x) => x.status === "confirmed"));
  assert.ok((await listBookings("cancelled", NOW)).every((x) => x.status === "cancelled"));
});

test("gallery uploads need a known style and Fresh or Healed", () => {
  assert.equal(validateGalleryInput({ style: "Not sure yet", state: "Fresh" }).ok, false, "'Not sure yet' is not a style of work");
  assert.equal(validateGalleryInput({ style: galleryStyles[0], state: "Shiny" }).ok, false);
  const good = validateGalleryInput({ style: galleryStyles[0], state: "Healed", alt: "  Rose  " });
  assert.equal(good.ok, true);
  if (good.ok) assert.equal(good.value.alt, "Rose");
});
