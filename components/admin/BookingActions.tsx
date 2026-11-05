"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

type Action = "accept" | "decline" | "complete" | "cancel" | "resolve";

// Browser dialogs (confirm/prompt) are blocked in some browsers, so the confirmation is drawn
// inside the booking card instead.
const TEXT: Record<Action, { label: string; busy: string; primary: boolean; question: (name: string) => string; yes: string }> = {
  accept: {
    label: "Accept (deposit received)",
    busy: "Confirming…",
    primary: true,
    question: (name) => `Confirm ${name}'s slot? Only do this once their KES deposit has arrived in M-Pesa.`,
    yes: "Yes, confirm",
  },
  decline: {
    label: "Decline",
    busy: "Declining…",
    primary: false,
    question: (name) => `Decline ${name}'s request? The time slot opens up again.`,
    yes: "Yes, decline",
  },
  complete: {
    label: "Mark as done",
    busy: "Saving…",
    primary: true,
    question: (name) => `Mark ${name}'s session as done?`,
    yes: "Yes, mark done",
  },
  cancel: {
    label: "Cancel booking",
    busy: "Cancelling…",
    primary: false,
    question: (name) => `Cancel ${name}'s booking? The slot opens up again. The deposit is NOT refunded automatically, so refund it in M-Pesa yourself if needed.`,
    yes: "Yes, cancel booking",
  },
  resolve: {
    label: "Mark as resolved",
    busy: "Saving…",
    primary: true,
    question: (name) => `Mark this as resolved? Only do this after you have refunded or rebooked ${name}.`,
    yes: "Yes, mark resolved",
  },
};

export default function BookingActions({ id, action, name }: { id: string; action: Action; name: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const t = TEXT[action];

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, receipt: action === "accept" ? code : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.location.assign("/admin/login");
        return;
      }
      if (!res.ok) {
        setError(json.error || "That didn't work. Please try again.");
        setBusy(false);
      } else {
        setAsking(false);
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (asking) {
    return (
      <div className="ad-ask" role="group" aria-label={t.question(name)}>
        <p style={{ margin: 0 }}>{t.question(name)}</p>
        {action === "accept" && (
          <div>
            <label className="ad-label" htmlFor={fieldId}>M-Pesa confirmation code (optional)</label>
            <input
              id={fieldId}
              className="ad-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. SGR7XYZ123"
              maxLength={40}
              autoCapitalize="characters"
              disabled={busy}
            />
          </div>
        )}
        <div className="ad-actions">
          <button type="button" className={t.primary ? "ad-btn ad-btn-primary" : "ad-btn ad-btn-danger"} onClick={go} disabled={busy}>
            {busy ? t.busy : t.yes}
          </button>
          <button type="button" className="ad-btn" onClick={() => { setAsking(false); setError(null); }} disabled={busy}>
            Back
          </button>
        </div>
        {error && <span className="ad-error" role="alert">{error}</span>}
      </div>
    );
  }

  return (
    <span className="ad-action">
      <button type="button" className={t.primary ? "ad-btn ad-btn-primary" : "ad-btn"} onClick={() => setAsking(true)}>
        {t.label}
      </button>
    </span>
  );
}
