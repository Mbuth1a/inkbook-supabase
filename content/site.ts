import { booking, studio } from "@/lib/config";
import { hoursSummary } from "@/lib/format";
import type { IconName } from "@/components/Icons";

// Edit the wording on the home page and booking page here. Values that come from
// lib/config.ts (deposit, hours) update on their own.

export const serviceAreas = ["Nairobi", "Naivasha", "Thika Road"] as const;

// "About" section. Replace with the artist's own story; two short paragraphs works well.
export const about = [
  `${studio.name} is a custom tattoo studio serving ${serviceAreas.join(", ")}, with house calls available. Every piece starts as a conversation about what you want and where it will live on your body.`,
  "Share your idea and reference images when you book, and your design is drawn to fit you. Fine line, blackwork, script and cover-ups are all welcome.",
];

export const services: { title: string; text: string }[] = [
  { title: "Custom tattoos", text: "Designed with you from your idea and references, then drawn to fit the placement." },
  { title: "Fine line and minimalist", text: "Delicate linework, small symbols and quiet pieces that age well." },
  { title: "Blackwork", text: "Solid black, bold shapes, geometric patterns and graphic compositions." },
  { title: "Script and lettering", text: "Names, dates and quotes set in lettering that suits your skin." },
  { title: "Cover-ups", text: "Reworking an old tattoo into something you are proud of. Bring a clear photo of it." },
  { title: "House calls", text: "Prefer privacy or a relaxed setting? Book a session at your place within our service areas." },
];

// "Why book with us" panel on the booking page.
export const whyBook: { icon: IconName; title: string; text: string }[] = [
  { icon: "calendar", title: "Flexible scheduling", text: `${hoursSummary()}. Pick the time that suits your day.` },
  { icon: "pin", title: "We come to you", text: `House calls across ${serviceAreas.join(", ")}.` },
  {
    icon: "phone",
    title: "Secure your slot with M-Pesa",
    text: `A KES ${booking.depositKes.toLocaleString("en-KE")} deposit locks your time and comes off the final price.`,
  },
  { icon: "pen", title: "Designed for you", text: "Tell us your idea and share references. Every piece is drawn to fit you." },
];
