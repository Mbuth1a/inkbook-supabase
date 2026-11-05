import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import BookingActions from "@/components/admin/BookingActions";
import { requireAdminPage } from "@/lib/adminGuard";
import { clientMessage, formatDay, formatRange, prettyPhone, whatsappLink } from "@/lib/adminFormat";
import { adminCounts, listBookings, type AdminView, type BookingRow } from "@/lib/bookings";
import { sizes } from "@/lib/config";
import { mpesaEnv, mpesaSetupProblems } from "@/lib/mpesa";
import { paymentMode } from "@/lib/payments";
import { nairobiNowDate } from "@/lib/slots";

export const dynamic = "force-dynamic";

const VIEWS: { key: AdminView; label: string }[] = [
  { key: "requests", label: "New requests" },
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "action", label: "Needs action" },
  { key: "cancelled", label: "Cancelled" },
];

const EMPTY: Record<AdminView, string> = {
  requests: "No new requests. When a client sends one, it appears here until you confirm the deposit.",
  upcoming: "No upcoming bookings yet. When a client pays their deposit, the booking shows up here.",
  past: "No past sessions yet.",
  action: "Nothing needs your attention.",
  cancelled: "No cancelled bookings.",
};

function refsOf(r: BookingRow): string[] {
  try {
    const v = JSON.parse(r.refs);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default async function Bookings({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireAdminPage();
  const { view: raw } = await searchParams;
  const view = (VIEWS.find((v) => v.key === raw)?.key ?? "requests") as AdminView;
  const requestMode = paymentMode() === "request";
  const now = Date.now();
  const today = nairobiNowDate(now);
  const rows = await listBookings(view, now);
  const counts = await adminCounts(now);

  return (
    <>
      <AdminHeader />
      <main className="ad-main">
        <h1>Bookings</h1>

        {requestMode && (
          <div className="ad-warn" role="status">
            <strong>Booking requests.</strong> Clients pay the deposit by M-Pesa themselves. When the M-Pesa message arrives, tap <em>Accept</em> to confirm the slot. Declined requests free the time.
          </div>
        )}
        {!requestMode && mpesaEnv() === "mock" && (
          <div className="ad-warn" role="alert">
            <strong>Test mode.</strong> Payments are simulated, so no real money is taken. Clients will see a deposit prompt, but nothing reaches your M-Pesa account.
          </div>
        )}
        {!requestMode && mpesaEnv() !== "mock" && mpesaSetupProblems().length > 0 && (
          <div className="ad-warn bad" role="alert">
            <strong>Payments won&apos;t work yet.</strong>
            <ul>{mpesaSetupProblems().map((p) => <li key={p}>{p}</li>)}</ul>
          </div>
        )}

        <div className="ad-stats">
          <div className={counts.requests ? "ad-stat warn" : "ad-stat"}><b>{counts.requests}</b><span>New requests</span></div>
          <div className="ad-stat"><b>{counts.today}</b><span>Today</span></div>
          <div className="ad-stat"><b>{counts.upcoming}</b><span>Upcoming</span></div>
          <div className={counts.action ? "ad-stat warn" : "ad-stat"}><b>{counts.action}</b><span>Need action</span></div>
          <div className="ad-stat"><b>KES {counts.depositsKes.toLocaleString("en-KE")}</b><span>Deposits collected</span></div>
        </div>

        <nav className="ad-tabs" aria-label="Booking lists">
          {VIEWS.map((v) => (
            <Link key={v.key} href={`/admin?view=${v.key}`} className="ad-tab" aria-current={v.key === view ? "page" : undefined}>
              {v.label} <small>{counts[v.key]}</small>
            </Link>
          ))}
        </nav>

        {rows.length === 0 ? (
          <p className="ad-empty">{EMPTY[view]}</p>
        ) : (
          <div className="ad-list">
            {rows.map((r) => {
              const refs = refsOf(r);
              const isToday = r.date === today && r.status === "confirmed";
              const overdue = r.status === "confirmed" && r.date < today;
              return (
                <article key={r.id} className={`ad-card${isToday ? " today" : ""}${r.status === "paid_conflict" ? " conflict" : ""}`}>
                  <div className="ad-card-head">
                    <div className="ad-when">
                      {formatDay(r.date)}
                      <small>{formatRange(r.start_min, r.duration_min)} · {sizes[r.size]?.label ?? r.size}</small>
                    </div>
                    {r.status === "requested" && <span className="ad-badge today">New request</span>}
                    {r.status === "completed" && <span className="ad-badge ok">Done</span>}
                    {r.status === "cancelled" && <span className="ad-badge">Cancelled</span>}
                    {r.status === "paid_conflict" && <span className="ad-badge bad">Needs action</span>}
                    {isToday && <span className="ad-badge today">Today</span>}
                    {overdue && <span className="ad-badge">Mark as done?</span>}
                  </div>

                  <div className="ad-client">
                    <strong>{r.name}</strong>
                    <span className="ad-links">
                      <a href={`tel:+${r.phone}`}>Call {prettyPhone(r.phone)}</a>
                      <a href={whatsappLink(r.phone, clientMessage(r.name, r.date, r.start_min))} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    </span>
                    {r.email && <span className="ad-facts">{r.email}</span>}
                  </div>

                  <div className="ad-idea">
                    <div className="ad-facts"><strong style={{ color: "var(--a-text)" }}>{r.style}</strong> · {r.placement}{r.size_cm ? ` · ${r.size_cm}` : ""}</div>
                    <p className="ad-concept">{r.concept}</p>
                  </div>

                  {refs.length > 0 && (
                    <div className="ad-refs" aria-label="Reference images">
                      {refs.map((n, i) => (
                        <a key={n} href={`/api/uploads/${n}`} target="_blank" rel="noopener noreferrer" aria-label={`Open reference ${i + 1}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/uploads/${n}`} alt={`Reference ${i + 1}`} loading="lazy" width={72} height={72} />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="ad-pay">
                    {r.status === "paid_conflict" && <span className="flag">{r.failure_reason || "Payment needs review"}</span>}
                    {r.status === "requested" ? "Deposit not confirmed yet · " : ""}KES {(r.paid_amount ?? r.deposit_kes).toLocaleString("en-KE")} deposit
                    {r.mpesa_receipt ? ` · M-Pesa ${r.mpesa_receipt}` : ""}
                    {r.status === "cancelled" && r.failure_reason ? ` · ${r.failure_reason}` : ""}
                  </div>

                  {(r.status === "requested" || r.status === "confirmed" || r.status === "paid_conflict") && (
                    <div className="ad-actions">
                      {r.status === "requested" && <BookingActions id={r.id} action="accept" name={r.name} />}
                      {r.status === "requested" && <BookingActions id={r.id} action="decline" name={r.name} />}
                      {r.status === "confirmed" && <BookingActions id={r.id} action="complete" name={r.name} />}
                      {r.status === "confirmed" && <BookingActions id={r.id} action="cancel" name={r.name} />}
                      {r.status === "paid_conflict" && <BookingActions id={r.id} action="resolve" name={r.name} />}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
