"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCompareStore } from "@/lib/store/compareStore";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Client wrapper for compare page
// Handles: (1) Redirect to URL with IDs from store, (2) Single-car message
// ---------------------------------------------------------------------------

interface Props {
  /** IDs from URL (already extracted server-side) */
  urlIds: string[];
}

export default function ComparePageClient({ urlIds }: Props) {
  const router = useRouter();
  const storeIds = useCompareStore((s) => s.selectedIds);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // If no URL IDs, try to use store IDs
    if (urlIds.length === 0 && storeIds.length > 0) {
      router.replace(`/compare?ids=${storeIds.join(",")}`);
      return;
    }
    setChecked(true);
  }, [urlIds, storeIds, router]);

  // Still checking
  if (!checked) {
    return (
      <section className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>
      </section>
    );
  }

  // Only 1 car selected (or 0)
  if (urlIds.length < 2) {
    return (
      <section className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/cars"
          className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-900"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Cars
        </Link>

        <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <svg
            className="mx-auto h-12 w-12 text-amber-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h2 className="mt-4 text-lg font-semibold text-gray-900">
            Select 2 cars to compare
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            You need to select at least 2 cars from the catalog before you can compare them side-by-side.
          </p>
          <Link
            href="/cars"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            Browse Cars
          </Link>
        </div>
      </section>
    );
  }

  // This shouldn't render if we have 2 IDs — the server will render the comparison
  return null;
}
