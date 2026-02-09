"use client";

import { useState, useTransition } from "react";
import { deleteBusiness } from "./actions";

interface Props {
  business: {
    id: string;
    name: string;
    slug: string;
    created_at: string;
  };
  carCount: number;
  userCount: number;
}

export default function BusinessRow({ business, carCount, userCount }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (
      !window.confirm(
        `Delete "${business.name}"? This will cascade to all associated cars and data.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const res = await deleteBusiness(business.id);
      if (!res.success) setError(res.error ?? "Failed");
    });
  }

  return (
    <tr className={isPending ? "opacity-50" : ""}>
      <td className="px-6 py-4 font-medium text-gray-900">{business.name}</td>
      <td className="px-6 py-4 text-gray-500 font-mono text-xs">
        {business.slug}
      </td>
      <td className="px-6 py-4 text-gray-600">{carCount}</td>
      <td className="px-6 py-4 text-gray-600">{userCount}</td>
      <td className="px-6 py-4 text-gray-500">
        {new Date(business.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>
      <td className="px-6 py-4">
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-sm text-red-500 hover:text-red-700"
        >
          Delete
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
