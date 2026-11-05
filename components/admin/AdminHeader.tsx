import AdminNav from "./AdminNav";
import LogoutButton from "./LogoutButton";

// Rendered by each signed-in page (not by the layout), so it always reflects the current session.
export default function AdminHeader() {
  return (
    <header className="ad-top">
      <div className="ad-top-inner">
        <span className="ad-brand">Studio dashboard</span>
        <AdminNav />
        <LogoutButton />
      </div>
    </header>
  );
}
