"use client";

import Link from "next/link";
import { useState } from "react";

const links = [
  ["Home", "/"],
  ["About", "/#about"],
  ["Gallery", "/#work"],
  ["Services", "/#services"],
  ["FAQ", "/#faq"],
  ["Contact", "/#contact"],
] as const;

export default function Header({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="brand" onClick={close}>
          {name}
        </Link>
        <div className="header-right">
          <nav id="site-nav" className={open ? "nav open" : "nav"} aria-label="Main">
            {links.map(([label, href]) => (
              <Link key={href} href={href} onClick={close}>
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/book" className="btn btn-primary btn-sm" onClick={close}>
            Book a Session
          </Link>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={open}
            aria-controls="site-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)}
          >
            <span aria-hidden="true">{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
