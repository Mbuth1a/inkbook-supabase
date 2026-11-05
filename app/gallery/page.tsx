import type { Metadata } from "next";
import GalleryBrowser from "@/components/GalleryBrowser";
import { studio } from "@/lib/config";
import { galleryStyles, listGalleryPage } from "@/lib/gallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gallery",
  description: `Tattoo gallery by ${studio.name}: fine line, minimalist, blackwork, neo-traditional and script pieces, fresh and healed.`,
  alternates: { canonical: "/gallery" },
};

export default async function GalleryPage() {
  const initial = await listGalleryPage({ limit: 24 });
  return (
    <main className="wrap" style={{ padding: "40px 16px 80px" }}>
      <p className="eyebrow">Gallery</p>
      <h1 style={{ fontSize: "clamp(2.25rem, 8vw, 3.5rem)" }}>Recent work</h1>
      <p className="muted" style={{ margin: "12px 0 24px", maxWidth: "36rem" }}>
        Fresh and healed photos, so you can see how each style settles in.
      </p>
      <GalleryBrowser initial={initial} styles={galleryStyles} />
    </main>
  );
}
