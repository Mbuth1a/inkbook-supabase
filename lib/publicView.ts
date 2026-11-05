import type { BookingRow } from "./bookings.ts";
import { minutesToLabel } from "./slots.ts";
import { depositInstructions } from "./payments.ts";

function friendlyFailure(reason: string | null): "cancelled" | "wrong_pin" | "insufficient" | "timeout" | "other" {
  const code = reason?.split(":")[0];
  if (code === "1032") return "cancelled";
  if (code === "2001") return "wrong_pin";
  if (code === "1") return "insufficient";
  if (code === "1037") return "timeout";
  return "other";
}

// What the browser is allowed to know about a booking. No phone, no concept text, no internal notes.
export function publicView(b: BookingRow) {
  return {
    id: b.id,
    status: b.status,
    firstName: b.name.split(" ")[0],
    date: b.date,
    time: minutesToLabel(b.start_min),
    depositKes: b.deposit_kes,
    instructions: depositInstructions(b.deposit_kes),
    reference: b.id.slice(0, 8).toUpperCase(),
    holdExpiresAt: b.hold_expires_at,
    receipt: b.status === "confirmed" || b.status === "completed" ? b.mpesa_receipt : null,
    failure: b.status === "failed" ? friendlyFailure(b.failure_reason) : null,
  };
}

export type PublicBooking = ReturnType<typeof publicView>;
