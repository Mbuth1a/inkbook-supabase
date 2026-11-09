import { NextResponse } from "next/server";
import { createHold, createRequest, releaseHold, setCheckout } from "@/lib/bookings";
import { paymentMode } from "@/lib/payments";
import { startStkPush } from "@/lib/mpesa";
import { normalizeKenyanPhone } from "@/lib/phone";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { bookingInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

type NewBooking = {
  name: string; phone: string; email?: string; style: string; concept: string;
  size: string; placement: string; sizeCm?: string; date: string; startMin: number;
};

// Emails the artist through FormSubmit. Requires ARTIST_EMAIL to be set.
async function notifyArtist(b: NewBooking, id: string) {
  const to = process.env.ARTIST_EMAIL;
  if (!to) return;
  const hh = String(Math.floor(b.startMin / 60)).padStart(2, "0");
  const mm = String(b.startMin % 60).padStart(2, "0");
  const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(to)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: process.env.SITE_URL || "http://localhost:3000",
      Referer: `${process.env.SITE_URL || "http://localhost:3000"}/`,
    },
    body: JSON.stringify({
      _subject: `New booking request: ${b.name} on ${b.date}`,
      _template: "table",
      _captcha: "false",
      Booking: id,
      Name: b.name,
      Phone: b.phone,
      Email: b.email ?? "",
      Style: b.style,
      Concept: b.concept,
      Size: b.sizeCm ? `${b.size} (${b.sizeCm})` : b.size,
      Placement: b.placement,
      Date: b.date,
      Time: `${hh}:${mm}`,
      Review: `${process.env.SITE_URL}/admin?view=requests`,
    }),
  });
  const reply = (await res.json().catch(() => null)) as { success?: unknown; message?: string } | null;
  if (!res.ok || String(reply?.success) !== "true") {
    throw new Error(`FormSubmit: ${reply?.message ?? res.status}`);
  }
}

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
    try {
      await notifyArtist(newBooking, req.booking.id);
    } catch (e) {
      console.error("[bookings] artist notification failed", e);
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