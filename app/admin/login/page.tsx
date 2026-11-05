import { redirect } from "next/navigation";
import LoginForm from "@/components/admin/LoginForm";
import { adminConfigured } from "@/lib/auth";
import { isAdminSession } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAdminSession()) redirect("/admin");
  return (
    <div className="ad-login-wrap">
      <div style={{ width: "100%", maxWidth: 400 }}>
        <LoginForm configured={adminConfigured()} />
      </div>
    </div>
  );
}
