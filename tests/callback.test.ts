import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { clearTestRows, TAG } from "./support.ts";

let server: http.Server;
// What the fake Safaricom says when we ask about a CheckoutRequestID.
let answers: Record<string, object> = {};

before(async () => {
  await clearTestRows();
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url!.startsWith("/oauth/v1/generate")) return res.end(JSON.stringify({ access_token: "t", expires_in: "3599" }));
      if (req.url!.startsWith("/mpesa/stkpushquery/v1/query")) {
        const id = JSON.parse(raw).CheckoutRequestID as string;
        return res.end(JSON.stringify(answers[id] ?? { errorCode: "400.002.02", errorMessage: "Bad Request - Invalid CheckoutRequestID" }));
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  Object.assign(process.env, {
    MPESA_ENV: "sandbox",
    MPESA_API_URL: `http://127.0.0.1:${port}`,
    MPESA_CONSUMER_KEY: "k",
    MPESA_CONSUMER_SECRET: "s",
    MPESA_SHORTCODE: "174379",
    MPESA_PASSKEY: "p",
    MPESA_CALLBACK_SECRET: "cb-secret-xyz",
    SITE_URL: "https://studio.example",
  });
});
after(async () => {
  server.close();
  await clearTestRows();
});

const { createHold, setCheckout, getBooking } = await import("../lib/bookings.ts");
const { handleStkCallback } = await import("../lib/callback.ts");
const { ipInCidr, callbackIpAllowed } = await import("../lib/callbackGuard.ts");
const { addDays, nairobiNowDate } = await import("../lib/slots.ts");

// A booking waiting for payment, with a known CheckoutRequestID.
let counter = 0;
async function pendingBooking() {
  counter++;
  const r = await createHold(
    { name: `${TAG}Callback`, phone: "254711000111", style: "Fine line", concept: "test", size: "small", placement: "Arm", refs: [], date: addDays(nairobiNowDate(Date.now()), 2 + counter), startMin: 10 * 60 },
    Date.now()
  );
  assert.ok(r.ok, "hold created");
  const checkout = `ws_CO_CB_${Date.now()}_${counter}`;
  await setCheckout(r.booking.id, checkout, "mr");
  return { id: r.booking.id, checkout };
}

function callback(checkout: string, resultCode: number, secret = "cb-secret-xyz", headers: Record<string, string> = {}) {
  const body = {
    Body: {
      stkCallback: {
        CheckoutRequestID: checkout, MerchantRequestID: "mr", ResultCode: resultCode, ResultDesc: "x",
        CallbackMetadata: resultCode === 0 ? { Item: [{ Name: "Amount", Value: 500 }, { Name: "MpesaReceiptNumber", Value: "RCPT1" }] } : undefined,
      },
    },
  };
  const ip = headers["x-real-ip"] ?? null;
  return handleStkCallback({ secret, body, sourceIp: ip });
}

test("a forged callback for a payment Safaricom does not know about confirms nothing", async () => {
  const b = await pendingBooking();
  const res = await callback(b.checkout, 0); // Safaricom answers 'unknown ID' for this checkout
  assert.equal(res.status, 200);
  assert.equal((await getBooking(b.id))!.status, "pending");
});

test("a real payment is confirmed only after Safaricom agrees", async () => {
  const b = await pendingBooking();
  answers[b.checkout] = { ResultCode: "0", ResultDesc: "processed" };
  const res = await callback(b.checkout, 0);
  assert.equal(res.status, 200);
  const row = (await getBooking(b.id))!;
  assert.equal(row.status, "confirmed");
  assert.equal(row.mpesa_receipt, "RCPT1");
});

test("a cancelled prompt is released once Safaricom confirms it", async () => {
  const b = await pendingBooking();
  answers[b.checkout] = { ResultCode: "1032", ResultDesc: "Request cancelled by user" };
  await callback(b.checkout, 1032);
  assert.equal((await getBooking(b.id))!.status, "failed");
});

test("a wrong secret in the URL is refused", async () => {
  const b = await pendingBooking();
  answers[b.checkout] = { ResultCode: "0", ResultDesc: "processed" };
  const res = await callback(b.checkout, 0, "guessed-secret");
  assert.equal(res.status, 404);
  assert.equal((await getBooking(b.id))!.status, "pending");
});

test("CIDR matching is exact", () => {
  assert.equal(ipInCidr("196.201.212.9", "196.201.212.0/24"), true);
  assert.equal(ipInCidr("196.201.213.9", "196.201.212.0/24"), false);
  assert.equal(ipInCidr("196.201.212.127", "196.201.212.127"), true, "a single address without /32 also works");
  assert.equal(ipInCidr("not-an-ip", "196.201.212.0/24"), false);
});

test("the IP check is off by default, and when on it needs the proxy-provided address", () => {
  delete process.env.MPESA_CALLBACK_IPS;
  assert.equal(callbackIpAllowed(null), true, "off: anything goes (the verification still applies)");

  process.env.MPESA_CALLBACK_IPS = "196.201.212.0/24";
  assert.equal(callbackIpAllowed(null), false, "on but no visible address: refused");
  assert.equal(callbackIpAllowed("10.0.0.5"), false);
  assert.equal(callbackIpAllowed("196.201.212.50"), true);
  delete process.env.MPESA_CALLBACK_IPS;
});

test("a request from outside the allowed range is refused before anything else", async () => {
  const b = await pendingBooking();
  answers[b.checkout] = { ResultCode: "0", ResultDesc: "processed" };
  process.env.MPESA_CALLBACK_IPS = "196.201.212.0/24";
  try {
    const refused = await callback(b.checkout, 0, "cb-secret-xyz", { "x-real-ip": "10.9.9.9" });
    assert.equal(refused.status, 404);
    assert.equal((await getBooking(b.id))!.status, "pending");
    const allowed = await callback(b.checkout, 0, "cb-secret-xyz", { "x-real-ip": "196.201.212.50" });
    assert.equal(allowed.status, 200);
    assert.equal((await getBooking(b.id))!.status, "confirmed");
  } finally {
    delete process.env.MPESA_CALLBACK_IPS;
    delete process.env.MPESA_TRUST_PROXY;
  }
});

test("without MPESA_TRUST_PROXY the forwarded header is ignored", async () => {
  process.env.MPESA_CALLBACK_IPS = "196.201.212.0/24";
  delete process.env.MPESA_TRUST_PROXY;
  const req = new Request("https://x/", { headers: { "x-real-ip": "196.201.212.50" } });
  const { callbackSourceIp, callbackIpAllowed: allowed } = await import("../lib/callbackGuard.ts");
  assert.equal(callbackSourceIp(req), null, "header not trusted unless the proxy setting is on");
  assert.equal(allowed(callbackSourceIp(req)), false);
  delete process.env.MPESA_CALLBACK_IPS;
});
