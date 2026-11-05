import { NextResponse } from "next/server";
import { listGalleryPage } from "@/lib/gallery";

export const dynamic = "force-dynamic";

// Public, paged list of the gallery for the /gallery page's "Load more" and style filters.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = await listGalleryPage({
    style: url.searchParams.get("style") ?? undefined,
    offset: Number(url.searchParams.get("offset") ?? 0) || 0,
    limit: Number(url.searchParams.get("limit") ?? 0) || undefined,
  });
  return NextResponse.json(page);
}
