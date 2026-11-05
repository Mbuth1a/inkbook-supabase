import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { MAX_REF_BYTES, MAX_REF_IMAGES } from "@/lib/config";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { REFERENCE_BUCKET } from "@/lib/storage";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

type Wanted = { type?: unknown; size?: unknown };

// Step 1 of a reference upload. The browser sends the type and size of each photo; the server
// checks them and returns a one-time link for each. The photo itself then goes straight from the
// browser to storage, so it never passes through this server (Vercel limits request sizes).
export async function POST(req: Request) {
  if (!rateLimit(`upload:${clientIp(req)}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many uploads. Please wait a few minutes." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as { files?: unknown } | null;
  const wanted: Wanted[] = Array.isArray(body?.files) ? (body!.files as Wanted[]) : [];
  if (wanted.length === 0) return NextResponse.json({ error: "No files received" }, { status: 400 });
  if (wanted.length > MAX_REF_IMAGES) {
    return NextResponse.json({ error: `You can add up to ${MAX_REF_IMAGES} images` }, { status: 400 });
  }

  const out: { name: string; url: string; contentType: string }[] = [];
  for (const f of wanted) {
    const type = typeof f.type === "string" ? f.type : "";
    const ext = EXT[type];
    if (!ext) return NextResponse.json({ error: "Only JPG, PNG or WebP photos are supported." }, { status: 400 });
    const size = Number(f.size);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_REF_BYTES) {
      return NextResponse.json({ error: `Each photo must be under ${MAX_REF_BYTES / 1024 / 1024} MB.` }, { status: 400 });
    }
    const name = `${randomUUID()}.${ext}`;
    const res = await supabase().storage.from(REFERENCE_BUCKET).createSignedUploadUrl(name);
    if (res.error || !res.data) {
      return NextResponse.json({ error: "We couldn't prepare your upload. Please try again." }, { status: 500 });
    }
    out.push({ name, url: res.data.signedUrl, contentType: type });
  }
  return NextResponse.json({ files: out });
}
