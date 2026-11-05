"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_REF_BYTES, MAX_REF_IMAGES, placements, sizes, styles, type SizeKey } from "@/lib/config";

type Props = { depositKes: number; holdMinutes: number; mode: "request" | "mpesa" };
type Slot = { startMin: number; label: string };
type Ref = { name: string; preview: string };

const STEPS = ["Idea", "Details", "Date", "Deposit"];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

export default function BookingFlow({ depositKes, holdMinutes, mode }: Props) {
  const isRequest = mode === "request";
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [showAllDates, setShowAllDates] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);

  const [style, setStyle] = useState<string>("");
  const [concept, setConcept] = useState("");
  const [size, setSize] = useState<SizeKey | "">("");
  const [sizeCm, setSizeCm] = useState("");
  const [placement, setPlacement] = useState("");
  const [refs, setRefs] = useState<Ref[]>([]);
  const [uploading, setUploading] = useState(false);
  const [date, setDate] = useState("");
  const [startMin, setStartMin] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [dates, setDates] = useState<string[] | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Session length depends on size, so availability is reloaded whenever the size changes.
  useEffect(() => {
    if (!size) return;
    let cancelled = false;
    setDates(null);
    setDate("");
    setStartMin(null);
    fetch(`/api/availability?size=${size}`)
      .then((r) => r.json())
      .then((j) => !cancelled && setDates(j.dates ?? []))
      .catch(() => !cancelled && setDates([]));
    return () => { cancelled = true; };
  }, [size]);

  useEffect(() => {
    if (!size || !date) return;
    let cancelled = false;
    setSlots(null);
    setStartMin(null);
    fetch(`/api/availability?size=${size}&date=${date}`)
      .then((r) => r.json())
      .then((j) => !cancelled && setSlots(j.slots ?? []))
      .catch(() => !cancelled && setSlots([]));
    return () => { cancelled = true; };
  }, [size, date]);

  // Move focus to the new step heading for keyboard and screen-reader users, but not on first load,
  // where it would scroll the page past the intro.
  const lastStep = useRef(step);
  useEffect(() => {
    if (lastStep.current === step) return;
    lastStep.current = step;
    heading.current?.focus();
  }, [step]);

  const timeLabel = useMemo(() => slots?.find((s) => s.startMin === startMin)?.label, [slots, startMin]);

  function fail(message: string, field?: string) {
    setError({ message, field });
    return false;
  }

  function validate(s: number): boolean {
    setError(null);
    if (s === 0) {
      if (!style) return fail("Choose a style", "style");
      if (concept.trim().length < 10) return fail("Tell us a little more about the idea (a sentence or two)", "concept");
    }
    if (s === 1) {
      if (!size) return fail("Choose a size", "size");
      if (!placement) return fail("Choose where on your body", "placement");
    }
    if (s === 2) {
      if (!date) return fail("Pick a date", "date");
      if (startMin === null) return fail("Pick a start time", "time");
    }
    return true;
  }

  function next() { if (validate(step)) setStep(step + 1); }

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const files = Array.from(list);
    if (refs.length + files.length > MAX_REF_IMAGES) return fail(`You can add up to ${MAX_REF_IMAGES} images`, "refs");
    const tooBig = files.find((f) => f.size > MAX_REF_BYTES);
    if (tooBig) return fail(`${tooBig.name} is over ${MAX_REF_BYTES / 1024 / 1024} MB. Try a smaller photo.`, "refs");
    setUploading(true);
    try {
      // Ask the server for a one-time upload link per photo, then send each photo straight to storage.
      const res = await fetch("/api/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: files.map((f) => ({ type: f.type, size: f.size })) }),
      });
      const json = await res.json();
      if (!res.ok) return fail(json.error || "Upload failed", "refs");
      const slots = json.files as { name: string; url: string; contentType: string }[];
      for (let i = 0; i < files.length; i++) {
        const put = await fetch(slots[i].url, {
          method: "PUT",
          headers: { "Content-Type": slots[i].contentType, "x-upsert": "false" },
          body: files[i],
        });
        if (!put.ok) return fail(`${files[i].name} couldn't be uploaded. Please try again.`, "refs");
      }
      setRefs((prev) => [...prev, ...slots.map((s, i) => ({ name: s.name, preview: URL.createObjectURL(files[i]) }))]);
    } catch {
      fail("Upload failed. Check your connection and try again.", "refs");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setError(null);
    if (name.trim().length < 2) return fail("Please enter your name", "name");
    if (phone.replace(/\D/g, "").length < 9) return fail(isRequest ? "Enter a phone number, like 0712 345 678" : "Enter your Safaricom number, like 0712 345 678", "phone");
    if (!accept) return fail("Please confirm you accept the deposit terms", "accept");
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, phone, email, style, concept, size, placement, sizeCm: sizeCm || undefined,
          refs: refs.map((r) => r.name), date, startMin, acceptTerms: accept,
        }),
      });
      const json = await res.json();
      if (res.ok) { router.push(`/book/${json.id}`); return; }
      if (json.code === "slot_taken") { setStep(2); setDate(""); setStartMin(null); }
      // Only attach the error to a field the form actually shows; otherwise show it as a general message.
      const shown = ["name", "phone", "email", "accept", "concept", "style", "size", "placement"];
      const field = json.field === "acceptTerms" ? "accept" : shown.includes(json.field) ? json.field : undefined;
      fail(json.error || "Something went wrong. Please try again.", field);
    } catch {
      fail("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const err = (f: string) => (error?.field === f ? <p className="error" role="alert">{error.message}</p> : null);
  const generalError = error && !error.field ? <p className="error" role="alert">{error.message}</p> : null;

  return (
    <div className="flow">
      <div className="progress" aria-hidden="true">
        {STEPS.map((_, i) => <span key={i} className={i <= step ? "done" : ""} />)}
      </div>
      <p className="eyebrow">Step {step + 1} of {STEPS.length}</p>

      {step === 0 && (
        <>
          <h2 ref={heading} tabIndex={-1} style={{ fontSize: "2rem", marginBottom: 24 }}>What are we making?</h2>
          <div className="field">
            <span className="label" id="style-label">Style</span>
            <div className="chips" role="group" aria-labelledby="style-label">
              {styles.map((s) => (
                <button key={s} type="button" className="chip" aria-pressed={style === s} onClick={() => setStyle(s)}>{s}</button>
              ))}
            </div>
            {err("style")}
          </div>
          <div className="field">
            <label htmlFor="concept">Describe your idea</label>
            <textarea id="concept" value={concept} maxLength={1200} onChange={(e) => setConcept(e.target.value)}
              placeholder="e.g. A small olive branch wrapping my inner forearm, thin lines, no shading." />
            {err("concept")}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h2 ref={heading} tabIndex={-1} style={{ fontSize: "2rem", marginBottom: 24 }}>Size and placement</h2>
          <div className="field">
            <span className="label" id="size-label">Approximate size</span>
            <div className="opts" role="group" aria-labelledby="size-label">
              {(Object.keys(sizes) as SizeKey[]).map((k) => (
                <button key={k} type="button" className="opt" aria-pressed={size === k} onClick={() => setSize(k)}>
                  <strong>{sizes[k].label}</strong><span>{sizes[k].hint}</span>
                </button>
              ))}
            </div>
            {err("size")}
          </div>
          <div className="field">
            <label htmlFor="sizecm">Exact size (optional)</label>
            <input id="sizecm" type="text" value={sizeCm} maxLength={24} onChange={(e) => setSizeCm(e.target.value)} placeholder="e.g. 8 x 5 cm" />
          </div>
          <div className="field">
            <label htmlFor="placement">Placement</label>
            <select id="placement" value={placement} onChange={(e) => setPlacement(e.target.value)}>
              <option value="">Choose a body area</option>
              {placements.map((p) => <option key={p}>{p}</option>)}
            </select>
            {err("placement")}
          </div>
          <div className="field">
            <label htmlFor="refs">Reference images (optional)</label>
            <input id="refs" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || refs.length >= MAX_REF_IMAGES}
              onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            <p className="hint">Up to {MAX_REF_IMAGES} photos, 5 MB each. Include a photo of the area if it is a cover-up.</p>
            {uploading && <p className="hint" role="status">Uploading…</p>}
            {err("refs")}
            {refs.length > 0 && (
              <div className="thumbs">
                {refs.map((r) => (
                  <div key={r.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.preview} alt="Reference upload" />
                    <button type="button" aria-label="Remove image" onClick={() => setRefs(refs.filter((x) => x.name !== r.name))}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <h2 ref={heading} tabIndex={-1} style={{ fontSize: "2rem", marginBottom: 24 }}>Pick a date</h2>
          <div className="field">
            <span className="label" id="date-label">Available days</span>
            {dates === null && <p className="muted" role="status">Loading availability…</p>}
            {dates?.length === 0 && <p className="muted">No dates are open right now. Please check back soon or message us on Instagram.</p>}
            {dates && dates.length > 0 && (
              <>
                <div className="dates" role="group" aria-labelledby="date-label">
                  {(showAllDates ? dates : dates.slice(0, 14)).map((d) => (
                    <button key={d} type="button" className="chip" aria-pressed={date === d} onClick={() => setDate(d)}>{formatDate(d)}</button>
                  ))}
                </div>
                {dates.length > 14 && (
                  <button type="button" className="link-btn" onClick={() => setShowAllDates(!showAllDates)} aria-expanded={showAllDates}>
                    {showAllDates ? "Show fewer dates" : `Show later dates (${dates.length - 14} more)`}
                  </button>
                )}
              </>
            )}
            {err("date")}
          </div>
          {date && (
            <div className="field">
              <span className="label" id="time-label">Start time</span>
              {slots === null && <p className="muted" role="status">Loading times…</p>}
              {slots?.length === 0 && <p className="muted">That day just filled up. Please pick another.</p>}
              {slots && slots.length > 0 && (
                <div className="times" role="group" aria-labelledby="time-label">
                  {slots.map((s) => (
                    <button key={s.startMin} type="button" className="chip" aria-pressed={startMin === s.startMin} onClick={() => setStartMin(s.startMin)}>{s.label}</button>
                  ))}
                </div>
              )}
              {err("time")}
            </div>
          )}
        </>
      )}

      {step === 3 && (
        <>
          <h2 ref={heading} tabIndex={-1} style={{ fontSize: "2rem", marginBottom: 24 }}>Secure your slot</h2>
          <div className="summary">
            <dl>
              <dt>Style</dt><dd>{style}</dd>
              <dt>Size</dt><dd>{size && sizes[size].label}</dd>
              <dt>Placement</dt><dd>{placement}</dd>
              <dt>When</dt><dd>{date && formatDate(date)}, {timeLabel}</dd>
              <dt>Deposit</dt><dd><strong>KES {depositKes.toLocaleString("en-KE")}</strong></dd>
            </dl>
          </div>
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            {err("name")}
          </div>
          <div className="field">
            <label htmlFor="phone">{isRequest ? "Phone number" : "M-Pesa number"}</label>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <p className="hint">{isRequest ? "So we can confirm your booking by call or WhatsApp." : "We will send the payment prompt to this Safaricom number."}</p>
            {err("phone")}
          </div>
          <div className="field">
            <label htmlFor="email">Email (optional)</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {err("email")}
          </div>
          <div className="field">
            <label className="check">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <span>
                I understand the KES {depositKes.toLocaleString("en-KE")} deposit is non-refundable and comes off the final price.
                {isRequest
                  ? " My slot is confirmed once the deposit arrives."
                  : ` The slot is held for ${holdMinutes} minutes while I approve the M-Pesa prompt.`}
              </span>
            </label>
            {err("accept")}
          </div>
        </>
      )}

      {generalError}

      <div className="nav-row">
        {step > 0 ? <button type="button" className="btn" onClick={() => { setError(null); setStep(step - 1); }} disabled={submitting}>Back</button> : <span />}
        {step < 3 ? (
          <button type="button" className="btn btn-primary" onClick={next} disabled={uploading}>Continue</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={submit} disabled={submitting}>
            {isRequest
              ? submitting ? "Sending request…" : "Send booking request"
              : submitting ? "Sending prompt…" : `Pay KES ${depositKes.toLocaleString("en-KE")} with M-Pesa`}
          </button>
        )}
      </div>
    </div>
  );
}
