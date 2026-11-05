import { randomUUID } from "node:crypto";
import { booking, sizes, type SizeKey } from "./config.ts";
import { availableSlots, nairobiNowDate, overlaps, type Busy } from "./slots.ts";
import { notifyBookingConfirmed, notifyNeedsReview } from "./notify.ts";
import { supabase } from "./supabase.ts";

export type BookingStatus =
  | "pending"
  | "requested"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "failed"
  | "expired"
  | "paid_conflict";

export type BookingRow = {
  id: string;
  status: BookingStatus;
  name: string;
  phone: string;
  email: string | null;
  style: string;
  concept: string;
  size: SizeKey;
  placement: string;
  size_cm: string | null;
  refs: string;
  date: string;
  start_min: number;
  duration_min: number;
  deposit_kes: number;
  hold_expires_at: number;
  checkout_request_id: string | null;
  merchant_request_id: string | null;
  mpesa_receipt: string | null;
  paid_amount: number | null;
  failure_reason: string | null;
  needs_review: boolean;
  created_at: number;
  confirmed_at: number | null;
};

export type NewBooking = {
  name: string;
  phone: string;
  email?: string;
  style: string;
  concept: string;
  size: SizeKey;
  placement: string;
  sizeCm?: string;
  refs: string[];
  date: string;
  startMin: number;
};

// A booking in one of these states has been through payment already. Late or repeated
// payment callbacks must never change it, and the client can no longer retry it.
const SETTLED: BookingStatus[] = ["confirmed", "completed", "cancelled", "paid_conflict"];

// Throws on a database error so a failed query is never mistaken for "no rows".
function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data as T;
}

// Rows that currently block the calendar: paid (or done), or held and not yet expired.
// Cancelled bookings free their slot.
async function busyForDate(date: string, now: number, ignoreId?: string): Promise<Busy[]> {
  let q = supabase()
    .from("bookings")
    .select("start_min, duration_min")
    .eq("date", date)
    .or(`status.in.(confirmed,completed,requested),and(status.eq.pending,hold_expires_at.gt.${now})`);
  if (ignoreId) q = q.neq("id", ignoreId);
  const rows = ok(await q) as { start_min: number; duration_min: number }[];
  const busy: Busy[] = rows.map((r) => ({ startMin: r.start_min, durationMin: r.duration_min }));
  const blocked = ok(await supabase().from("blocked_dates").select("date").eq("date", date).maybeSingle());
  if (blocked) busy.push({ startMin: 0, durationMin: 24 * 60 });
  return busy;
}

export async function slotsFor(date: string, size: SizeKey, now = Date.now()) {
  return availableSlots(date, sizes[size].durationMin, await busyForDate(date, now), now);
}

export type HoldResult = { ok: true; booking: BookingRow } | { ok: false; error: "slot_taken" | "invalid_slot" };

// Shared by createHold and createRequest. The slot list is checked first so the client gets a
// friendly answer, then the database function re-checks the slot under a lock and inserts.
async function insertBooking(
  input: NewBooking,
  status: "pending" | "requested",
  holdUntil: number,
  now: number
): Promise<HoldResult> {
  const duration = sizes[input.size].durationMin;
  const free = availableSlots(input.date, duration, await busyForDate(input.date, now), now);
  if (!free.some((s) => s.startMin === input.startMin)) return { ok: false, error: "slot_taken" };

  const id = randomUUID();
  const inserted = ok(
    await supabase().rpc("create_booking_request", {
      p_id: id,
      p_status: status,
      p_name: input.name,
      p_phone: input.phone,
      p_email: input.email ?? null,
      p_style: input.style,
      p_concept: input.concept,
      p_size: input.size,
      p_placement: input.placement,
      p_size_cm: input.sizeCm ?? null,
      p_refs: JSON.stringify(input.refs),
      p_date: input.date,
      p_start_min: input.startMin,
      p_duration: duration,
      p_deposit: booking.depositKes,
      p_hold_until: holdUntil,
      p_now: now,
    })
  );
  if (!inserted) return { ok: false, error: "slot_taken" };
  return { ok: true, booking: (await getBooking(id))! };
}

export function createHold(input: NewBooking, now = Date.now()): Promise<HoldResult> {
  return insertBooking(input, "pending", now + booking.holdMinutes * 60_000, now);
}

// Request mode: same checks as createHold, but no M-Pesa prompt and no timer. The slot stays
// blocked until the artist accepts or declines the request on the dashboard.
export function createRequest(input: NewBooking, now = Date.now()): Promise<HoldResult> {
  return insertBooking(input, "requested", 0, now);
}

export async function getBooking(id: string): Promise<BookingRow | undefined> {
  return ok(await supabase().from("bookings").select("*").eq("id", id).maybeSingle()) ?? undefined;
}

export async function getByCheckoutId(checkoutRequestId: string): Promise<BookingRow | undefined> {
  return ok(await supabase().from("bookings").select("*").eq("checkout_request_id", checkoutRequestId).maybeSingle()) ?? undefined;
}

export async function setCheckout(id: string, checkoutRequestId: string, merchantRequestId: string) {
  ok(await supabase().from("bookings").update({ checkout_request_id: checkoutRequestId, merchant_request_id: merchantRequestId }).eq("id", id));
}

export async function releaseHold(id: string, reason: string) {
  ok(await supabase().from("bookings").update({ status: "failed", failure_reason: reason }).eq("id", id).eq("status", "pending"));
}

export async function expireStale(now = Date.now()) {
  ok(await supabase().from("bookings").update({ status: "expired" }).eq("status", "pending").lte("hold_expires_at", now));
}

// Lets a client try again after cancelling the prompt or letting it time out.
// A live hold is extended; a released slot is only re-taken if nobody else grabbed it.
export async function retryHold(id: string, now = Date.now()): Promise<HoldResult> {
  const row = await getBooking(id);
  if (!row || SETTLED.includes(row.status) || row.status === "requested") {
    return { ok: false, error: "invalid_slot" };
  }
  const free = availableSlots(row.date, row.duration_min, await busyForDate(row.date, now, id), now);
  if (!free.some((s) => s.startMin === row.start_min)) return { ok: false, error: "slot_taken" };
  // The database function re-checks the slot under the same lock as new bookings.
  const restarted = ok(
    await supabase().rpc("retry_booking_hold", {
      p_id: id,
      p_hold_until: now + booking.holdMinutes * 60_000,
      p_now: now,
    })
  );
  if (!restarted) return { ok: false, error: "slot_taken" };
  return { ok: true, booking: (await getBooking(id))! };
}

export type PaymentResult = {
  success: boolean;
  resultCode: number;
  resultDesc: string;
  amount?: number;
  receipt?: string;
};

export type ApplyOutcome = "confirmed" | "failed" | "already_settled" | "paid_conflict" | "unknown";

// Single entry point for "what happened to this payment". Used by the Safaricom callback,
// the status poller (STK query fallback) and the mock simulator, so all three behave the same.
// Safe to call repeatedly: Safaricom retries callbacks and a poll can race a callback.
// Every update is conditional on the booking not being settled yet, so a late duplicate
// can never overwrite a confirmed booking.
export async function applyPaymentResult(checkoutRequestId: string, result: PaymentResult, now = Date.now()): Promise<ApplyOutcome> {
  const row = await getByCheckoutId(checkoutRequestId);
  if (!row) return "unknown";
  if (SETTLED.includes(row.status)) return "already_settled";

  if (!result.success) {
    if (row.status === "pending") {
      ok(
        await supabase()
          .from("bookings")
          .update({ status: "failed", failure_reason: `${result.resultCode}: ${result.resultDesc}`.slice(0, 200) })
          .eq("id", row.id)
          .eq("status", "pending")
      );
    }
    return "failed";
  }

  const paid = result.amount ?? row.deposit_kes;
  const taken = (await busyForDate(row.date, now, row.id)).some((b) =>
    overlaps({ startMin: row.start_min, durationMin: row.duration_min }, b)
  );

  // Money arrived but the slot can't be honoured (hold lapsed and someone else booked it,
  // or the amount was short). Keep the money trail and flag it for a manual refund/rebook.
  let outcome: "confirmed" | "paid_conflict";
  let patch: Record<string, unknown>;
  if (taken || paid < row.deposit_kes) {
    outcome = "paid_conflict";
    patch = {
      status: "paid_conflict",
      needs_review: true,
      mpesa_receipt: result.receipt ?? null,
      paid_amount: paid,
      failure_reason: taken ? "Paid after the hold lapsed and the slot was taken" : `Underpaid: got ${paid}, needed ${row.deposit_kes}`,
    };
  } else {
    outcome = "confirmed";
    patch = { status: "confirmed", confirmed_at: now, mpesa_receipt: result.receipt ?? null, paid_amount: paid, failure_reason: null };
  }

  const updated = ok(
    await supabase()
      .from("bookings")
      .update(patch)
      .eq("id", row.id)
      .not("status", "in", `(${SETTLED.join(",")})`)
      .select("id")
  );
  if (updated.length === 0) return "already_settled";

  const fresh = (await getByCheckoutId(checkoutRequestId))!;
  // Fire-and-forget: a slow SMS provider must never hold up the callback response to Safaricom.
  void (outcome === "confirmed" ? notifyBookingConfirmed(fresh) : notifyNeedsReview(fresh)).catch((e) =>
    console.error("[notify] failed", e)
  );
  return outcome;
}

// ---- Artist dashboard ----------------------------------------------------------------

export type AdminView = "requests" | "upcoming" | "past" | "action" | "cancelled";

export async function listBookings(view: AdminView, now = Date.now()): Promise<BookingRow[]> {
  await expireStale(now);
  const today = nairobiNowDate(now);
  const base = supabase().from("bookings").select("*");
  switch (view) {
    case "requests":
      return ok(await base.eq("status", "requested").order("date", { ascending: true }).order("start_min", { ascending: true }));
    case "upcoming":
      return ok(await base.eq("status", "confirmed").gte("date", today).order("date", { ascending: true }).order("start_min", { ascending: true }));
    case "past":
      // Finished sessions, plus confirmed ones whose date has passed and are waiting to be marked done.
      return ok(
        await base
          .or(`status.eq.completed,and(status.eq.confirmed,date.lt.${today})`)
          .order("date", { ascending: false })
          .order("start_min", { ascending: false })
          .limit(100)
      );
    case "action":
      return ok(await base.eq("status", "paid_conflict").order("created_at", { ascending: false }));
    case "cancelled":
      return ok(
        await base.eq("status", "cancelled").order("date", { ascending: false }).order("start_min", { ascending: false }).limit(100)
      );
  }
}

export type AdminCounts = {
  requests: number;
  upcoming: number;
  today: number;
  past: number;
  action: number;
  cancelled: number;
  depositsKes: number;
};

function countQuery() {
  return supabase().from("bookings").select("*", { count: "exact", head: true });
}

export async function adminCounts(now = Date.now()): Promise<AdminCounts> {
  await expireStale(now);
  const today = nairobiNowDate(now);
  // Counts only (no rows transferred). Each query is built fresh because Supabase queries are one-shot.
  const countWhere = async (apply: (q: ReturnType<typeof countQuery>) => ReturnType<typeof countQuery>): Promise<number> => {
    const res = await apply(countQuery());
    if (res.error) throw new Error(`Database error: ${res.error.message}`);
    return res.count ?? 0;
  };
  const deposits = ok(
    await supabase().from("bookings").select("paid_amount, deposit_kes").in("status", ["confirmed", "completed"])
  ) as { paid_amount: number | null; deposit_kes: number }[];
  return {
    requests: await countWhere((q) => q.eq("status", "requested")),
    upcoming: await countWhere((q) => q.eq("status", "confirmed").gte("date", today)),
    today: await countWhere((q) => q.eq("status", "confirmed").eq("date", today)),
    past: await countWhere((q) => q.or(`status.eq.completed,and(status.eq.confirmed,date.lt.${today})`)),
    action: await countWhere((q) => q.eq("status", "paid_conflict")),
    cancelled: await countWhere((q) => q.eq("status", "cancelled")),
    depositsKes: deposits.reduce((sum, r) => sum + (r.paid_amount ?? r.deposit_kes), 0),
  };
}

export type AdminAction = "accept" | "decline" | "complete" | "cancel" | "resolve";
export type AdminResult = { ok: true; booking: BookingRow } | { ok: false; error: "not_found" | "invalid_state" };

// accept:   requested -> confirmed (the artist has received the M-Pesa deposit; optional M-Pesa code is stored)
// decline:  requested -> cancelled (frees the slot)
// complete: confirmed -> completed (session done; the slot stays taken)
// cancel:   confirmed -> cancelled (frees the slot; the deposit is not refunded automatically)
// resolve:  paid_conflict -> cancelled (the artist has refunded or rebooked the client by hand)
// Each update only applies if the status is still the one the action expects, so two clicks
// (or two artists) can't both act on the same booking.
export async function adminUpdateBooking(id: string, action: AdminAction, receipt?: string): Promise<AdminResult> {
  const row = await getBooking(id);
  if (!row) return { ok: false, error: "not_found" };
  const now = Date.now();
  const code = receipt?.trim().slice(0, 40) || null;

  let from: BookingStatus;
  let patch: Record<string, unknown>;
  if (action === "accept" && row.status === "requested") {
    from = "requested";
    patch = { status: "confirmed", confirmed_at: now, paid_amount: row.deposit_kes, mpesa_receipt: code, failure_reason: null };
  } else if (action === "decline" && row.status === "requested") {
    from = "requested";
    patch = { status: "cancelled", failure_reason: "Declined by the studio" };
  } else if (action === "complete" && row.status === "confirmed") {
    from = "confirmed";
    patch = { status: "completed" };
  } else if (action === "cancel" && row.status === "confirmed") {
    from = "confirmed";
    patch = { status: "cancelled", failure_reason: "Cancelled by the studio" };
  } else if (action === "resolve" && row.status === "paid_conflict") {
    from = "paid_conflict";
    patch = {
      status: "cancelled",
      needs_review: false,
      failure_reason: `${row.failure_reason ? row.failure_reason + " | " : ""}Resolved by the studio`,
    };
  } else {
    return { ok: false, error: "invalid_state" };
  }

  const updated = ok(await supabase().from("bookings").update(patch).eq("id", id).eq("status", from).select("id"));
  if (updated.length === 0) return { ok: false, error: "invalid_state" };
  return { ok: true, booking: (await getBooking(id))! };
}
