"use client";

import { useState, useTransition } from "react";
import { deleteBlackout } from "./actions";

interface Props {
  blackout: {
    id: string;
    start_ts: string;
    end_ts: string;
    reason: string | null;
    unit_label: string;
  };
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BlackoutRow({ blackout }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!window.confirm("Delete this blackout window?")) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteBlackout(blackout.id);
      if (!res.success) setError(res.error ?? "Failed");
    });
  }

  const now = new Date();
  const endDate = new Date(blackout.end_ts);
  const isPast = endDate < now;

  return (
    <tr className={`${isPending ? "opacity-50" : ""} ${isPast ? "text-gray-400" : ""}`}>
      <td className="px-6 py-4 font-medium text-gray-900">
        {blackout.unit_label}
      </td>
      <td className="px-6 py-4">{fmt(blackout.start_ts)}</td>
      <td className="px-6 py-4">{fmt(blackout.end_ts)}</td>
      <td className="px-6 py-4">{blackout.reason ?? "—"}</td>
      <td className="px-6 py-4">
        {isPast ? (
          <span className="text-xs text-gray-400">Expired</span>
        ) : (
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Delete
          </button>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
