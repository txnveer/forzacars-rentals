import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { piClassName, piClassColor, piClassRange, type PiClassName, PI_CLASSES } from "@/lib/piClass";
import CarFilters from "@/components/CarFilters";

const PAGE_SIZE = 24;

interface Props {
  searchParams: Promise<{
    manufacturer?: string;
    class?: string;
    source_game?: string;
    q?: string;
    page?: string;
  }>;
}

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

export default async function CarsPage({ searchParams }: Props) {
  const params = await searchParams;
  const parsed = parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  const offset = (currentPage - 1) * PAGE_SIZE;

  const supabase = await createClient();

  // --- Build the query ---
  let query = supabase
    .from("car_models")
    .select("*", { count: "exact" })
    .order("manufacturer")
    .order("model")
    .range(offset, offset + PAGE_SIZE - 1);

  if (params.manufacturer) {
    query = query.eq("manufacturer", params.manufacturer);
  }

  if (params.class) {
    const [min, max] = piClassRange(params.class as PiClassName);
    query = query.gte("stat_pi", min).lte("stat_pi", max);
  }

  if (params.source_game) {
    query = query.eq("source_game", params.source_game);
  }

  if (params.q) {
    // Wrap search value in double-quotes so PostgREST treats commas,
    // periods, and parentheses as literal characters — prevents filter
    // injection via crafted query strings.
    const safe = params.q.replace(/"/g, "");
    query = query.or(
      `manufacturer.ilike."%${safe}%",model.ilike."%${safe}%"`
    );
  }

  const [{ data: cars, count }, manufacturers, sourceGames] = await Promise.all(
    [query, getManufacturers(), getSourceGames()]
  );

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

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
        <CarFilters manufacturers={manufacturers} sourceGames={sourceGames} />
      </Suspense>

      {/* Grid */}
      {cars && cars.length > 0 ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cars.map((car) => (
            <Link
              key={car.id}
              href={`/cars/${car.id}`}
              className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              {/* Image */}
              <div className="relative aspect-[16/10] w-full bg-gray-100">
                {car.image_url ? (
                  <Image
                    src={car.image_url}
                    alt={`${car.manufacturer ?? ""} ${car.model ?? ""}`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-300">
                    <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  {car.manufacturer}
                </p>
                <p className="mt-0.5 font-semibold text-gray-900 line-clamp-1">
                  {car.model ?? car.display_name}
                </p>

                {car.suggested_credits_per_hour != null && (
                  <p className="mt-2 text-sm font-semibold text-emerald-700">
                    {car.suggested_credits_per_hour} cr/hr
                  </p>
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
        <nav className="mt-10 flex items-center justify-center gap-2">
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
