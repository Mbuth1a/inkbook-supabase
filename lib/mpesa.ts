import { randomUUID } from "node:crypto";
import { applyPaymentResult, getBooking, type BookingRow, type PaymentResult } from "./bookings.ts";
import { booking } from "./config.ts";

// Safaricom Daraja: M-Pesa Express (STK Push). Docs: https://developer.safaricom.co.ke
// MPESA_ENV=mock keeps everything local so the flow can be built and tested with no credentials.

export type MpesaEnv = "mock" | "sandbox" | "live";

export function mpesaEnv(): MpesaEnv {
  const v = process.env.MPESA_ENV;
  return v === "sandbox" || v === "live" ? v : "mock";
}

function baseUrl() {
  // MPESA_API_URL lets the tests point at a fake Daraja server. Leave it unset in real use.
  if (process.env.MPESA_API_URL) return process.env.MPESA_API_URL.replace(/\/$/, "");
  return mpesaEnv() === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
}

// Everything that would make a real Daraja call fail, in plain words. Empty when ready.
export function mpesaSetupProblems(): string[] {
  if (mpesaEnv() === "mock") return [];
  const problems: string[] = [];
  for (const k of ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY", "MPESA_CALLBACK_SECRET"]) {
    if (!process.env[k]) problems.push(`${k} is missing in .env.local`);
  }
  const site = process.env.SITE_URL || "";
  if (!site.startsWith("https://")) {
    problems.push("SITE_URL must be your public https address (Safaricom cannot send payment results to localhost)");
  }
  if (mpesaEnv() === "live" && process.env.MPESA_SHORTCODE === "174379") {
    problems.push("MPESA_SHORTCODE is still the sandbox test number (174379), not your Paybill or Till");
  }
  return problems;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

// Daraja wants YYYYMMDDHHmmss. It must match the timestamp baked into the password.
function timestamp(): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: booking.timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g("year")}${g("month")}${g("day")}${g("hour")}${g("minute")}${g("second")}`;
}

let tokenCache: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 10_000) return tokenCache.token;
  const auth = Buffer.from(`${need("MPESA_CONSUMER_KEY")}:${need("MPESA_CONSUMER_SECRET")}`).toString("base64");
  const res = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Daraja auth failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: string };
  tokenCache = { token: json.access_token, expires: Date.now() + Number(json.expires_in) * 1000 };
  return json.access_token;
}

export function callbackUrl(): string {
  const site = (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${site}/api/mpesa/callback/${need("MPESA_CALLBACK_SECRET")}`;
}

export type StkStart = { checkoutRequestId: string; merchantRequestId: string };

export async function startStkPush(b: BookingRow): Promise<StkStart> {
  if (mpesaEnv() === "mock") {
    const checkoutRequestId = `ws_CO_MOCK_${randomUUID()}`;
    scheduleMockOutcome(checkoutRequestId, b);
    return { checkoutRequestId, merchantRequestId: `mock-${randomUUID()}` };
  }

  const problems = mpesaSetupProblems();
  if (problems.length) throw new Error(`M-Pesa is not set up: ${problems.join("; ")}`);
  const shortcode = need("MPESA_SHORTCODE");
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${need("MPESA_PASSKEY")}${ts}`).toString("base64");
  const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: process.env.MPESA_TRANSACTION_TYPE || "CustomerPayBillOnline",
      Amount: b.deposit_kes,
      PartyA: b.phone,
      PartyB: shortcode,
      PhoneNumber: b.phone,
      CallBackURL: callbackUrl(),
      AccountReference: `TATTOO-${b.id.slice(0, 8).toUpperCase()}`,
      TransactionDesc: "Tattoo deposit",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ResponseCode?: string;
    ResponseDescription?: string;
    CheckoutRequestID?: string;
    MerchantRequestID?: string;
    errorMessage?: string;
  };
  if (!res.ok || json.ResponseCode !== "0" || !json.CheckoutRequestID) {
    throw new Error(json.errorMessage || json.ResponseDescription || `STK push failed (${res.status})`);
  }
  return { checkoutRequestId: json.CheckoutRequestID, merchantRequestId: json.MerchantRequestID ?? "" };
}

// Fallback for when the callback never reaches us (server restart, Safaricom delay).
// Returns null while the customer has not yet answered the prompt.
export async function queryStk(checkoutRequestId: string): Promise<PaymentResult | null> {
  if (mpesaEnv() === "mock") return null;
  const shortcode = need("MPESA_SHORTCODE");
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${need("MPESA_PASSKEY")}${ts}`).toString("base64");
  const res = await fetch(`${baseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ BusinessShortCode: shortcode, Password: password, Timestamp: ts, CheckoutRequestID: checkoutRequestId }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { ResultCode?: string | number; ResultDesc?: string };
  // While the prompt is still open Daraja answers with an error body and no ResultCode.
  if (json.ResultCode === undefined) return null;
  const code = Number(json.ResultCode);
  // The query endpoint does not return the receipt or amount, so a "success" here is
  // confirmed on the deposit amount we asked for. The callback (when it arrives) fills in the receipt.
  return { success: code === 0, resultCode: code, resultDesc: json.ResultDesc ?? "" };
}

// The authoritative check. A callback is only believed after Safaricom confirms the same
// CheckoutRequestID. A forged callback for a payment that never happened gets no confirmation.
// Returns null while Safaricom is still processing (or does not know the ID).
export async function verifyStk(checkoutRequestId: string, attempts = 3, gapMs = 3000): Promise<PaymentResult | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await queryStk(checkoutRequestId);
      if (result) return result;
    } catch (e) {
      console.error("[mpesa] verify attempt failed", e);
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, gapMs));
  }
  return null;
}

// What Daraja POSTs to our callback URL.
type StkCallbackBody = {
  Body?: {
    stkCallback?: {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResultCode?: number;
      ResultDesc?: string;
      CallbackMetadata?: { Item?: { Name: string; Value?: string | number }[] };
    };
  };
};

export function parseCallback(body: unknown): { checkoutRequestId: string; result: PaymentResult } | null {
  const cb = (body as StkCallbackBody)?.Body?.stkCallback;
  if (!cb || typeof cb.CheckoutRequestID !== "string" || typeof cb.ResultCode !== "number") return null;
  const items = cb.CallbackMetadata?.Item ?? [];
  const pick = (name: string) => items.find((i) => i.Name === name)?.Value;
  const amount = pick("Amount");
  const receipt = pick("MpesaReceiptNumber");
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    result: {
      success: cb.ResultCode === 0,
      resultCode: cb.ResultCode,
      resultDesc: String(cb.ResultDesc ?? ""),
      amount: typeof amount === "number" ? amount : amount !== undefined ? Number(amount) : undefined,
      receipt: receipt !== undefined ? String(receipt) : undefined,
    },
  };
}

// ---- Mock mode -------------------------------------------------------------------------
// After a few seconds, act like Safaricom calling back. A number ending in 0000 simulates
// the customer pressing Cancel; ending in 1111 simulates the prompt never being answered.
function scheduleMockOutcome(checkoutRequestId: string, b: BookingRow) {
  if (b.phone.endsWith("1111")) return;
  const cancel = b.phone.endsWith("0000");
  setTimeout(async () => {
    try {
      if (!(await getBooking(b.id))) return;
      await applyPaymentResult(
        checkoutRequestId,
        cancel
          ? { success: false, resultCode: 1032, resultDesc: "Request cancelled by user" }
          : {
              success: true,
              resultCode: 0,
              resultDesc: "The service request is processed successfully.",
              amount: b.deposit_kes,
              receipt: `MOCK${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
            }
      );
    } catch (e) {
      console.error("[mpesa:mock] failed to apply simulated payment", e);
    }
  }, 4000);
}
