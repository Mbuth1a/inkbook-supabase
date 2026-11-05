import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Pure authentication logic (no Next.js imports), so it can be unit tested.
// The artist signs in with one password. A signed cookie proves they did, and nothing
// about the password is stored in the cookie.

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function usable(value: string | undefined, minLength: number): value is string {
  return !!value && value.length >= minLength && !value.startsWith("change-me");
}

// The dashboard stays locked until both values are set to something real in .env.local.
export function adminConfigured(): boolean {
  return usable(process.env.ADMIN_PASSWORD, 8) && usable(process.env.SESSION_SECRET, 16);
}

const sha = (s: string) => createHash("sha256").update(s).digest();

export function checkPassword(input: string): boolean {
  if (!adminConfigured()) return false;
  // Compare fixed-length hashes so neither the length nor the content leaks through timing.
  return timingSafeEqual(sha(input), sha(process.env.ADMIN_PASSWORD!));
}

export const SESSION_MAX_AGE_S = 14 * 24 * 60 * 60;

// Changing ADMIN_PASSWORD changes this key, which signs everyone out.
function signingKey(): string {
  return `${process.env.SESSION_SECRET}:${sha(process.env.ADMIN_PASSWORD ?? "").toString("hex")}`;
}

export function signSession(nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + SESSION_MAX_AGE_S;
  const sig = createHmac("sha256", signingKey()).update(String(exp)).digest("base64url");
  return `${exp}.${sig}`;
}

export function verifySession(token: string | undefined, nowMs = Date.now()): boolean {
  if (!token || !adminConfigured()) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) * 1000 <= nowMs) return false;
  const expected = createHmac("sha256", signingKey()).update(exp).digest("base64url");
  return safeEqual(sig, expected);
}
