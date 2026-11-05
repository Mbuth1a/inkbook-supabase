import { booking, studio } from "./config.ts";
import { minutesToLabel } from "./slots.ts";
import { normalizeKenyanPhone } from "./phone.ts";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Built from lib/config.ts, so changing the hours there updates the whole site.
export function hoursSummary(): string {
  const days: readonly number[] = booking.workingDays;
  const dayText = days.length === 7 ? "Every day" : days.map((d) => DAYS[d]).join(", ");
  return `${dayText}, ${minutesToLabel(booking.openHour * 60)} to ${minutesToLabel(booking.closeHour * 60)}`;
}

// The studio phone number as international digits, e.g. 254757219316.
function phoneDigits(): string {
  return normalizeKenyanPhone(studio.phoneDisplay) ?? studio.phoneDisplay.replace(/\D/g, "");
}

export function telUrl(): string {
  return `tel:+${phoneDigits()}`;
}

// Opens a WhatsApp chat with the studio number, with a ready-typed first message.
export function whatsappUrl(message?: string): string {
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${phoneDigits()}${text}`;
}
