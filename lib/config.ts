// Everything the artist is likely to change lives here. No code changes needed elsewhere.

export const studio = {
  name: "Rannie Ink",
  artist: "Rannie INK",
  tagline: "Custom tattoos across Nairobi, Naivasha and Thika Road, with house calls. Fine line, blackwork and script.",
  area: "Nairobi",
  city: "Nairobi",
  phoneDisplay: "+254 757 219 316",
  instagram: "https://instagram.com/yourhandle",
  // Replace with the real address and coordinates before launch; they feed Google's local business schema.
  address: { street: "Argwings Kodhek Rd", locality: "Nairobi", region: "Nairobi County", country: "KE" },
  geo: { lat: -1.2921, lng: 36.7872 },
} as const;

export const booking = {
  depositKes: 500,
  // How long a slot is held while the client approves the M-Pesa prompt.
  holdMinutes: 5,
  // Studio opens/closes (Africa/Nairobi time, 24h clock). Kenya has no daylight saving.
  openHour: 7,
  closeHour: 23,
  // 0 = Sunday ... 6 = Saturday. Tuesday to Saturday.
  workingDays: [0, 1, 2, 3, 4, 5, 6],
  // How far ahead clients can book, and the minimum notice.
  maxDaysAhead: 60,
  minNoticeHours: 24,
  // Start times offered on the hour. Raise to 120 for 2-hourly starts.
  slotStepMinutes: 60,
  timezone: "Africa/Nairobi",
} as const;

export type SizeKey = "small" | "medium" | "large";

// Session length drives how much of the day a booking blocks out.
export const sizes: Record<SizeKey, { label: string; hint: string; durationMin: number }> = {
  small: { label: "Small", hint: "Under 10 cm. Around 2 hours", durationMin: 120 },
  medium: { label: "Medium", hint: "10 to 20 cm. Around 4 hours", durationMin: 240 },
  large: { label: "Large", hint: "Over 20 cm. Around 6 hours", durationMin: 360 },
};

export const styles = [
  "Fine line",
  "Minimalist",
  "Blackwork",
  "Neo-traditional",
  "Script / lettering",
  "Realism",
  "Cover-up",
  "Not sure yet",
] as const;

export const placements = [
  "Forearm",
  "Upper arm",
  "Shoulder",
  "Back",
  "Chest",
  "Ribs",
  "Thigh",
  "Calf",
  "Ankle / foot",
  "Neck",
  "Hand / fingers",
  "Other",
] as const;

export const MAX_REF_IMAGES = 4;
export const MAX_REF_BYTES = 5 * 1024 * 1024;
