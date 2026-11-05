import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { adminApiGuard } from "@/lib/adminGuard";
import { sniffImage } from "@/lib/files";
import { addGalleryItem, validateGalleryInput } from "@/lib/gallery";
import { toThumbWebp, toWebp } from "@/lib/images";
import { removeGallery, uploadGallery } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024;

// One photo per request. The browser shrinks big phone photos first; the server re-encodes
// to a web-sized WebP and strips location data.
export async function POST(req: Request) {
  const denied = await adminApiGuard(req);
  if (denied) return denied;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That photo is too large (15 MB max)." }, { status: 413 });

  const input = validateGalleryInput({
    style: String(form.get("style") ?? ""),
    state: String(form.get("state") ?? ""),
    alt: String(form.get("alt") ?? ""),
  });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(bytes)) {
    return NextResponse.json({ error: "Only JPG, PNG or WebP photos are supported." }, { status: 415 });
  }

  let webp;
  try {
    webp = await toWebp(bytes);
  } catch {
    return NextResponse.json({ error: "That file couldn't be read as a photo." }, { status: 422 });
  }

  const id = randomUUID();
  const name = `${id}.webp`;
  const thumbName = `${id}.thumb.webp`;
  const thumb = await toThumbWebp(bytes);
  try {
    await uploadGallery(name, webp.data);
    await uploadGallery(thumbName, thumb);
  } catch {
    await removeGallery([name, thumbName]).catch(() => {});
    return NextResponse.json({ error: "Couldn't save the photo. Please try again." }, { status: 500 });
  }
  try {
    const item = await addGalleryItem(name, thumbName, webp.width, webp.height, input.value);
    return NextResponse.json({ ok: true, item });
  } catch {
    // The photo is in storage but not in the database: remove the files so nothing is orphaned.
    await removeGallery([name, thumbName]).catch(() => {});
    return NextResponse.json({ error: "Couldn't save the photo. Please try again." }, { status: 500 });
  }
}
