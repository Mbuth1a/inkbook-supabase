"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GalleryItem, GalleryState } from "@/lib/galleryTypes";
import { GALLERY_STATES } from "@/lib/galleryTypes";

type Row = GalleryItem & { captionRaw: string };
type QueueItem = { name: string; status: "waiting" | "uploading" | "done" | "error"; message?: string };

const MAX_EDGE = 2000; // the server re-encodes to 1600px; this just keeps phone uploads small.

// Shrinks a phone photo in the browser before it is sent. Falls back to the original file if
// the browser can't decode it (for example, some HEIC photos).
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 2_000_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file;
  }
}

export default function GalleryManager({ styles, items }: { styles: string[]; items: Row[] }) {
  const router = useRouter();
  const [style, setStyle] = useState(styles[0] ?? "");
  const [state, setState] = useState<GalleryState>("Fresh");
  const [caption, setCaption] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function uploadAll(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setBusy(true);
    setNotice(null);
    setQueue(list.map((f) => ({ name: f.name, status: "waiting" })));
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      const update = (patch: Partial<QueueItem>) =>
        setQueue((q) => q.map((x, j) => (j === i ? { ...x, ...patch } : x)));
      update({ status: "uploading" });
      const form = new FormData();
      form.append("file", await shrink(list[i]), "photo.jpg");
      form.append("style", style);
      form.append("state", state);
      form.append("alt", caption);
      try {
        const res = await fetch("/api/admin/gallery", { method: "POST", body: form });
        const json = await res.json().catch(() => ({}));
        if (res.status === 401) {
          window.location.assign("/admin/login");
          return;
        }
        if (res.ok) update({ status: "done" });
        else {
          failed++;
          update({ status: "error", message: json.error || "Upload failed" });
        }
      } catch {
        failed++;
        update({ status: "error", message: "Connection problem" });
      }
    }
    setBusy(false);
    setNotice(failed ? `${list.length - failed} uploaded, ${failed} failed. Try the failed ones again.` : "All photos are live on the site.");
    router.refresh();
  }

  async function act(id: string, method: "PATCH" | "DELETE", body?: unknown) {
    const res = await fetch(`/api/admin/gallery/${id}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      window.location.assign("/admin/login");
      return false;
    }
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setNotice(json.error || "That didn't work. Please try again.");
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <>
      <section className="ad-panel" aria-labelledby="upload-h">
        <h2 id="upload-h">Add art</h2>
        <div className="ad-row">
          <div>
            <label className="ad-label" htmlFor="g-style">Style</label>
            <select id="g-style" className="ad-select" value={style} onChange={(e) => setStyle(e.target.value)} disabled={busy}>
              {styles.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="ad-label">Healing</legend>
            <div style={{ display: "flex", gap: 8 }}>
              {GALLERY_STATES.map((s) => (
                <label key={s} className="ad-btn" style={{ flex: 1, cursor: "pointer", borderColor: state === s ? "var(--a-gold)" : undefined, color: state === s ? "var(--a-gold)" : undefined }}>
                  <input type="radio" name="state" value={s} checked={state === s} onChange={() => setState(s)} style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} />
                  {s}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div>
          <label className="ad-label" htmlFor="g-cap">Caption (optional, shown to visitors and read by Google)</label>
          <input id="g-cap" className="ad-input" maxLength={120} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Fine-line rose on forearm" disabled={busy} />
        </div>
        <label className="ad-drop" aria-disabled={busy}>
          <span>{busy ? "Uploading…" : "Tap to choose photos (you can pick several)"}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            multiple
            disabled={busy}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            onChange={(e) => { uploadAll(e.target.files); e.target.value = ""; }}
          />
        </label>
        {queue.length > 0 && (
          <ul className="ad-queue" aria-live="polite">
            {queue.map((q, i) => (
              <li key={i} className={q.status === "error" ? "err" : q.status === "done" ? "done" : undefined}>
                <span>{q.name}</span>
                <span>{q.status === "waiting" ? "Waiting" : q.status === "uploading" ? "Uploading…" : q.status === "done" ? "Done" : q.message}</span>
              </li>
            ))}
          </ul>
        )}
        {notice && <p className="ad-ok" role="status">{notice}</p>}
      </section>

      <h2 style={{ fontSize: "1.4rem", marginBottom: 6 }}>On the site ({items.length})</h2>
      <p className="ad-sub">
        {items.some((i) => i.featured)
          ? `${items.filter((i) => i.featured).length} featured on the home page. Tap ★ on any photo to change it.`
          : "Nothing featured yet, so the home page shows your 12 most recent photos. Tap ★ to choose which ones appear."}
      </p>
      {items.length === 0 ? (
        <p className="ad-empty">No photos yet. Add your first piece above. Until then the site shows the sample portfolio.</p>
      ) : (
        <div className="ad-grid">
          {items.map((it) => (
            <PieceCard
              key={it.id}
              item={it}
              styles={styles}
              disabled={busy}
              onSave={(v) => act(it.id, "PATCH", v)}
              onToggleFeatured={() => act(it.id, "PATCH", { style: it.style, state: it.state, alt: it.captionRaw, featured: !it.featured })}
              onDelete={() => act(it.id, "DELETE")}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PieceCard({
  item, styles, disabled, onSave, onToggleFeatured, onDelete,
}: {
  item: Row;
  styles: string[];
  disabled: boolean;
  onSave: (v: { style: string; state: GalleryState; alt: string }) => Promise<boolean>;
  onToggleFeatured: () => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [style, setStyle] = useState(item.style);
  const [state, setState] = useState<GalleryState>(item.state);
  const [alt, setAlt] = useState(item.captionRaw);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const ok = await onSave({ style, state, alt });
    setSaving(false);
    if (ok) setEditing(false);
  }

  async function remove() {
    if (!window.confirm("Delete this photo from the site? This can't be undone.")) return;
    setSaving(true);
    const ok = await onDelete();
    if (!ok) setSaving(false);
  }

  return (
    <article className="ad-piece">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.src} alt={item.alt} loading="lazy" />
      <div className="ad-piece-body">
        {editing ? (
          <>
            <select className="ad-select" value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Style">
              {styles.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="ad-select" value={state} onChange={(e) => setState(e.target.value as GalleryState)} aria-label="Healing">
              {GALLERY_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input className="ad-input" maxLength={120} value={alt} onChange={(e) => setAlt(e.target.value)} aria-label="Caption" />
            <div className="ad-piece-actions">
              <button type="button" className="ad-btn ad-btn-primary" onClick={save} disabled={saving || disabled}>{saving ? "Saving…" : "Save"}</button>
              <button type="button" className="ad-btn" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div><strong>{item.style}</strong> · {item.state}</div>
            <div className="ad-facts">{item.captionRaw || "No caption"}</div>
            <div className="ad-piece-actions">
              <button
                type="button"
                className={item.featured ? "ad-btn ad-btn-primary" : "ad-btn"}
                aria-pressed={item.featured}
                onClick={async () => { setSaving(true); await onToggleFeatured(); setSaving(false); }}
                disabled={saving || disabled}
              >
                {item.featured ? "★ Featured" : "☆ Feature on home"}
              </button>
              <button type="button" className="ad-btn" onClick={() => setEditing(true)} disabled={saving || disabled}>Edit</button>
              <button type="button" className="ad-btn ad-btn-danger" onClick={remove} disabled={saving || disabled}>Delete</button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
