import { applyPaymentResult } from "./bookings.ts";
import { safeEqual } from "./auth.ts";
import { callbackIpAllowed } from "./callbackGuard.ts";
import { parseCallback, verifyStk } from "./mpesa.ts";

export type CallbackReply = { status: number; body?: object };

// The whole Safaricom callback decision, kept free of Next.js so it can be tested directly.
//  1. the URL secret must match (otherwise 404)
//  2. the optional source-IP allowlist must pass (otherwise 404)
//  3. the payment is confirmed by asking Safaricom (verifyStk). The body alone never confirms anything.
export async function handleStkCallback(input: { secret: string; body: unknown; sourceIp: string | null }): Promise<CallbackReply> {
  const expected = process.env.MPESA_CALLBACK_SECRET;
  if (!expected || !safeEqual(input.secret, expected)) return { status: 404 };
  if (!callbackIpAllowed(input.sourceIp)) {
    console.warn("[mpesa] callback from an address outside MPESA_CALLBACK_IPS, ignored");
    return { status: 404 };
  }

  const parsed = parseCallback(input.body);
  if (!parsed) {
    console.warn("[mpesa] callback with unexpected shape");
    return { status: 200, body: { ResultCode: 0, ResultDesc: "Accepted" } };
  }

  let verified;
  try {
    verified = await verifyStk(parsed.checkoutRequestId);
  } catch (e) {
    console.error("[mpesa] verification failed", e);
    return { status: 500, body: { ResultCode: 1, ResultDesc: "Temporary failure" } };
  }
  if (!verified) {
    // Not confirmed (yet, or ever). The booking page's status check queries Safaricom later too.
    console.warn(`[mpesa] callback ${parsed.checkoutRequestId.slice(-8)} not confirmed by Safaricom, nothing applied`);
    return { status: 200, body: { ResultCode: 0, ResultDesc: "Accepted" } };
  }
  if (verified.success !== parsed.result.success) {
    console.warn(`[mpesa] callback and Safaricom disagree for ${parsed.checkoutRequestId.slice(-8)}, using Safaricom's answer`);
  }

  try {
    const outcome = await applyPaymentResult(parsed.checkoutRequestId, {
      ...verified,
      amount: parsed.result.amount,
      receipt: parsed.result.receipt,
    });
    console.log(`[mpesa] callback ${parsed.checkoutRequestId.slice(-8)} -> ${outcome}`);
  } catch (e) {
    // A non-200 makes Safaricom retry, which is what we want if our database hiccuped.
    console.error("[mpesa] failed to apply callback", e);
    return { status: 500, body: { ResultCode: 1, ResultDesc: "Temporary failure" } };
  }
  return { status: 200, body: { ResultCode: 0, ResultDesc: "Accepted" } };
}
