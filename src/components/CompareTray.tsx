"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  useCompareStore,
  MAX_COMPARE,
  type CompareCarData,
} from "@/lib/store/compareStore";

const BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPkQ1sDSgAAAABJRU5ErkJggg==";

// ---------------------------------------------------------------------------
// Compare Tray — persistent sticky bottom bar showing selected cars
// ---------------------------------------------------------------------------

export default function CompareTray() {
  const router = useRouter();
  const selectedIds = useCompareStore((s) => s.selectedIds);
  const carData = useCompareStore((s) => s.carData);
  const remove = useCompareStore((s) => s.remove);
  const clear = useCompareStore((s) => s.clear);

  // Get cached car data for selected IDs
  const selectedCars: CompareCarData[] = selectedIds
    .map((id) => carData[id])
    .filter(Boolean);

  if (selectedIds.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 shadow-lg backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        {/* Selected cars */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
            Compare ({selectedIds.length}/{MAX_COMPARE})
          </span>

          {selectedCars.map((car) => (
            <div
              key={car.id}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5"
            >
              {car.image_url && (
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-gray-100">
                  <Image
                    src={car.image_url}
                    alt={car.display_name}
                    width={48}
                    height={48}
                    className="h-full w-full object-cover"
                    placeholder="blur"
                    blurDataURL={BLUR_PLACEHOLDER}
                  />
                </div>
              )}
              <span className="max-w-[120px] truncate text-sm font-medium text-gray-900">
                {car.model ?? car.display_name}
              </span>
              <button
                type="button"
                onClick={() => remove(car.id)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}

          {/* For IDs that don't have cached data yet, show placeholder */}
          {selectedIds
            .filter((id) => !carData[id])
            .map((id) => (
              <div
                key={id}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-gray-200 animate-pulse" />
                <span className="max-w-[80px] truncate text-sm text-gray-400">
                  Loading...
                </span>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                >
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}

          {selectedIds.length < MAX_COMPARE && (
            <div className="flex h-10 w-20 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-xs text-gray-400">
              + Add car
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clear}
            className="rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100"
          >
            Clear
          </button>

          <button
            type="button"
            disabled={selectedIds.length < 2}
            onClick={() => {
              router.push(`/compare?ids=${selectedIds.join(",")}`);
            }}
            className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Compare
          </button>
        </div>
      </div>
    </div>
  );
}
