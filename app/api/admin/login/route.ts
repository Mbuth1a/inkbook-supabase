import { NextResponse } from "next/server";
import { adminConfigured, checkPassword, SESSION_MAX_AGE_S, signSession } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { cookieOptions, SESSION_COOKIE } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { error: "Login is not set up yet. Set ADMIN_PASSWORD and SESSION_SECRET in .env.local, then restart the site." },
      { status: 503 }
    );
  }
  if (!rateLimit(`login:${clientIp(req)}`, 6, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!checkPassword(password)) {
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, signSession(), cookieOptions(SESSION_MAX_AGE_S));
  return res;
}
