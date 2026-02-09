import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { piClassName, piClassColor } from "@/lib/piClass";
import ColorFilter from "./ColorFilter";
import ScheduleCalendar from "./ScheduleCalendar";

const BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPkQ1sDSgAAAABJRU5ErkJggg==";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ color?: string }>;
}

const STAT_LABELS: { key: string; label: string }[] = [
  { key: "stat_speed", label: "Speed" },
  { key: "stat_handling", label: "Handling" },
  { key: "stat_acceleration", label: "Acceleration" },
  { key: "stat_launch", label: "Launch" },
  { key: "stat_braking", label: "Braking" },
];

export default async function CarModelDetailPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const colorFilter = sp.color?.trim() || null;

  const supabase = await createClient();
  const { data: car } = await supabase
    .from("car_models")
    .select("*")
    .eq("id", id)
    .single();

  if (!car) notFound();

  // Fetch ALL active car_units for this model (for color list + total count)
  const { data: allUnits } = await supabase
    .from("car_units")
    .select(
      "id, display_name, color, color_hex, credits_per_hour, business_id, image_path, thumb_path, businesses ( name )"
    )
    .eq("car_model_id", id)
    .eq("active", true);

  // Collect distinct colors across all businesses
  const colors = Array.from(
    new Set(
      (allUnits ?? []).map((u) => u.color).filter(Boolean) as string[]
    )
  ).sort();

  // Apply color filter for display
  const filteredUnits = colorFilter
    ? (allUnits ?? []).filter(
        (u) => u.color?.toLowerCase() === colorFilter.toLowerCase()
      )
    : (allUnits ?? []);

  // ---- Availability check ----
  // For each filtered unit, check for overlapping CONFIRMED bookings and
  // overlapping blackout windows within the next 24 hours as a simple
  // "available now" heuristic.
  const now = new Date().toISOString();
  const next24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const unitIds = filteredUnits.map((u) => u.id);

  // Fetch bookings overlapping the next-24h window for these units
  let busyUnitIds = new Set<string>();

  if (unitIds.length > 0) {
    const { data: overlappingBookings } = await supabase
      .from("bookings")
      .select("car_unit_id")
      .in("car_unit_id", unitIds)
      .eq("status", "CONFIRMED")
      .lt("start_ts", next24h)
      .gt("end_ts", now);

    const bookedIds = new Set(
      (overlappingBookings ?? []).map((b) => b.car_unit_id)
    );

    // Fetch blackouts overlapping the next-24h window
    const { data: overlappingBlackouts } = await supabase
      .from("car_blackouts")
      .select("car_unit_id")
      .in("car_unit_id", unitIds)
      .lt("start_ts", next24h)
      .gt("end_ts", now);

    const blackedOutIds = new Set(
      (overlappingBlackouts ?? []).map((b) => b.car_unit_id)
    );

    busyUnitIds = new Set(
      Array.from(bookedIds).concat(Array.from(blackedOutIds))
    );
  }

  const availableUnits = filteredUnits.filter(
    (u) => !busyUnitIds.has(u.id)
  );

  const displayName =
    car.display_name ||
    [car.manufacturer, car.model].filter(Boolean).join(" ");

  const suggestedCph = car.suggested_credits_per_hour;

  return (
    <section className="mx-auto max-w-5xl px-6 py-10">
      {/* Back link */}
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

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        {/* ---- Image ---- */}
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-gray-100">
          {car.image_url ? (
            <Image
              src={car.image_url}
              alt={displayName}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              priority
              placeholder="blur"
              blurDataURL={BLUR_PLACEHOLDER}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-300">
              <svg
                className="h-20 w-20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* ---- Details ---- */}
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-gray-400">
            {car.manufacturer}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900">
            {car.model ?? car.display_name}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {car.year && (
              <span className="text-sm text-gray-500">{car.year}</span>
            )}
            {car.stat_pi != null && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white"
                style={{ backgroundColor: piClassColor(car.stat_pi) }}
              >
                {piClassName(car.stat_pi)}
                <span className="font-normal opacity-80">{car.stat_pi}</span>
              </span>
            )}
            {car.source_game && (
              <span className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-500">
                {car.source_game}
              </span>
            )}
          </div>

          {/* Suggested pricing */}
          {suggestedCph != null && (
            <div className="mt-5 flex items-baseline gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <span className="text-2xl font-bold text-emerald-700">
                {suggestedCph}
              </span>
              <span className="text-sm text-emerald-600">credits / hour</span>
              <span className="ml-auto text-xs text-emerald-500">
                suggested
              </span>
            </div>
          )}

          {/* Stats */}
          <div className="mt-8 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Performance
            </h2>
            {STAT_LABELS.map(({ key, label }) => {
              const raw = car[key] as number | null;
              if (raw == null) return null;
              const pct = raw;
              const display = (raw / 10).toFixed(1);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{label}</span>
                    <span className="font-medium text-gray-900">
                      {display}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-gray-800 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ---- Schedule Calendar ---- */}
          <div className="mt-10">
            <ScheduleCalendar
              modelId={id}
              suggestedCph={suggestedCph}
              colorFilter={colorFilter ?? undefined}
            />
          </div>

          {/* ---- Available Units ---- */}
          <div className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              Available Units
            </h2>

            {/* Color filter */}
            <ColorFilter colors={colors} />

            {/* Availability summary */}
            <p className="mt-3 text-sm text-gray-600">
              <span className="font-semibold text-gray-900">
                {availableUnits.length}
              </span>{" "}
              unit{availableUnits.length !== 1 ? "s" : ""} available
              {colorFilter ? ` in ${colorFilter}` : ""} for the next 24 h
              {suggestedCph && (
                <span className="text-gray-400">
                  {" "}
                  · from {suggestedCph} cr/hr
                </span>
              )}
            </p>

            {filteredUnits.length > 0 ? (
              <ul className="mt-4 divide-y divide-gray-200">
                {filteredUnits.map((u) => {
                  const bizName =
                    (
                      u.businesses as unknown as { name: string } | null
                    )?.name ?? "—";
                  const unitLabel = u.display_name ?? displayName;
                  const cph = u.credits_per_hour ?? suggestedCph;
                  const isAvailable = !busyUnitIds.has(u.id);
                  const unitThumb = u.thumb_path
                    ? `/api/storage/car-images/${u.thumb_path}`
                    : null;

                  return (
                    <li
                      key={u.id}
                      className={`flex items-center justify-between py-3 text-sm ${
                        isAvailable ? "" : "opacity-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Unit thumbnail or color swatch */}
                        {unitThumb ? (
                          <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-gray-100">
                            <Image
                              src={unitThumb}
                              alt={unitLabel}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          </div>
                        ) : u.color_hex ? (
                          <span
                            className="inline-block h-4 w-4 flex-shrink-0 rounded-full border border-gray-300"
                            style={{ backgroundColor: u.color_hex }}
                          />
                        ) : null}
                        <div>
                          <span className="font-medium text-gray-900">
                            {unitLabel}
                          </span>
                          {u.color && (
                            <span className="ml-2 text-gray-400">{u.color}</span>
                          )}
                          <p className="text-xs text-gray-400">
                            {bizName}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-600">
                          {cph ? `${cph} cr/hr` : "—"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            isAvailable
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-200 text-gray-500"
                          }`}
                        >
                          {isAvailable ? "Available" : "Busy"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-gray-400">
                {colorFilter
                  ? `No units in "${colorFilter}" for this model.`
                  : "No fleet has this car available yet."}
              </p>
            )}
          </div>

          {/* Source link */}
          {car.wiki_page_url && (
            <p className="mt-6 text-xs text-gray-400">
              Data sourced from{" "}
              <a
                href={car.wiki_page_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-600"
              >
                Forza Wiki
              </a>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
