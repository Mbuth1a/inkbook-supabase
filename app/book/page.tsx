import type { Metadata } from "next";
import BookingFlow from "@/components/BookingFlow";
import { Icon } from "@/components/Icons";
import { whyBook } from "@/content/site";
import { paymentMode } from "@/lib/payments";
import { booking, studio } from "@/lib/config";
import { whatsappUrl } from "@/lib/format";

export const metadata: Metadata = {
  title: "Book a tattoo session",
  description: "Choose your style, pick a date and secure your tattoo slot with an M-Pesa deposit.",
  alternates: { canonical: "/book" },
};

export const dynamic = "force-dynamic";

export default function BookPage() {
  const mode = paymentMode();
  return (
    <main>
      <section className="page-hero">
        <div className="wrap">
          <p className="eyebrow">Book your session</p>
          <h1>
            Secure <span className="gold">your slot</span>
          </h1>
          <p>
            Tell us the idea, pick a time and pay a KES {booking.depositKes.toLocaleString("en-KE")} deposit by M-Pesa.
            Not sure about something?{" "}
            <a href={whatsappUrl(`Hi ${studio.name}, I have a question before booking.`)} target="_blank" rel="noopener noreferrer" className="gold">
              Message us on WhatsApp
            </a>
            .
          </p>
        </div>
      </section>

      <div className="wrap book-grid">
        <div className="book-card">
          <BookingFlow depositKes={booking.depositKes} holdMinutes={booking.holdMinutes} mode={mode} />
        </div>
        <aside className="book-aside" aria-labelledby="why-title">
          <h2 id="why-title">
            Why book with <span className="gold">{studio.name}</span>?
          </h2>
          <p>Here is what makes the experience different, from your first message to aftercare.</p>
          {whyBook.map((f) => (
            <div key={f.title} className="feature">
              <div className="ico"><Icon name={f.icon} size={26} /></div>
              <div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}
