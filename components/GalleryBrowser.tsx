"use client";

import { useRef, useState } from "react";
import GalleryGrid, { type ShowcaseItem } from "@/components/GalleryGrid";
import type { GalleryPage } from "@/lib/gallery";

// The full /gallery page: style filters, then pages of 24 photos loaded on request.
export default function GalleryBrowser({ initial, styles }: { initial: GalleryPage; styles: string[] }) {
  const [style, setStyle] = useState("All");
  const [items, setItems] = useState<ShowcaseItem[]>(initial.items);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0); // ignores answers to older requests, so a fast tap can't show the wrong style

  async function load(nextStyle: string, offset: number) {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ offset: String(offset) });
      if (nextStyle !== "All") qs.set("style", nextStyle);
      const res = await fetch(`/api/gallery?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const page: GalleryPage = await res.json();
      if (id !== request.current) return;
      setItems((prev) => (offset === 0 ? page.items : [...prev, ...page.items]));
      setHasMore(page.hasMore);
    } catch {
      if (id === request.current) setError("Couldn't load more photos. Check your connection and try again.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  function pick(s: string) {
    setStyle(s);
    setItems([]);
    load(s, 0);
  }

  return (
    <>
      <div className="filters" role="group" aria-label="Filter by style">
        {["All", ...styles].map((s) => (
          <button key={s} className="chip" aria-pressed={style === s} onClick={() => pick(s)}>
            {s}
          </button>
        ))}
      </div>

      {items.length === 0 && !loading ? (
        <p className="muted">No photos in this style yet. Check back soon, or ask us on WhatsApp to see more work.</p>
      ) : (
        <GalleryGrid items={items} />
      )}

      {error && <p className="error" role="alert" style={{ color: "#ff8a78", marginTop: 16 }}>{error}</p>}

      {hasMore && (
        <div style={{ textAlign: "center", marginTop: 32 }}>
          <button className="btn" onClick={() => load(style, items.length)} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </>
  );
}
