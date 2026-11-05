"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicBooking } from "@/lib/publicView";
import { whatsappUrl } from "@/lib/format";

const FAILURE_TEXT: Record<string, string> = {
  cancelled: "The M-Pesa prompt was cancelled.",
  wrong_pin: "The M-Pesa PIN was entered incorrectly.",
  insufficient: "There wasn't enough M-Pesa balance for the deposit.",
  timeout: "The prompt timed out before it was answered.",
  other: "The payment didn't go through.",
};

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

function useCountdown(until: number | undefined, active: boolean) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!active || !until) return;
    const tick = () => setLeft(Math.max(0, Math.round((until - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [until, active]);
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
}

export default function BookingStatus({ id }: { id: string }) {
  const [b, setB] = useState<PublicBooking | null>(null);
  const [missing, setMissing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const startedAt = useRef(Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${id}`, { cache: "no-store" });
      if (res.status === 404) return setMissing(true);
      if (res.ok) setB(await res.json());
    } catch {
      // Brief network drops on mobile data are normal; the next poll will recover.
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Poll while we are waiting for the customer to answer the prompt.
  // Requests are waiting for the artist to confirm the deposit, so check less often.
  useEffect(() => {
    if (b && b.status !== "pending" && b.status !== "requested") return;
    const every = b?.status === "requested" ? 10_000 : 2_500;
    const t = setInterval(() => {
      load();
      setSlow(Date.now() - startedAt.current > 20_000);
    }, every);
    return () => clearInterval(t);
  }, [b?.status, load]);

  const countdown = useCountdown(b?.holdExpiresAt, b?.status === "pending");

  async function retry() {
    setRetrying(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/bookings/${id}/retry`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) setMsg(json.error || "Couldn't resend the prompt.");
      else { setB(json); startedAt.current = Date.now(); setSlow(false); }
    } catch {
      setMsg("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setRetrying(false);
    }
  }

  if (missing) {
    return (
      <div className="status">
        <h1 style={{ fontSize: "2rem" }}>Booking not found</h1>
        <p className="muted" style={{ margin: "12px 0 24px" }}>This link may be wrong or the booking was removed.</p>
        <Link href="/book" className="btn btn-primary">Start a new booking</Link>
      </div>
    );
  }
  if (!b) return <div className="status"><p className="muted" role="status">Loading your booking…</p></div>;

  if (b.status === "confirmed" || b.status === "completed") {
    return (
      <div className="status">
        <div className="tick" aria-hidden="true">✓</div>
        <h1 style={{ fontSize: "2.25rem" }}>You&apos;re booked, {b.firstName}.</h1>
        <p style={{ margin: "16px 0 4px", fontSize: "1.15rem" }}>{formatDate(b.date)} at {b.time}</p>
        <p className="muted">Deposit of KES {b.depositKes.toLocaleString("en-KE")} received.</p>
        {b.receipt && <p><span className="receipt">M-Pesa {b.receipt}</span></p>}
        <p className="muted" style={{ margin: "20px 0" }}>
          We&apos;ll be in touch to finalise the design before your session. Eat well beforehand, bring ID and wear comfortable clothes.
        </p>
        <Link href="/" className="btn">Back to the site</Link>
      </div>
    );
  }

  if (b.status === "requested") {
    return (
      <div className="status">
        <div className="pulse" aria-hidden="true" />
        <h1 style={{ fontSize: "2rem" }}>Request received, {b.firstName}.</h1>
        <p style={{ margin: "14px 0" }} role="status">
          {formatDate(b.date)} at {b.time} is held for you while we confirm your deposit.
        </p>
        <div className="summary" style={{ textAlign: "left" }}>
          <dl>
            <dt>Deposit</dt><dd><strong>KES {b.depositKes.toLocaleString("en-KE")}</strong></dd>
            <dt>Reference</dt><dd>{b.reference}</dd>
          </dl>
          <p style={{ margin: "14px 0 0" }}>{b.instructions}</p>
        </div>
        <p className="muted" style={{ margin: "20px 0" }}>
          Once the deposit arrives we confirm your slot here and on WhatsApp. Keep this page open or come back to it later.
        </p>
        <a
          className="btn btn-primary"
          href={whatsappUrl(`Hi, I've sent the deposit for booking ${b.reference} (${formatDate(b.date)} at ${b.time}). Here is the M-Pesa message:`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Send the M-Pesa message on WhatsApp
        </a>
      </div>
    );
  }

  if (b.status === "paid_conflict") {
    return (
      <div className="status">
        <h1 style={{ fontSize: "2rem" }}>We received your payment, but there&apos;s a problem</h1>
        <p className="muted" style={{ margin: "12px 0 24px" }}>
          The time you picked was taken before your payment landed. We&apos;ll contact you shortly to
          rebook or refund, so you won&apos;t lose your money. Please keep your M-Pesa message handy.
        </p>
        <Link href="/" className="btn">Back to the site</Link>
      </div>
    );
  }

  if (b.status === "pending") {
    return (
      <div className="status">
        <div className="pulse" aria-hidden="true" />
        <h1 style={{ fontSize: "2rem" }}>Check your phone</h1>
        <p style={{ margin: "14px 0" }} role="status">
          Enter your M-Pesa PIN to pay the KES {b.depositKes.toLocaleString("en-KE")} deposit for {formatDate(b.date)} at {b.time}.
        </p>
        <p className="muted">Your slot is held for</p>
        <p className="countdown" aria-live="off">{countdown}</p>
        {slow && (
          <div style={{ marginTop: 24 }}>
            <p className="muted">No prompt yet? It can take up to a minute on busy networks.</p>
            <button className="btn btn-sm" onClick={retry} disabled={retrying}>{retrying ? "Sending…" : "Send the prompt again"}</button>
          </div>
        )}
        {msg && <p className="error" role="alert" style={{ color: "#ff8a78" }}>{msg}</p>}
      </div>
    );
  }

  if (b.status === "cancelled") {
    return (
      <div className="status">
        <h1 style={{ fontSize: "2rem" }}>This booking can&apos;t go ahead</h1>
        <p className="muted" style={{ margin: "12px 0 24px" }}>
          The slot was released. If you paid a deposit and have questions about it, message us on WhatsApp and we will sort it out.
        </p>
        <Link href="/book" className="btn btn-primary">Book a new session</Link>
      </div>
    );
  }

  // failed or expired
  const reason = b.status === "expired" ? "Your slot hold ran out before payment was received." : FAILURE_TEXT[b.failure ?? "other"];
  return (
    <div className="status">
      <h1 style={{ fontSize: "2rem" }}>Not booked yet</h1>
      <p style={{ margin: "14px 0" }}>{reason}</p>
      <p className="muted">Try again and we&apos;ll re-hold {formatDate(b.date)} at {b.time} if it&apos;s still free. If you did approve a payment, we&apos;ll still match it to your booking.</p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={retry} disabled={retrying}>{retrying ? "Sending…" : "Try again"}</button>
        <Link href="/book" className="btn">Pick another time</Link>
      </div>
      {msg && <p role="alert" style={{ color: "#ff8a78", marginTop: 16 }}>{msg}</p>}
    </div>
  );
}
