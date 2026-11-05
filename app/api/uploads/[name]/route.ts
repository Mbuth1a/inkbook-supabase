import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/adminGuard";
import { referenceSignedUrl } from "@/lib/storage";
import { UPLOAD_NAME } from "@/lib/validation";

export const dynamic = "force-dynamic";

// Reference photos are private client material, so only the signed-in artist can open them.
// The file itself stays in a private bucket; this sends the browser to a link that expires in 5 minutes.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!(await isAdminSession())) return new Response("Not found", { status: 404 });
  if (!UPLOAD_NAME.test(name)) return new Response("Not found", { status: 404 });
  const url = await referenceSignedUrl(name);
  if (!url) return new Response("Not found", { status: 404 });
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
}
