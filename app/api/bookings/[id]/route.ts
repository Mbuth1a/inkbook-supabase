import { NextResponse } from "next/server";
import { applyPaymentResult, expireStale, getBooking } from "@/lib/bookings";
import { mpesaEnv, queryStk } from "@/lib/mpesa";
import { publicView } from "@/lib/publicView";

export const dynamic = "force-dynamic";

const lastQuery = new Map<string, number>();

// The page polls this every couple of seconds while the client approves the prompt on their phone.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await expireStale();
  let row = await getBooking(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Safety net: if Safaricom's callback is late or lost, ask Safaricom directly (at most every 8s).
  if (row.status === "pending" && row.checkout_request_id && mpesaEnv() !== "mock") {
    const now = Date.now();
    if (now - row.created_at > 15_000 && now - (lastQuery.get(id) ?? 0) > 8_000) {
      lastQuery.set(id, now);
      try {
        const result = await queryStk(row.checkout_request_id);
        if (result) await applyPaymentResult(row.checkout_request_id, result);
        row = (await getBooking(id))!;
      } catch (e) {
        console.error("[bookings] STK query failed", e);
      }
    }
  }
  return NextResponse.json(publicView(row), { headers: { "Cache-Control": "no-store" } });
}
