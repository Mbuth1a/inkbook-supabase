// Optional source-IP check for Safaricom's callbacks.
//
// Safaricom does not publish official callback IP ranges, and the community lists can change.
// So this check is OFF unless MPESA_CALLBACK_IPS is set, and the real protection is
// verifyStk() in lib/mpesa.ts, which asks Safaricom directly before any payment is confirmed.
//
// Behind Caddy, the visitor's real IP arrives in a header Caddy sets. We only read that header
// when MPESA_TRUST_PROXY=1, because anyone can send that header themselves otherwise.

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!/^\d{1,3}$/.test(p) || v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [net, bitsRaw] = cidr.trim().split("/");
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  const a = ipToInt(ip.trim());
  const b = ipToInt(net);
  if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

export function callbackSourceIp(req: Request): string | null {
  if (process.env.MPESA_TRUST_PROXY !== "1") return null;
  return req.headers.get("x-real-ip")?.trim() || null;
}

export function callbackIpAllowed(ip: string | null): boolean {
  const list = (process.env.MPESA_CALLBACK_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return true; // check is off
  if (!ip) return false; // check is on but we cannot see the caller's address
  return list.some((cidr) => ipInCidr(ip, cidr));
}
