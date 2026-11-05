import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { verifySession } from "./auth.ts";

export const SESSION_COOKIE = "ink_session";

export async function isAdminSession(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

// For dashboard pages: send signed-out visitors to the login page.
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdminSession())) redirect("/admin/login");
}

// For admin API routes. Returns a response to send back if the caller is not allowed, or null if fine.
// Changing requests must also come from this site (the session cookie is SameSite=Lax as well).
export async function adminApiGuard(req: Request): Promise<NextResponse | null> {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {}
      if (originHost !== host) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
    }
  }
  return null;
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: (process.env.SITE_URL || "").startsWith("https://"),
    path: "/",
    maxAge,
  };
}
