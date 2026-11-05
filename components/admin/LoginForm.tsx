"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      setError(json.error || "Couldn't sign in. Please try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card login-card">
      <h1 style={{ fontSize: "2rem", marginBottom: 6 }}>Studio login</h1>
      <p className="muted" style={{ marginBottom: 22 }}>For the artist only.</p>
      {!configured && (
        <p className="error" role="alert" style={{ color: "#ffb4a6", marginBottom: 16 }}>
          Login isn&apos;t set up yet. Add ADMIN_PASSWORD and SESSION_SECRET to .env.local and restart the site.
        </p>
      )}
      <div className="field">
        <label htmlFor="pw">Password</label>
        <input
          id="pw"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={busy || !password}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
