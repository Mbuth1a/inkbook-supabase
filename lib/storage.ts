import { supabase } from "./supabase.ts";

// Two buckets (created by supabase/storage.sql):
//  - "gallery": public. Portfolio photos, so anyone can load them by URL.
//  - "references": private. Client reference photos, shown only to the signed-in artist.
export const GALLERY_BUCKET = "gallery";
export const REFERENCE_BUCKET = "references";

// Throws on a storage error so a failed upload is never mistaken for success.
function check(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(`Storage error: ${res.error.message}`);
}

export async function uploadGallery(name: string, bytes: Uint8Array, contentType = "image/webp") {
  check(
    await supabase().storage.from(GALLERY_BUCKET).upload(name, new Blob([new Uint8Array(bytes)], { type: contentType }), {
      contentType,
      upsert: false,
      cacheControl: "31536000", // names are random, so a file never changes: cache for a year
    })
  );
}

// Public address of a portfolio photo. Synchronous, because it's used while building lists.
export function galleryUrl(name: string): string {
  return supabase().storage.from(GALLERY_BUCKET).getPublicUrl(name).data.publicUrl;
}

export async function removeGallery(names: string[]) {
  if (names.length === 0) return;
  check(await supabase().storage.from(GALLERY_BUCKET).remove(names));
}

export async function uploadReference(name: string, bytes: Uint8Array, contentType: string) {
  check(
    await supabase().storage.from(REFERENCE_BUCKET).upload(name, new Blob([new Uint8Array(bytes)], { type: contentType }), {
      contentType,
      upsert: false,
      cacheControl: "3600",
    })
  );
}

// A short-lived link to a private reference photo. Returns null if the file doesn't exist.
export async function referenceSignedUrl(name: string, seconds = 300): Promise<string | null> {
  const res = await supabase().storage.from(REFERENCE_BUCKET).createSignedUrl(name, seconds);
  if (res.error || !res.data) return null;
  return res.data.signedUrl;
}
