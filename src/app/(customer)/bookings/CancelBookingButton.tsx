"use client";

import { useState, useTransition } from "react";
import { cancelBooking, type CancelResult } from "./actions";

export default function CancelBookingButton({
  bookingId,
}: {
  bookingId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<CancelResult | null>(null);

  function handleCancel() {
    const ok = window.confirm(
      "Are you sure you want to cancel this booking?\n\n" +
        "Refund policy:\n" +
        "• > 6 hours before start → 100% refund\n" +
        "• 1–6 hours → 50% refund\n" +
        "• < 1 hour → no refund"
    );
    if (!ok) return;

    startTransition(async () => {
      const res = await cancelBooking(bookingId);
      setResult(res);
    });
  }

  // After successful cancel → show inline result
  if (result?.success) {
    const pct = Math.round((result.refundPct ?? 0) * 100);
    return (
      <div className="text-right text-sm">
        <p className="font-medium text-red-600">Canceled</p>
        <p className="text-gray-500">
          {result.refundCredits ?? 0} credit
          {result.refundCredits !== 1 ? "s" : ""} refunded ({pct}%)
        </p>
      </div>
    );
  }

  // Error state
  if (result && !result.success) {
    return (
      <div className="text-right text-sm">
        <p className="text-red-600">{result.error}</p>
        <button
          onClick={() => setResult(null)}
          className="mt-1 text-xs text-gray-400 underline hover:text-gray-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleCancel}
      disabled={isPending}
      className="shrink-0 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
    >
      {isPending ? "Canceling…" : "Cancel"}
    </button>
  );
}
