import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource/oswald/latin-600.css";
import "./globals.css";
import Header from "@/components/Header";
import WhatsAppButton from "@/components/WhatsAppButton";
import { studio } from "@/lib/config";
import { hoursSummary, telUrl, whatsappUrl } from "@/lib/format";

const site = process.env.SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: {
    default: `${studio.name} | Custom tattoo artist in ${studio.area}`,
    template: `%s | ${studio.name}`,
  },
  description: `${studio.name}: ${studio.tagline} Book online and secure your slot with M-Pesa.`,
  openGraph: { type: "website", locale: "en_KE", siteName: studio.name },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a0a0a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-KE">
      <body>
        <Header name={studio.name} />
        {children}
        <footer>
          <div className="wrap">
            <div className="footer-grid">
              <div>
                <p className="foot-h">{studio.name}</p>
                <p>{studio.tagline}</p>
              </div>
              <div>
                <p className="foot-h">Explore</p>
                <Link href="/#about">About</Link>
                <Link href="/#work">Gallery</Link>
                <Link href="/#services">Services</Link>
                <Link href="/#faq">FAQ</Link>
                <Link href="/book">Book a session</Link>
              </div>
              <div>
                <p className="foot-h">Contact</p>
                <a href={telUrl()}>{studio.phoneDisplay}</a>
                <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                <a href={studio.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>
                <p style={{ marginTop: 8 }}>{hoursSummary()}</p>
              </div>
            </div>
            <p className="fine">
              © {new Date().getFullYear()} {studio.name}. Deposits are paid securely by M-Pesa.
            </p>
          </div>
        </footer>
        <WhatsAppButton />
      </body>
    </html>
  );
}
