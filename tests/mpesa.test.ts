import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Runs the real Daraja code against a small fake Daraja server, so the request format is checked
// without any money or Safaricom credentials.
let server: http.Server;
const seen: { path: string; auth?: string; body?: any }[] = [];
let queryAnswer: object = { errorCode: "500.001.1001", errorMessage: "The transaction is being processed" };

before(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = raw ? JSON.parse(raw) : undefined;
      seen.push({ path: req.url!, auth: req.headers.authorization, body });
      res.setHeader("Content-Type", "application/json");
      if (req.url!.startsWith("/oauth/v1/generate")) return res.end(JSON.stringify({ access_token: "tok-123", expires_in: "3599" }));
      if (req.url!.startsWith("/mpesa/stkpush/v1/processrequest")) {
        return res.end(JSON.stringify({ ResponseCode: "0", CheckoutRequestID: "ws_CO_TEST_1", MerchantRequestID: "mr-1" }));
      }
      if (req.url!.startsWith("/mpesa/stkpushquery/v1/query")) return res.end(JSON.stringify(queryAnswer));
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  process.env.MPESA_ENV = "sandbox";
  process.env.MPESA_API_URL = `http://127.0.0.1:${port}`;
  process.env.MPESA_CONSUMER_KEY = "key";
  process.env.MPESA_CONSUMER_SECRET = "secret";
  process.env.MPESA_SHORTCODE = "174379";
  process.env.MPESA_PASSKEY = "passkey";
  process.env.MPESA_CALLBACK_SECRET = "cb-secret-123";
  process.env.SITE_URL = "https://studio.example";
});
after(() => server.close());

const booking = { id: "abcdef12-0000-0000-0000-000000000000", phone: "254712345678", deposit_kes: 500 } as any;

test("the STK push request has the fields Daraja requires", async () => {
  const mpesa = await import("../lib/mpesa.ts");
  const stk = await mpesa.startStkPush(booking);
  assert.equal(stk.checkoutRequestId, "ws_CO_TEST_1");

  const auth = seen.find((r) => r.path.startsWith("/oauth"))!;
  assert.equal(auth.auth, `Basic ${Buffer.from("key:secret").toString("base64")}`);

  const push = seen.find((r) => r.path.startsWith("/mpesa/stkpush"))!;
  assert.equal(push.auth, "Bearer tok-123");
  const b = push.body;
  assert.equal(b.BusinessShortCode, "174379");
  assert.match(b.Timestamp, /^\d{14}$/, "timestamp is YYYYMMDDHHmmss");
  assert.equal(b.Password, Buffer.from(`174379passkey${b.Timestamp}`).toString("base64"), "password = base64(shortcode + passkey + timestamp)");
  assert.equal(b.Amount, 500);
  assert.equal(b.PhoneNumber, "254712345678");
  assert.equal(b.PartyA, "254712345678");
  assert.equal(b.CallBackURL, "https://studio.example/api/mpesa/callback/cb-secret-123", "callback is public HTTPS and carries the secret");
  assert.equal(b.TransactionType, "CustomerPayBillOnline");
});

test("a pending prompt is not treated as an answer", async () => {
  const mpesa = await import("../lib/mpesa.ts");
  queryAnswer = { errorCode: "500.001.1001", errorMessage: "The transaction is being processed" };
  assert.equal(await mpesa.queryStk("ws_CO_TEST_1"), null);
});

test("a finished prompt is read as success or failure", async () => {
  const mpesa = await import("../lib/mpesa.ts");
  queryAnswer = { ResultCode: "0", ResultDesc: "The service request is processed successfully." };
  assert.deepEqual((await mpesa.queryStk("ws_CO_TEST_1"))?.success, true);
  queryAnswer = { ResultCode: "1032", ResultDesc: "Request cancelled by user" };
  const failed = await mpesa.queryStk("ws_CO_TEST_1");
  assert.equal(failed?.success, false);
  assert.equal(failed?.resultCode, 1032);
});

test("the callback body is parsed into a receipt and amount", async () => {
  const mpesa = await import("../lib/mpesa.ts");
  const parsed = mpesa.parseCallback({
    Body: {
      stkCallback: {
        MerchantRequestID: "mr-1", CheckoutRequestID: "ws_CO_TEST_1", ResultCode: 0, ResultDesc: "ok",
        CallbackMetadata: { Item: [{ Name: "Amount", Value: 500 }, { Name: "MpesaReceiptNumber", Value: "SGR7XYZ123" }, { Name: "PhoneNumber", Value: 254712345678 }] },
      },
    },
  });
  assert.equal(parsed?.checkoutRequestId, "ws_CO_TEST_1");
  assert.equal(parsed?.result.success, true);
  assert.equal(parsed?.result.amount, 500);
  assert.equal(parsed?.result.receipt, "SGR7XYZ123");
  assert.equal(mpesa.parseCallback({ nonsense: true }), null);
});

test("setup problems are reported in plain words", async () => {
  const mpesa = await import("../lib/mpesa.ts");
  assert.deepEqual(mpesa.mpesaSetupProblems(), []);
  const siteBefore = process.env.SITE_URL;
  process.env.SITE_URL = "http://localhost:3000";
  assert.ok(mpesa.mpesaSetupProblems().some((p) => p.includes("public https")));
  process.env.SITE_URL = siteBefore;
  process.env.MPESA_ENV = "live";
  process.env.MPESA_SHORTCODE = "174379";
  assert.ok(mpesa.mpesaSetupProblems().some((p) => p.includes("sandbox test number")));
  process.env.MPESA_ENV = "mock";
  assert.deepEqual(mpesa.mpesaSetupProblems(), [], "mock mode needs no setup");
});
