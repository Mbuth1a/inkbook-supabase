import { paymentMode } from "@/lib/payments";
import { booking } from "@/lib/config";

// Written to answer the questions people actually search for in Nairobi.
// Rendered on the page and as FAQ schema for Google. Keep answers factual and short.

export const faq = [
  {
    q: "How much does a tattoo cost in Nairobi?",
    a: "Pricing depends on size, detail and placement. Small pieces start from about KES 5,000, medium pieces from KES 12,000 and large or multi-session work is quoted after a consultation.",
  },
  {
    q: "How does the deposit work?",
    a: `A KES ${booking.depositKes.toLocaleString("en-KE")} deposit is paid by M-Pesa when you book. It secures your slot and comes off the final price. Deposits are non-refundable, but you can reschedule once with 48 hours notice.`,
  },
  {
    q: "How do I pay the deposit?",
    a: paymentMode() === "request"
      ? "Send your booking request with the date and time you want. Pay the deposit by M-Pesa Send Money to the number shown on your confirmation page, then send us the M-Pesa message on WhatsApp. We confirm your slot as soon as the deposit arrives."
      : "Choose your date, enter your Safaricom number and you will get an M-Pesa prompt on your phone. Enter your PIN to confirm. Your booking is locked as soon as the payment goes through.",
  },
  {
    q: "What is the tattoo aftercare routine?",
    a: "Keep the dressing on for the time your artist advises, wash gently with fragrance-free soap, pat dry, and apply a thin layer of aftercare balm. Avoid swimming, saunas and direct sun while it heals. Full instructions are given after your session.",
  },
  {
    q: "Do you do cover-ups?",
    a: "Yes. Choose Cover-up as the style when you book and add a clear photo of the existing tattoo as a reference.",
  },
  {
    q: "Is the studio hygienic?",
    a: "Single-use needles and sterile, disposable equipment are used for every client, and all surfaces are disinfected between sessions.",
  },
];
