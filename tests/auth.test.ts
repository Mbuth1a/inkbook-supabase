import { test } from "node:test";
import assert from "node:assert/strict";

process.env.ADMIN_PASSWORD = "correct horse battery";
process.env.SESSION_SECRET = "0123456789abcdef0123456789abcdef";

const auth = await import("../lib/auth.ts");

test("only the right password is accepted", () => {
  assert.equal(auth.checkPassword("correct horse battery"), true);
  assert.equal(auth.checkPassword("correct horse batter"), false);
  assert.equal(auth.checkPassword(""), false);
});

test("login stays locked until real values are configured", () => {
  const saved = { ...process.env };
  process.env.ADMIN_PASSWORD = "change-me-to-a-long-passphrase";
  assert.equal(auth.adminConfigured(), false);
  assert.equal(auth.checkPassword("change-me-to-a-long-passphrase"), false);
  process.env.ADMIN_PASSWORD = "short";
  assert.equal(auth.adminConfigured(), false);
  process.env.ADMIN_PASSWORD = saved.ADMIN_PASSWORD;
  assert.equal(auth.adminConfigured(), true);
});

test("a fresh session token verifies, and expires after two weeks", () => {
  const now = Date.now();
  const token = auth.signSession(now);
  assert.equal(auth.verifySession(token, now + 1000), true);
  assert.equal(auth.verifySession(token, now + 13 * 86_400_000), true);
  assert.equal(auth.verifySession(token, now + 15 * 86_400_000), false);
});

test("tampered, empty and malformed tokens are rejected", () => {
  const token = auth.signSession();
  const [exp, sig] = token.split(".");
  assert.equal(auth.verifySession(undefined), false);
  assert.equal(auth.verifySession(""), false);
  assert.equal(auth.verifySession("garbage"), false);
  assert.equal(auth.verifySession(`${Number(exp) + 99999}.${sig}`), false); // extended expiry
  assert.equal(auth.verifySession(`${exp}.${sig.slice(0, -2)}xx`), false); // altered signature
});

test("changing the password signs existing sessions out", () => {
  const token = auth.signSession();
  assert.equal(auth.verifySession(token), true);
  process.env.ADMIN_PASSWORD = "a brand new passphrase";
  assert.equal(auth.verifySession(token), false);
});
