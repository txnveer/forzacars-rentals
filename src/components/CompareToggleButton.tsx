"use client";

import {
  useCompareStore,
  MAX_COMPARE,
  type CompareCarData,
} from "@/lib/store/compareStore";

// ---------------------------------------------------------------------------
// Compare Toggle Button — uses Zustand store (localStorage-persisted)
// ---------------------------------------------------------------------------

interface CompareToggleButtonProps {
  car: CompareCarData;
  small?: boolean;
}

export default function CompareToggleButton({
  car,
  small,
}: CompareToggleButtonProps) {
  const selectedIds = useCompareStore((s) => s.selectedIds);
  const toggle = useCompareStore((s) => s.toggle);

  const isSelected = selectedIds.includes(car.id);
  const isFull = selectedIds.length >= MAX_COMPARE && !isSelected;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault(); // card is wrapped in a <Link>
    e.stopPropagation();

    if (isFull) return; // silently block
    toggle(car.id, car);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={
        isSelected
          ? "Remove from comparison"
          : isFull
            ? "Maximum 2 cars to compare"
            : "Add to comparison"
      }
      className={`${
        small ? "h-6 px-2 text-[10px]" : "h-7 px-2.5 text-xs"
      } inline-flex items-center gap-1 rounded-full font-medium transition-colors ${
        isSelected
          ? "bg-gray-900 text-white hover:bg-gray-700"
          : isFull
            ? "cursor-not-allowed bg-gray-100 text-gray-300"
            : "bg-white/80 text-gray-600 backdrop-blur-sm hover:bg-gray-100"
      } border border-gray-200 shadow-sm`}
    >
      {isSelected ? (
        <>
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
              d="M5 13l4 4L19 7"
            />
          </svg>
          Compare
        </>
      ) : (
        <>
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Compare
        </>
      )}
    </button>
  );
}
