import { NextResponse } from "next/server";
import { createHold, createRequest, releaseHold, setCheckout } from "@/lib/bookings";
import { paymentMode } from "@/lib/payments";
import { startStkPush } from "@/lib/mpesa";
import { normalizeKenyanPhone } from "@/lib/phone";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { bookingInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = bookingInput.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first?.message || "Please check the form", field: first?.path.join(".") }, { status: 400 });
  }
  const input = parsed.data;

  const phone = normalizeKenyanPhone(input.phone);
  if (!phone) {
    return NextResponse.json(
      { error: "Enter a Safaricom number, like 0712 345 678. M-Pesa prompts only work on Safaricom lines.", field: "phone" },
      { status: 400 }
    );
  }

  // Each booking sends a real prompt to a real phone, so keep abuse cheap to stop.
  if (!rateLimit(`book-ip:${clientIp(req)}`, 6, 10 * 60_000) || !rateLimit(`book-phone:${phone}`, 3, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const newBooking = {
    name: input.name,
    phone,
    email: input.email || undefined,
    style: input.style,
    concept: input.concept,
    size: input.size,
    placement: input.placement,
    sizeCm: input.sizeCm || undefined,
    refs: input.refs,
    date: input.date,
    startMin: input.startMin,
  };

  // Request mode: no M-Pesa prompt. The slot is held until the artist confirms the deposit by hand.
  if (paymentMode() === "request") {
    const req = await createRequest(newBooking);
    if (!req.ok) {
      return NextResponse.json({ error: "Sorry, that time was just taken. Please pick another slot.", code: "slot_taken" }, { status: 409 });
    }
    return NextResponse.json({ id: req.booking.id, holdExpiresAt: 0 }, { status: 201 });
  }

  const hold = await createHold(newBooking);
  if (!hold.ok) {
    return NextResponse.json(
      { error: "Sorry, that time was just taken. Please pick another slot.", code: "slot_taken" },
      { status: 409 }
    );
  }

  try {
    const stk = await startStkPush(hold.booking);
    await setCheckout(hold.booking.id, stk.checkoutRequestId, stk.merchantRequestId);
  } catch (e) {
    console.error("[bookings] STK push failed", e);
    await releaseHold(hold.booking.id, "STK push could not be sent");
    return NextResponse.json(
      { error: "We couldn't send the M-Pesa prompt. Check your number and try again in a moment." },
      { status: 502 }
    );
  }

  return NextResponse.json({ id: hold.booking.id, holdExpiresAt: hold.booking.hold_expires_at }, { status: 201 });
}
