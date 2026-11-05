import { NextResponse } from "next/server";
import { adminApiGuard } from "@/lib/adminGuard";
import { adminUpdateBooking, type AdminAction } from "@/lib/bookings";

export const dynamic = "force-dynamic";

const ACTIONS: AdminAction[] = ["accept", "decline", "complete", "cancel", "resolve"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await adminApiGuard(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown; receipt?: unknown } | null;
  const action = ACTIONS.find((a) => a === body?.action);
  if (!action) return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const receipt = typeof body?.receipt === "string" ? body.receipt : undefined;
  const result = await adminUpdateBooking(id, action, receipt);
  if (!result.ok) {
    return result.error === "not_found"
      ? NextResponse.json({ error: "Booking not found." }, { status: 404 })
      : NextResponse.json({ error: "This booking has already changed. Refresh the page." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, status: result.booking.status });
}
