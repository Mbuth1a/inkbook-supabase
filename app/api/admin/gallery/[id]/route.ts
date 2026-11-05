import { NextResponse } from "next/server";
import { adminApiGuard } from "@/lib/adminGuard";
import { deleteGalleryItem, updateGalleryItem, validateGalleryInput } from "@/lib/gallery";
import { removeGallery } from "@/lib/storage";

export const dynamic = "force-dynamic";

// Edit the style, state or caption of one photo.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await adminApiGuard(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { style?: unknown; state?: unknown; alt?: unknown; featured?: unknown } | null;
  const input = validateGalleryInput({
    style: typeof body?.style === "string" ? body.style : "",
    state: typeof body?.state === "string" ? body.state : "",
    alt: typeof body?.alt === "string" ? body.alt : "",
  });
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
  const featured = typeof body?.featured === "boolean" ? body.featured : undefined;
  const item = await updateGalleryItem(id, { ...input.value, featured });
  if (!item) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  return NextResponse.json({ ok: true, item });
}

// Remove a photo from the site and from storage.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await adminApiGuard(req);
  if (denied) return denied;
  const { id } = await params;
  const files = await deleteGalleryItem(id);
  if (!files) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  await removeGallery(files).catch(() => {});
  return NextResponse.json({ ok: true });
}
