"use client";

import { useState } from "react";

export default function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    // A full page load, so nothing from the signed-in session is left in memory.
    window.location.assign("/admin/login");
  }

  return (
    <button type="button" className="ad-btn ad-btn-quiet" onClick={signOut} disabled={busy}>
      Sign out
    </button>
  );
}
