import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = {
  title: "Studio dashboard",
  robots: { index: false, follow: false },
};

// Static wrapper only. Each page checks the session itself (requireAdminPage), so a signed-out
// visitor never receives any booking data.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-shell">{children}</div>;
}
