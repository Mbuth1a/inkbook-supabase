"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Bookings" },
  { href: "/admin/gallery", label: "Gallery" },
];

export default function AdminNav() {
  const path = usePathname();
  return (
    <nav className="ad-nav" aria-label="Dashboard">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
      <a href="/" target="_blank" rel="noopener noreferrer">
        View site
      </a>
    </nav>
  );
}
