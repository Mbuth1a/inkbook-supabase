import type { Metadata } from "next";
import BookingStatus from "@/components/BookingStatus";

export const metadata: Metadata = { title: "Your booking", robots: { index: false } };

export default async function StatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="wrap">
      <BookingStatus id={id} />
    </main>
  );
}
