"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { PI_CLASSES } from "@/lib/piClass";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRICE_STEP = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriceHistogramBucket {
  bucketMin: number;
  bucketMax: number;
  count: number;
}

export interface PriceStats {
  min: number;
  max: number;
  histogram: PriceHistogramBucket[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CarFiltersProps {
  manufacturers: string[];
  sourceGames: string[];
  priceStats: PriceStats;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CarFilters({
  manufacturers,
  sourceGames,
  priceStats,
}: CarFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Dynamic bounds from the server
  const PRICE_MIN = priceStats.min;
  const PRICE_MAX = priceStats.max;
  const hasPriceData = PRICE_MIN > 0 && PRICE_MAX > 0 && PRICE_MAX > PRICE_MIN;

  // "More filters" panel open / closed
  const [moreOpen, setMoreOpen] = useState(() => {
    return !!(
      searchParams.get("availableNow") ||
      searchParams.get("priceMin") ||
      searchParams.get("priceMax")
    );
  });

  // ------ helpers ------

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const current = (key: string) => searchParams.get(key) ?? "";

  const search = current("q");
  const availableNow = current("availableNow") === "true";

  // Parse price params, clamped to server-provided bounds
  const priceMinParam = parseInt(current("priceMin"), 10);
  const priceMaxParam = parseInt(current("priceMax"), 10);
  const priceMin =
    Number.isFinite(priceMinParam) && hasPriceData
      ? Math.max(PRICE_MIN, Math.min(priceMinParam, PRICE_MAX))
      : PRICE_MIN;
  const priceMax =
    Number.isFinite(priceMaxParam) && hasPriceData
      ? Math.max(PRICE_MIN, Math.min(priceMaxParam, PRICE_MAX))
      : PRICE_MAX;

  // Badge count
  const moreActiveCount =
    (availableNow ? 1 : 0) +
    (priceMin > PRICE_MIN ? 1 : 0) +
    (priceMax < PRICE_MAX ? 1 : 0);

  // Histogram rendering helpers
  const maxBucketCount = Math.max(
    1,
    ...priceStats.histogram.map((b) => b.count)
  );

  return (
    <div className="space-y-3">
      {/* ── Primary filter row ── */}
      <div className="flex flex-wrap items-end gap-3">
        {/* Search */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
          Search
          <input
            type="text"
            placeholder="Model or name…"
            defaultValue={search}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                updateParam("q", (e.target as HTMLInputElement).value);
              }
            }}
            className="h-9 w-44 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          />
        </label>

        {/* Manufacturer */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
          Manufacturer
          <select
            value={current("manufacturer")}
            onChange={(e) => updateParam("manufacturer", e.target.value)}
            className="h-9 rounded-lg border border-gray-300 bg-white px-2 pr-8 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          >
            <option value="">All</option>
            {manufacturers.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        {/* Class (PI) */}
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
          Class
          <select
            value={current("class")}
            onChange={(e) => updateParam("class", e.target.value)}
            className="h-9 rounded-lg border border-gray-300 bg-white px-2 pr-8 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
          >
            <option value="">All</option>
            {PI_CLASSES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.min}{c.max < 9999 ? `–${c.max}` : "+"})
              </option>
            ))}
          </select>
        </label>

        {/* Source Game */}
        {sourceGames.length > 1 && (
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Game
            <select
              value={current("source_game")}
              onChange={(e) => updateParam("source_game", e.target.value)}
              className="h-9 rounded-lg border border-gray-300 bg-white px-2 pr-8 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              <option value="">All</option>
              {sourceGames.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* More filters toggle */}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm text-gray-600 transition-colors hover:bg-gray-50"
        >
          <svg
            className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          More filters
          {moreActiveCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-[10px] font-bold text-white">
              {moreActiveCount}
            </span>
          )}
        </button>

        {/* Clear filters */}
        {searchParams.toString() && (
          <button
            onClick={() => router.push(pathname)}
            className="h-9 rounded-lg border border-gray-300 px-3 text-sm text-gray-600 transition-colors hover:bg-gray-100"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Expandable "More filters" panel ── */}
      {moreOpen && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-8">
            {/* ---- Available now toggle ---- */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Availability
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={availableNow}
                onClick={() =>
                  updateParam("availableNow", availableNow ? "" : "true")
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 ${
                  availableNow ? "bg-gray-900" : "bg-gray-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
                    availableNow ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-xs text-gray-500">
                {availableNow ? "Showing available only" : "Showing all"}
              </span>
            </div>

            {/* ---- Price range slider ---- */}
            <div className="flex min-w-[280px] flex-1 flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Price Range (cr/hr)
              </span>

              {hasPriceData ? (
                <>
                  {/* Histogram */}
                  <div className="flex h-12 items-end gap-px rounded-lg bg-gray-50 px-1 pb-0.5">
                    {priceStats.histogram.map((bucket, i) => {
                      const pct =
                        bucket.count > 0
                          ? Math.max(8, (bucket.count / maxBucketCount) * 100)
                          : 0;

                      // Dim bars outside the selected range
                      const bucketMid =
                        (bucket.bucketMin + bucket.bucketMax) / 2;
                      const inRange =
                        bucketMid >= priceMin && bucketMid <= priceMax;

                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-t transition-colors ${
                            inRange ? "bg-gray-700" : "bg-gray-200"
                          }`}
                          style={{ height: `${pct}%` }}
                          title={`${bucket.bucketMin}–${bucket.bucketMax} cr/hr: ${bucket.count} car${bucket.count !== 1 ? "s" : ""}`}
                        />
                      );
                    })}
                  </div>

                  {/* Two-thumb range slider */}
                  <div className="relative h-6">
                    {/* Track background */}
                    <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full bg-gray-200" />
                    {/* Active track */}
                    <div
                      className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-gray-900"
                      style={{
                        left: `${((priceMin - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100}%`,
                        right: `${100 - ((priceMax - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100}%`,
                      }}
                    />
                    {/* Min thumb */}
                    <input
                      type="range"
                      min={PRICE_MIN}
                      max={PRICE_MAX}
                      step={PRICE_STEP}
                      value={priceMin}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        updateParams({
                          priceMin: v > PRICE_MIN ? String(v) : "",
                          priceMax:
                            v >= priceMax
                              ? String(Math.min(v + PRICE_STEP, PRICE_MAX))
                              : current("priceMax"),
                        });
                      }}
                      className="pointer-events-none absolute inset-0 appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-900 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-gray-900 [&::-moz-range-thumb]:bg-white"
                    />
                    {/* Max thumb */}
                    <input
                      type="range"
                      min={PRICE_MIN}
                      max={PRICE_MAX}
                      step={PRICE_STEP}
                      value={priceMax}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        updateParams({
                          priceMax: v < PRICE_MAX ? String(v) : "",
                          priceMin:
                            v <= priceMin
                              ? String(Math.max(v - PRICE_STEP, PRICE_MIN))
                              : current("priceMin"),
                        });
                      }}
                      className="pointer-events-none absolute inset-0 appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-gray-900 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-gray-900 [&::-moz-range-thumb]:bg-white"
                    />
                  </div>

                  {/* Labels */}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{priceMin} cr/hr</span>
                    <span>{priceMax} cr/hr</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-gray-400 italic">
                  No price data available for current filters.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
