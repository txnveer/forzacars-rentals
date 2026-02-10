import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import CancelBookingButton from "./CancelBookingButton";
import {
  formatUtcForDisplay,
  calculateDurationFromUtc,
  formatDurationShort,
  TIMEZONE_LABEL,
} from "@/lib/timezone";

export default async function BookingsPage() {
  const profile = await getProfile();
  const supabase = await createClient();

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      `*, car_unit:car_units( display_name, vin, car_models ( display_name ) )`
    )
    .order("start_ts", { ascending: false });

  const now = new Date();

  const upcoming =
    bookings?.filter(
      (b) => b.status === "CONFIRMED" && new Date(b.end_ts) > now
    ) ?? [];

  const past =
    bookings?.filter(
      (b) => b.status !== "CONFIRMED" || new Date(b.end_ts) <= now
    ) ?? [];

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            My Bookings
          </h1>
          <p className="mt-1 text-gray-500">
            {bookings?.length ?? 0} total booking
            {bookings?.length !== 1 ? "s" : ""}
            <span className="ml-2 text-xs text-gray-400">
              · Times shown in {TIMEZONE_LABEL}
            </span>
          </p>
        </div>
        <Link
          href="/cars"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
        >
          Browse Cars
        </Link>
      </div>

      {/* ---- Upcoming / Active ---- */}
      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Upcoming &amp; Active
        </h2>

        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">
            No upcoming bookings.{" "}
            <Link href="/cars" className="underline hover:text-gray-600">
              Browse cars
            </Link>{" "}
            to book one.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {upcoming.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                showCancel
                userEmail={profile?.email ?? ""}
              />
            ))}
          </ul>
        )}
      </div>

      {/* ---- Past / Canceled ---- */}
      <div className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Past &amp; Canceled
        </h2>

        {past.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No past bookings yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {past.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
 * BookingCard (server component part)
 * ----------------------------------------------------------------*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BookingCard({
  booking: b,
  showCancel,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  booking: any;
  showCancel?: boolean;
  userEmail?: string;
}) {
  const isCanceled = b.status === "CANCELED";

  // Resolve unit name from the joined car_unit → car_models chain
  const unitData = b.car_unit as {
    display_name: string | null;
    vin: string;
    car_models: { display_name: string } | null;
  } | null;
  const carName =
    unitData?.display_name ??
    unitData?.car_models?.display_name ??
    unitData?.vin ??
    `Unit ${b.car_unit_id?.slice(0, 8) ?? "unknown"}`;

  // Format dates in business timezone (Central Time)
  const startDisplay = formatUtcForDisplay(b.start_ts, "EEE, MMM d 'at' h:mm a");
  const endDisplay = formatUtcForDisplay(b.end_ts, "EEE, MMM d 'at' h:mm a");
  
  // Check if it's a multi-day booking
  const startDate = formatUtcForDisplay(b.start_ts, "yyyy-MM-dd");
  const endDate = formatUtcForDisplay(b.end_ts, "yyyy-MM-dd");
  const isMultiDay = startDate !== endDate;
  
  // Calculate duration
  const duration = calculateDurationFromUtc(b.start_ts, b.end_ts);
  const durationStr = formatDurationShort(duration);

  return (
    <li
      className={`rounded-xl border bg-white p-5 shadow-sm ${
        isCanceled
          ? "border-gray-200 opacity-60"
          : "border-gray-200"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: info */}
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{carName}</p>
          
          {/* Show full date range for multi-day, compact for same-day */}
          {isMultiDay ? (
            <div className="mt-1 text-sm text-gray-500">
              <p>{startDisplay}</p>
              <p>→ {endDisplay}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Duration: {durationStr}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-500">
              {startDisplay} – {formatUtcForDisplay(b.end_ts, "h:mm a")}
              <span className="ml-2 text-xs text-gray-400">({durationStr})</span>
            </p>
          )}
          
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-700">
              {b.credits_charged} credit{b.credits_charged !== 1 ? "s" : ""}
            </span>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                isCanceled
                  ? "bg-red-50 text-red-600"
                  : "bg-green-50 text-green-700"
              }`}
            >
              {b.status}
            </span>
            {isMultiDay && (
              <span className="inline-block rounded-full bg-sky-light px-2 py-0.5 text-xs font-medium text-primary">
                Multi-day
              </span>
            )}
          </div>

          {/* Pricing breakdown (only for bookings created after migration) */}
          {b.pricing_mode && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>
                Rate: {b.hourly_rate_used} cr/hr
              </span>
              {b.pricing_mode !== "HOURLY" && (
                <>
                  <span>Day cap: yes ({b.day_price_used} cr)</span>
                  {b.billable_days != null && (
                    <span>Billable days: {b.billable_days}</span>
                  )}
                </>
              )}
              {b.pricing_mode === "HOURLY" && (
                <span>Day cap: no</span>
              )}
              <span className="font-medium text-gray-600">
                Total: {b.credits_charged} cr
              </span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {b.pricing_mode.replace("_", " ")}
              </span>
            </div>
          )}
        </div>

        {/* Right: action */}
        {showCancel && !isCanceled && (
          <CancelBookingButton bookingId={b.id} />
        )}
      </div>
    </li>
  );
}
