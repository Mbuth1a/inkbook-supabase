import Image from "next/image";
import type { GalleryItem } from "@/lib/galleryTypes";

export type ShowcaseItem = Pick<GalleryItem, "id" | "alt" | "style" | "state"> & Partial<Pick<GalleryItem, "thumbSrc" | "width" | "height">>;

// Grid of photos. Used by the home page preview and the full /gallery page.
export default function GalleryGrid({ items, eagerCount = 2 }: { items: ShowcaseItem[]; eagerCount?: number }) {
  return (
    <div className="grid">
      {items.map((item, i) => (
        <figure key={item.id} className="tile" style={{ margin: 0 }}>
          {item.thumbSrc ? (
            <Image
              src={item.thumbSrc}
              alt={item.alt}
              width={item.width ?? 640}
              height={item.height ?? 800}
              sizes="(min-width: 900px) 25vw, (min-width: 560px) 33vw, 50vw"
              // Only the first row loads eagerly; the rest wait until scrolled into view.
              loading={i < eagerCount ? "eager" : "lazy"}
              quality={70}
            />
          ) : (
            <div className="placeholder" role="img" aria-label={item.alt}>
              {item.style}
              <br />
              (add photo)
            </div>
          )}
          <span className="tag">{item.state}</span>
        </figure>
      ))}
    </div>
  );
}
