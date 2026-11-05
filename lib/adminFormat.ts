import { studio } from "./config.ts";
import { isoDateParts, minutesToLabel } from "./slots.ts";

// Small formatting helpers for the artist dashboard.

export function formatDay(date: string): string {
  const p = isoDateParts(date);
  if (!p) return date;
  return new Intl.DateTimeFormat("en-KE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(p.y, p.m - 1, p.d)));
}

export function formatRange(startMin: number, durationMin: number): string {
  return `${minutesToLabel(startMin)} to ${minutesToLabel(startMin + durationMin)}`;
}

// 254712345678 -> 0712 345 678
export function prettyPhone(n: string): string {
  return /^254\d{9}$/.test(n) ? `0${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}` : `+${n}`;
}

// Opens WhatsApp with a ready-typed message to the client.
export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function clientMessage(name: string, date: string, startMin: number): string {
  return `Hi ${name.split(" ")[0]}, it's ${studio.name} about your tattoo booking on ${formatDay(date)} at ${minutesToLabel(startMin)}.`;
}
