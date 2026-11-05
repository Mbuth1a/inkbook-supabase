import type { BookingRow } from "./bookings.ts";
import { minutesToLabel } from "./slots.ts";
import { maskPhone } from "./phone.ts";

// Placeholder notifier. It logs today; swap the bodies for real delivery:
//  - Client SMS: Africa's Talking (reliable in Kenya, cheap) or Twilio
//  - Client email: Resend / Postmark
//  - Artist alert: WhatsApp Cloud API or a Telegram bot message

export async function notifyBookingConfirmed(b: BookingRow) {
  const when = `${b.date} at ${minutesToLabel(b.start_min)}`;
  console.log(
    `[notify] CONFIRMED ${b.id.slice(0, 8)} ${b.name} (${maskPhone(b.phone)}) ${b.style} ${b.placement} on ${when}, receipt ${b.mpesa_receipt}`
  );
}

export async function notifyNeedsReview(b: BookingRow) {
  console.warn(`[notify] NEEDS REVIEW ${b.id.slice(0, 8)}: ${b.failure_reason} (receipt ${b.mpesa_receipt})`);
}
