import { randomUUID } from "node:crypto";
import { styles } from "./config.ts";
import { GALLERY_PAGE_SIZE, GALLERY_STATES, HOME_GALLERY_COUNT, type GalleryItem, type GalleryState } from "./galleryTypes.ts";
import { supabase } from "./supabase.ts";
import { galleryUrl } from "./storage.ts";

// Full-size: <uuid>.webp, thumbnail: <uuid>.thumb.webp (stored in the public "gallery" bucket)
export const GALLERY_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.thumb)?\.webp$/;

// "Not sure yet" is a booking option, not a style of finished work.
export const galleryStyles: string[] = styles.filter((s) => s !== "Not sure yet");

type Row = {
  id: string; file: string; thumb: string | null; alt: string; style: string; state: GalleryState;
  width: number; height: number; featured: boolean; created_at: number;
};

// Throws on a database error so a failed query is never mistaken for "no photos".
function ok<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data as T;
}

const toItem = (r: Row): GalleryItem => ({
  id: r.id,
  src: galleryUrl(r.file),
  thumbSrc: galleryUrl(r.thumb ?? r.file), // older photos have no thumbnail yet, so use the full image
  alt: r.alt || `${r.style} tattoo (${r.state.toLowerCase()})`,
  style: r.style,
  state: r.state,
  width: r.width,
  height: r.height,
  featured: r.featured === true,
});

// The pieces shown on the home page: the artist's featured picks, or the latest uploads if none are picked.
export async function listHomeGallery(limit = HOME_GALLERY_COUNT): Promise<GalleryItem[]> {
  const featured = ok(
    await supabase().from("gallery").select("*").eq("featured", true).order("created_at", { ascending: false }).limit(limit)
  ) as Row[];
  if (featured.length > 0) return featured.map(toItem);
  const latest = ok(
    await supabase().from("gallery").select("*").order("created_at", { ascending: false }).limit(limit)
  ) as Row[];
  return latest.map(toItem);
}

export type GalleryPage = { items: GalleryItem[]; total: number; hasMore: boolean };

// One page of the full gallery, optionally filtered to one style.
export async function listGalleryPage(opts: { style?: string; offset?: number; limit?: number }): Promise<GalleryPage> {
  const limit = Math.min(Math.max(opts.limit ?? GALLERY_PAGE_SIZE, 1), 48);
  const offset = Math.max(opts.offset ?? 0, 0);
  const style = opts.style && galleryStyles.includes(opts.style) ? opts.style : null;

  let countQ = supabase().from("gallery").select("*", { count: "exact", head: true });
  if (style) countQ = countQ.eq("style", style);
  const countRes = await countQ;
  if (countRes.error) throw new Error(`Database error: ${countRes.error.message}`);
  const total = countRes.count ?? 0;

  let pageQ = supabase().from("gallery").select("*");
  if (style) pageQ = pageQ.eq("style", style);
  const rows = ok(
    await pageQ.order("created_at", { ascending: false }).range(offset, offset + limit - 1)
  ) as Row[];
  return { items: rows.map(toItem), total, hasMore: offset + rows.length < total };
}

// For the artist's manage screen: all photos, with the raw caption and the featured flag.
export async function listGalleryForAdmin(): Promise<(GalleryItem & { captionRaw: string })[]> {
  const rows = ok(await supabase().from("gallery").select("*").order("created_at", { ascending: false })) as Row[];
  return rows.map((r) => ({ ...toItem(r), captionRaw: r.alt }));
}

export type GalleryInput = { style: string; state: string; alt?: string };

export function validateGalleryInput(input: GalleryInput): { ok: true; value: { style: string; state: GalleryState; alt: string } } | { ok: false; error: string } {
  if (!galleryStyles.includes(input.style)) return { ok: false, error: "Choose a style" };
  if (!(GALLERY_STATES as readonly string[]).includes(input.state)) return { ok: false, error: "Choose Fresh or Healed" };
  const alt = (input.alt ?? "").trim().slice(0, 120);
  return { ok: true, value: { style: input.style, state: input.state as GalleryState, alt } };
}

export async function addGalleryItem(
  file: string, thumb: string, width: number, height: number,
  input: { style: string; state: GalleryState; alt: string }, now = Date.now()
): Promise<GalleryItem> {
  const id = randomUUID();
  ok(
    await supabase().from("gallery").insert({
      id, file, thumb, alt: input.alt, style: input.style, state: input.state,
      width, height, featured: false, created_at: now,
    })
  );
  const row = ok(await supabase().from("gallery").select("*").eq("id", id).single()) as Row;
  return toItem(row);
}

export async function updateGalleryItem(
  id: string,
  input: { style: string; state: GalleryState; alt: string; featured?: boolean }
): Promise<GalleryItem | null> {
  const patch: Record<string, unknown> = { style: input.style, state: input.state, alt: input.alt };
  if (input.featured !== undefined) patch.featured = input.featured;
  ok(await supabase().from("gallery").update(patch).eq("id", id));
  const row = ok(await supabase().from("gallery").select("*").eq("id", id).maybeSingle()) as Row | null;
  return row ? toItem(row) : null;
}

// Returns the file names to delete from disk, or null if there was no such item.
export async function deleteGalleryItem(id: string): Promise<string[] | null> {
  const row = ok(await supabase().from("gallery").select("*").eq("id", id).maybeSingle()) as Row | null;
  if (!row) return null;
  ok(await supabase().from("gallery").delete().eq("id", id));
  return [row.file, ...(row.thumb ? [row.thumb] : [])];
}
