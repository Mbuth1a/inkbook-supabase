import { studio } from "./config.ts";

// How deposits are taken.
//  request (default): the client sends a booking request. The slot is held until the artist
//                     confirms the M-Pesa deposit by hand from the dashboard. No VPS or Safaricom needed.
//  mpesa:             the Daraja STK Push prompt, once Safaricom approval and a public server are in place.
export type PaymentMode = "request" | "mpesa";

export function paymentMode(): PaymentMode {
  return process.env.BOOKING_PAYMENTS === "mpesa" ? "mpesa" : "request";
}

// What the client sees in request mode. Edit the number here if the deposit goes to a different M-Pesa line.
export function depositInstructions(depositKes: number): string {
  return `Send KES ${depositKes.toLocaleString("en-KE")} by M-Pesa Send Money to ${studio.phoneDisplay}, then send us the confirmation message on WhatsApp.`;
}
