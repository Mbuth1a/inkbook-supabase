import { NextResponse } from "next/server";
import { handleStkCallback } from "@/lib/callback";
import { callbackSourceIp } from "@/lib/callbackGuard";

export const dynamic = "force-dynamic";

// Thin wrapper: the decision lives in lib/callback.ts so it can be tested.
export async function POST(req: Request, { params }: { params: Promise<{ secret: string }> }) {
  const { secret } = await params;
  const body = await req.json().catch(() => null);
  const reply = await handleStkCallback({ secret, body, sourceIp: callbackSourceIp(req) });
  if (reply.status === 404) return new Response("Not found", { status: 404 });
  return NextResponse.json(reply.body ?? {}, { status: reply.status });
}
