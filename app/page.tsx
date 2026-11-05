import Link from "next/link";
import { Icon } from "@/components/Icons";
import GalleryGrid from "@/components/GalleryGrid";
import { portfolio } from "@/content/portfolio";
import { listHomeGallery } from "@/lib/gallery";
import { paymentMode } from "@/lib/payments";
import { faq } from "@/content/faq";
import { about, serviceAreas, services } from "@/content/site";
import { booking, sizes, studio } from "@/lib/config";
import { hoursSummary, telUrl, whatsappUrl } from "@/lib/format";

// Read the gallery on each visit so new photos appear straight away.
export const dynamic = "force-dynamic";

const site = process.env.SITE_URL || "http://localhost:3000";

// Structured data lets Google show the business and the FAQ as rich results.
// No street address is published: house-call artists have no walk-in shop, and a wrong address
// hurts local ranking. If there is a real base location, add an `address` block here.
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "TattooParlor",
    name: studio.name,
    url: site,
    telephone: studio.phoneDisplay,
    description: studio.tagline,
    areaServed: serviceAreas.map((name) => ({ "@type": "City", name })),
    priceRange: "KES",
    sameAs: [studio.instagram],
    paymentAccepted: "M-Pesa",
    currenciesAccepted: "KES",
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  },
];

export default async function Home() {
  const photos = await listHomeGallery();
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <section className="hero">
        <div className="wrap">
          <p className="eyebrow">Tattoo artist · {serviceAreas.join(" · ")}</p>
          <h1>
            Custom tattoos, <span className="gold">drawn for you.</span>
          </h1>
          <p className="lead">{studio.tagline} Book online and secure your slot with an M-Pesa deposit.</p>
          <div className="actions">
            <Link href="/book" className="btn btn-primary">Book a Session</Link>
            <Link href="/#work" className="btn">See the work</Link>
          </div>
        </div>
      </section>

      <section id="about" className="section">
        <div className="wrap about-grid">
          <div>
            <p className="eyebrow">About</p>
            <h2 style={{ marginBottom: 20 }}>
              Meet <span className="gold">{studio.name}</span>
            </h2>
            {about.map((p) => (
              <p key={p} className="muted">{p}</p>
            ))}
          </div>
          <div className="card">
            <ul className="facts">
              <li><span>Where</span><span>{serviceAreas.join(", ")}</span></li>
              <li><span>House calls</span><span>Available</span></li>
              <li><span>Hours</span><span>{hoursSummary()}</span></li>
              <li><span>Deposit</span><span>KES {booking.depositKes.toLocaleString("en-KE")} by M-Pesa</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section id="work" className="section">
        <div className="wrap">
          <p className="eyebrow">Gallery</p>
          <h2>Recent work</h2>
          <p className="muted" style={{ marginTop: 12 }}>Fresh and healed photos, so you can see how each style settles in.</p>
          <GalleryGrid items={photos.length ? photos : portfolio} />
          <div style={{ textAlign: "center", marginTop: 28 }}>
            <Link href="/gallery" className="btn">See the full gallery</Link>
          </div>
        </div>
      </section>

      <section id="services" className="section">
        <div className="wrap">
          <p className="eyebrow">Services</p>
          <h2 style={{ marginBottom: 24 }}>What we do</h2>
          <div className="cards">
            {services.map((s) => (
              <div key={s.title} className="card">
                <h3>{s.title}</h3>
                <p className="muted">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <p className="eyebrow">How it works</p>
          <h2 style={{ marginBottom: 24 }}>Booking in three steps</h2>
          <div className="cards">
            <div className="card"><p className="num">1</p><h3>Tell us the idea</h3><p className="muted">Style, size, placement and reference images.</p></div>
            <div className="card"><p className="num">2</p><h3>Pick a time</h3><p className="muted">See live availability. Session length depends on size.</p></div>
            <div className="card">
              <p className="num">3</p>
              <h3>Pay the deposit</h3>
              <p className="muted">
                {paymentMode() === "request"
                  ? `Send your request, then pay the KES ${booking.depositKes.toLocaleString("en-KE")} deposit by M-Pesa. We confirm your slot as soon as it arrives.`
                  : `KES ${booking.depositKes.toLocaleString("en-KE")} by M-Pesa. Approve the prompt on your phone and you are booked.`}
              </p>
            </div>
          </div>
          <p className="muted" style={{ marginTop: 20 }}>
            Typical session lengths: {Object.values(sizes).map((s) => `${s.label.toLowerCase()} about ${s.durationMin / 60} hours`).join(", ")}.
          </p>
        </div>
      </section>

      <section id="faq" className="section">
        <div className="wrap" style={{ maxWidth: 760 }}>
          <p className="eyebrow">FAQ</p>
          <h2 style={{ marginBottom: 20 }}>Prices, deposits and aftercare</h2>
          {faq.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="contact" className="section">
        <div className="wrap">
          <p className="eyebrow">Contact</p>
          <h2>Questions before you book?</h2>
          <p className="muted" style={{ marginTop: 12 }}>Message us and we will help you plan the piece. Open {hoursSummary().toLowerCase()}.</p>
          <div className="contact-cards">
            <a className="contact-card" href={whatsappUrl(`Hi ${studio.name}, I'd like to ask about a tattoo.`)} target="_blank" rel="noopener noreferrer">
              <div className="ico"><Icon name="chat" size={28} /></div>
              <strong>WhatsApp</strong>
              <span>Chat with us</span>
            </a>
            <a className="contact-card" href={telUrl()}>
              <div className="ico"><Icon name="phone" size={28} /></div>
              <strong>Call</strong>
              <span>{studio.phoneDisplay}</span>
            </a>
            <a className="contact-card" href={studio.instagram} target="_blank" rel="noopener noreferrer">
              <div className="ico"><Icon name="instagram" size={28} /></div>
              <strong>Instagram</strong>
              <span>See more work</span>
            </a>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap" style={{ textAlign: "center" }}>
          <h2>Ready when you are.</h2>
          <p className="muted" style={{ margin: "12px 0 24px" }}>Slots go quickly. Book yours now.</p>
          <Link href="/book" className="btn btn-primary">Book a Session</Link>
        </div>
      </section>
    </main>
  );
}
