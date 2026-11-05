import { NextResponse } from "next/server";
import { slotsFor } from "@/lib/bookings";
import { booking, sizes, type SizeKey } from "@/lib/config";
import { addDays, isBookableDate, nairobiNowDate } from "@/lib/slots";

export const dynamic = "force-dynamic";

// GET /api/availability?size=small            -> dates that still have a free slot
// GET /api/availability?size=small&date=...   -> the free start times on that date
export async function GET(req: Request) {
  const url = new URL(req.url);
  const size = url.searchParams.get("size") as SizeKey;
  if (!(size in sizes)) return NextResponse.json({ error: "Unknown size" }, { status: 400 });

  const now = Date.now();
  const date = url.searchParams.get("date");
  if (date) {
    return NextResponse.json({ date, slots: await slotsFor(date, size, now) });
  }

  const today = nairobiNowDate(now);
  const dates: string[] = [];
  for (let i = 0; i <= booking.maxDaysAhead; i++) {
    const d = addDays(today, i);
    if (isBookableDate(d, now) && (await slotsFor(d, size, now)).length > 0) dates.push(d);
  }
  return NextResponse.json({ dates });
}
