import { NextResponse } from "next/server";
import { getBooking, retryHold, setCheckout } from "@/lib/bookings";
import { startStkPush } from "@/lib/mpesa";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { publicView } from "@/lib/publicView";

export const dynamic = "force-dynamic";

// "Send the prompt again" after a cancel, a wrong PIN or a prompt that never appeared.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const existing = await getBooking(id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!rateLimit(`retry:${id}`, 4, 10 * 60_000) || !rateLimit(`retry-ip:${clientIp(req)}`, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }

  const hold = await retryHold(id);
  if (!hold.ok) {
    const taken = hold.error === "slot_taken";
    return NextResponse.json(
      { error: taken ? "Sorry, that time was taken while you were away. Please pick another slot." : "This booking can't be retried.", code: hold.error },
      { status: taken ? 409 : 400 }
    );
  }
  try {
    const stk = await startStkPush(hold.booking);
    await setCheckout(id, stk.checkoutRequestId, stk.merchantRequestId);
  } catch (e) {
    console.error("[bookings] retry STK push failed", e);
    return NextResponse.json({ error: "We couldn't send the M-Pesa prompt. Please try again." }, { status: 502 });
  }
  return NextResponse.json(publicView((await getBooking(id))!));
}
