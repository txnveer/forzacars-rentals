import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getImageUrl } from "@/lib/supabase/getImageUrl";
import { piClassName, piClassColor } from "@/lib/piClass";
import ComparePageClient from "./ComparePageClient";

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

const BLUR_PLACEHOLDER =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPkQ1sDSgAAAABJRU5ErkJggg==";

const STAT_KEYS = [
  { key: "stat_pi", label: "Performance Index", scale: 1, unit: "", max: 999 },
  { key: "stat_speed", label: "Speed", scale: 10, unit: "/10", max: 100 },
  { key: "stat_handling", label: "Handling", scale: 10, unit: "/10", max: 100 },
  { key: "stat_acceleration", label: "Acceleration", scale: 10, unit: "/10", max: 100 },
  { key: "stat_launch", label: "Launch", scale: 10, unit: "/10", max: 100 },
  { key: "stat_braking", label: "Braking", scale: 10, unit: "/10", max: 100 },
] as const;

interface Props {
  searchParams: Promise<{ ids?: string; compare?: string }>;
}

export default async function ComparePage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = sp.ids || sp.compare || "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2);

  // If not enough IDs, render client component to check store or show message
  if (ids.length < 2) {
    return <ComparePageClient urlIds={ids} />;
  }

  const supabase = await createClient();

  // Fetch both car models + starting price from the view
  const { data: cars } = await supabase
    .from("car_models_with_price")
    .select("*")
    .in("id", ids);

  if (!cars || cars.length < 2) {
    return <ComparePageClient urlIds={ids} />;
  }

  // Ensure consistent order matching the URL
  const ordered = ids
    .map((id) => cars.find((c) => c.id === id))
    .filter(Boolean) as typeof cars;

  if (ordered.length < 2) {
    return <ComparePageClient urlIds={ids} />;
  }

  const [a, b] = ordered;

  const [displayUrlA, displayUrlB] = await Promise.all([
    resolveCarDisplayImageUrl(a),
    resolveCarDisplayImageUrl(b),
  ]);

  return (
    <section className="mx-auto max-w-5xl px-6 py-10">
      {/* Back link */}
      <Link
        href="/cars"
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-900"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Cars
      </Link>

      <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
        Compare Cars
      </h1>

      {/* ── Side-by-side cards ── */}
      <div className="mt-8 grid grid-cols-2 gap-6">
        {/* Car images */}
        {([a, b] as const).map((car, i) => {
          const displayUrl = i === 0 ? displayUrlA : displayUrlB;
          return (
          <div key={car.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="relative aspect-[16/10] w-full bg-gray-100">
              {displayUrl ? (
                <Image
                  src={displayUrl}
                  alt={car.display_name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority
                  placeholder="blur"
                  blurDataURL={BLUR_PLACEHOLDER}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-300">
                  <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                {car.manufacturer}
              </p>
              <p className="mt-0.5 text-lg font-bold text-gray-900">
                {car.model ?? car.display_name}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {car.year && (
                  <span className="text-sm text-gray-500">{car.year}</span>
                )}
                {car.stat_pi != null && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white"
                    style={{ backgroundColor: piClassColor(car.stat_pi) }}
                  >
                    {piClassName(car.stat_pi)}
                    <span className="font-normal opacity-80">{car.stat_pi}</span>
                  </span>
                )}
              </div>

              {/* Pricing */}
              <div className="mt-4 flex items-baseline gap-2">
                {car.starting_price != null && (
                  <span className="text-lg font-bold text-emerald-700">
                    {car.starting_price} cr/hr
                  </span>
                )}
                {car.suggested_credits_per_hour != null &&
                  car.starting_price !== car.suggested_credits_per_hour && (
                    <span className="text-xs text-gray-400">
                      (suggested: {car.suggested_credits_per_hour})
                    </span>
                  )}
              </div>

              {/* CTA */}
              <Link
                href={`/cars/${car.id}`}
                className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
              >
                View &amp; Book
              </Link>
            </div>
          </div>
          );
        })}
      </div>

      {/* ── Stat comparison table ── */}
      <div className="mt-10 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Stat
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                {a.model ?? a.display_name}
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
                {b.model ?? b.display_name}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {STAT_KEYS.map(({ key, label, scale, unit, max }) => {
              const valA = a[key] as number | null;
              const valB = b[key] as number | null;

              // Display value (PI is raw; stats are stored ×10)
              const displayA =
                valA != null ? (scale === 1 ? valA : (valA / scale).toFixed(1)) : "—";
              const displayB =
                valB != null ? (scale === 1 ? valB : (valB / scale).toFixed(1)) : "—";

              // Higher is better for all these stats
              const aWins = valA != null && valB != null && valA > valB;
              const bWins = valA != null && valB != null && valB > valA;

              // Bar widths (% of max value)
              const barA = valA != null ? (valA / max) * 100 : 0;
              const barB = valB != null ? (valB / max) * 100 : 0;

              return (
                <tr key={key}>
                  <td className="px-6 py-3 font-medium text-gray-700">
                    {label}
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={`text-sm font-semibold ${
                          aWins ? "text-emerald-700" : "text-gray-900"
                        }`}
                      >
                        {displayA}
                        {unit && <span className="text-xs font-normal text-gray-400">{unit}</span>}
                        {aWins && (
                          <svg className="ml-1 inline h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                      </span>
                      <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full transition-all ${aWins ? "bg-emerald-500" : "bg-gray-400"}`}
                          style={{ width: `${Math.min(barA, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={`text-sm font-semibold ${
                          bWins ? "text-emerald-700" : "text-gray-900"
                        }`}
                      >
                        {displayB}
                        {unit && <span className="text-xs font-normal text-gray-400">{unit}</span>}
                        {bWins && (
                          <svg className="ml-1 inline h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                          </svg>
                        )}
                      </span>
                      <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full transition-all ${bWins ? "bg-emerald-500" : "bg-gray-400"}`}
                          style={{ width: `${Math.min(barB, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Price row */}
            <tr>
              <td className="px-6 py-3 font-medium text-gray-700">
                Starting Price
              </td>
              {[a, b].map((car, i) => {
                const otherCar = i === 0 ? b : a;
                const price = car.starting_price ?? car.suggested_credits_per_hour;
                const otherPrice = otherCar.starting_price ?? otherCar.suggested_credits_per_hour;
                // Lower price is better
                const wins =
                  price != null && otherPrice != null && price < otherPrice;
                return (
                  <td key={car.id} className="px-6 py-3 text-center">
                    <span
                      className={`text-sm font-semibold ${
                        wins ? "text-emerald-700" : "text-gray-900"
                      }`}
                    >
                      {price != null ? `${price} cr/hr` : "—"}
                      {wins && (
                        <svg className="ml-1 inline h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Bottom CTAs */}
      <div className="mt-8 grid grid-cols-2 gap-6">
        {[a, b].map((car) => (
          <Link
            key={car.id}
            href={`/cars/${car.id}`}
            className="flex items-center justify-center rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            View {car.model ?? car.display_name} &rarr;
          </Link>
        ))}
      </div>
    </section>
  );
}
