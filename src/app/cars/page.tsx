import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { piClassName, piClassColor } from "@/lib/piClass";
import CarFilters from "@/components/CarFilters";
import CompareToggleButton from "@/components/CompareToggleButton";
import { PriceCompact } from "@/components/PriceDisplay";
import { getImageUrl } from "@/lib/supabase/getImageUrl";

/** Tiny 1×1 grey pixel used as a blur placeholder while images load. */
const BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPkQ1sDSgAAAABJRU5ErkJggg==";

/** Number of images above the fold that should load eagerly (no lazy load). */
const PRIORITY_COUNT = 4;

const PAGE_SIZE = 24;
const HISTOGRAM_BINS = 15;

// ---------------------------------------------------------------------------
// Search params
// ---------------------------------------------------------------------------

interface Props {
  searchParams: Promise<{
    manufacturer?: string;
    class?: string;
    source_game?: string;
    q?: string;
    page?: string;
    priceMin?: string;
    priceMax?: string;
    availableNow?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Helper: build non-price filter predicates on a Supabase query
// ---------------------------------------------------------------------------

type Params = Awaited<Props["searchParams"]>;

function applyBaseFilters<T extends { eq: Function; or: Function }>(
  query: T,
  params: Params
): T {
  if (params.manufacturer) {
    query = query.eq("manufacturer", params.manufacturer) as T;
  }
  if (params.class) {
    query = query.eq("class", params.class) as T;
  }
  if (params.source_game) {
    query = query.eq("source_game", params.source_game) as T;
  }
  if (params.q) {
    const safe = params.q.replace(/"/g, "");
    query = query.or(
      `manufacturer.ilike."%${safe}%",model.ilike."%${safe}%"`
    ) as T;
  }
  return query;
}

// ---------------------------------------------------------------------------
// Data fetchers
// ---------------------------------------------------------------------------

/** Fetch distinct manufacturer names for the filter dropdown. */
async function getManufacturers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("car_models")
    .select("manufacturer")
    .not("manufacturer", "is", null)
    .order("manufacturer");
  return Array.from(new Set((data ?? []).map((r) => r.manufacturer as string)));
}

/** Fetch distinct source_game values for the filter dropdown. */
async function getSourceGames() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("car_models")
    .select("source_game")
    .order("source_game");
  return Array.from(new Set((data ?? []).map((r) => r.source_game as string)));
}

/**
 * Fetch all starting_price values for the current non-price filters.
 * Used to compute histogram buckets + overall min/max on the server.
 */
async function getPriceStats(params: Params) {
  const supabase = await createClient();
  let query = supabase
    .from("car_models_with_price")
    .select("starting_price")
    .not("starting_price", "is", null);

  query = applyBaseFilters(query, params);

  const { data } = await query;
  const prices = (data ?? [])
    .map((r) => r.starting_price as number)
    .filter((p) => p != null);

  if (prices.length === 0) {
    return { min: 0, max: 0, histogram: [] as { bucketMin: number; bucketMax: number; count: number }[] };
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  // Single value → one bin
  if (min === max) {
    return {
      min,
      max,
      histogram: [{ bucketMin: min, bucketMax: max, count: prices.length }],
    };
  }

  const binWidth = (max - min) / HISTOGRAM_BINS;
  const bins = Array.from({ length: HISTOGRAM_BINS }, (_, i) => ({
    bucketMin: Math.round(min + i * binWidth),
    bucketMax: Math.round(min + (i + 1) * binWidth),
    count: 0,
  }));

  for (const price of prices) {
    const idx = Math.min(
      Math.floor((price - min) / binWidth),
      HISTOGRAM_BINS - 1
    );
    bins[idx].count++;
  }

  return { min, max, histogram: bins };
}

/** Resolve best display URL: thumb (storage) > original (storage) > image_url (e.g. wiki). */
async function resolveCarDisplayImageUrl(car: {
  thumb_path?: string | null;
  image_path?: string | null;
  image_url?: string | null;
}): Promise<string | null> {
  if (car.thumb_path) {
    const url = await getImageUrl(car.thumb_path);
    if (url) return url;
  }
  if (car.image_path) {
    const url = await getImageUrl(car.image_path);
    if (url) return url;
  }
  return car.image_url ?? null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CarsPage({ searchParams }: Props) {
  const params = await searchParams;
  const parsed = parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  const offset = (currentPage - 1) * PAGE_SIZE;

  const supabase = await createClient();

  // Default availableNow to true if not explicitly set
  // This means first-time visitors see available cars by default
  const showAvailableOnly = params.availableNow !== "false" && params.availableNow !== "0";

  // --- Build the query against the price-enriched view ---
  // Sort by availability first (available cars on top), then by manufacturer/model
  let query = supabase
    .from("car_models_with_price")
    .select("*", { count: "exact" })
    .order("available_unit_count", { ascending: false, nullsFirst: false })
    .order("manufacturer")
    .order("model")
    .range(offset, offset + PAGE_SIZE - 1);

  // Non-price filters
  query = applyBaseFilters(query, params);

  // Price filters
  const priceMinVal = parseInt(params.priceMin ?? "", 10);
  const priceMaxVal = parseInt(params.priceMax ?? "", 10);
  if (Number.isFinite(priceMinVal)) {
    query = query.gte("starting_price", priceMinVal);
  }
  if (Number.isFinite(priceMaxVal)) {
    query = query.lte("starting_price", priceMaxVal);
  }

  // Available now filter (default ON)
  if (showAvailableOnly) {
    query = query.gt("available_unit_count", 0);
  }

  const [{ data: cars, count }, manufacturers, sourceGames, priceStats] =
    await Promise.all([
      query,
      getManufacturers(),
      getSourceGames(),
      getPriceStats(params),
    ]);

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  // Resolve display URLs (thumb or original from Storage, else wiki image_url)
  const carsWithUrls = await Promise.all(
    (cars ?? []).map(async (c) => ({
      ...c,
      displayImageUrl: await resolveCarDisplayImageUrl(c),
    }))
  );

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Browse Cars
        </h1>
        <p className="mt-1 text-gray-500">
          {count ?? 0} car{count !== 1 ? "s" : ""} in the catalog
        </p>
      </div>

      {/* Filters */}
      <Suspense>
        <CarFilters
          manufacturers={manufacturers}
          sourceGames={sourceGames}
          priceStats={priceStats}
        />
      </Suspense>

      {/* Grid */}
      {carsWithUrls.length > 0 ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {carsWithUrls.map((car, idx) => (
            <Link
              key={car.id}
              href={`/cars/${car.id}`}
              className="card group overflow-hidden transition-all hover:shadow-md hover:border-sky-light"
            >
              {/* Image */}
              <div className="relative aspect-[16/10] w-full bg-gray-100">
                {car.displayImageUrl ? (
                  <Image
                    src={car.displayImageUrl}
                    alt={`${car.manufacturer ?? ""} ${car.model ?? ""}`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    placeholder="blur"
                    blurDataURL={BLUR_PLACEHOLDER}
                    priority={idx < PRIORITY_COUNT}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-300">
                    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                    </svg>
                  </div>
                )}

                {/* Availability badge (top-right overlay) */}
                {car.available_unit_count > 0 && (
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full bg-accent-sand px-2 py-0.5 text-[11px] font-bold text-gray-900 shadow-sm">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-caramel animate-pulse" />
                    {car.available_unit_count} available
                  </div>
                )}

                {/* Compare toggle (bottom-left overlay) */}
                <div className="absolute bottom-2 left-2 z-10">
                  <CompareToggleButton
                    car={{
                      id: car.id,
                      display_name: car.display_name,
                      manufacturer: car.manufacturer,
                      model: car.model,
                      image_url: car.displayImageUrl ?? car.image_url ?? null,
                    }}
                    small
                  />
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  {car.manufacturer}
                </p>
                <p className="mt-0.5 font-semibold text-gray-900 line-clamp-1">
                  {car.model ?? car.display_name}
                </p>

                {car.starting_price != null && (
                  <PriceCompact
                    hourlyRate={car.starting_price}
                    marketHourlyRate={car.suggested_credits_per_hour}
                    isAvailable={(car.available_unit_count ?? 0) > 0}
                  />
                )}

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm text-gray-500">{car.year}</span>

                  {car.stat_pi != null && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: piClassColor(car.stat_pi) }}
                    >
                      {piClassName(car.stat_pi)}
                      <span className="font-normal opacity-80">
                        {car.stat_pi}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <p className="text-gray-500">No cars match your filters.</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-2 pb-20">
          <PaginationLink
            page={currentPage - 1}
            disabled={currentPage <= 1}
            searchParams={params}
            label="← Previous"
          />
          <span className="px-3 text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          <PaginationLink
            page={currentPage + 1}
            disabled={currentPage >= totalPages}
            searchParams={params}
            label="Next →"
          />
        </nav>
      )}

    </section>
  );
}

function PaginationLink({
  page,
  disabled,
  searchParams,
  label,
}: {
  page: number;
  disabled: boolean;
  searchParams: Record<string, string | undefined>;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-300">
        {label}
      </span>
    );
  }

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v && k !== "page") params.set(k, v);
  }
  params.set("page", String(page));

  return (
    <Link
      href={`/cars?${params.toString()}`}
      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
    >
      {label}
    </Link>
  );
}
