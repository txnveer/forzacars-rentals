import { createClient } from "@/lib/supabase/server";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function BusinessBookingsPage() {
  const supabase = await createClient();

  // Fetch bookings for car_units owned by this business.
  // RLS ensures only bookings for the business's own units are returned.
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      `
      id,
      start_ts,
      end_ts,
      status,
      credits_charged,
      pricing_mode,
      hourly_rate_used,
      day_price_used,
      billable_days,
      duration_minutes,
      created_at,
      car_units ( id, display_name, vin, car_models ( display_name ) ),
      profiles!bookings_customer_id_fkey ( email )
    `
    )
    .order("start_ts", { ascending: false });

  const now = new Date();

  const upcoming = (bookings ?? []).filter(
    (b) => new Date(b.start_ts) >= now && b.status === "CONFIRMED"
  );
  const past = (bookings ?? []).filter(
    (b) => new Date(b.start_ts) < now || b.status === "CANCELED"
  );

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Bookings
        </h1>
        <p className="mt-1 text-gray-500">
          All reservations for your fleet&apos;s car units.
        </p>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600">
          Failed to load bookings: {error.message}
        </p>
      )}

      {/* Upcoming */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900">
          Upcoming &amp; Active
          <span className="ml-2 text-sm font-normal text-gray-400">
            ({upcoming.length})
          </span>
        </h2>

        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No upcoming bookings.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Unit</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Customer</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">From</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">To</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Credits</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {upcoming.map((b) => (
                  <BookingRow key={b.id} booking={b} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Past / Canceled */}
      <div className="mt-10">
        <h2 className="text-lg font-semibold text-gray-900">
          Past &amp; Canceled
          <span className="ml-2 text-sm font-normal text-gray-400">({past.length})</span>
        </h2>

        {past.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No past bookings.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Unit</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Customer</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">From</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">To</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Credits</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {past.map((b) => (
                  <BookingRow key={b.id} booking={b} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BookingRow({ booking }: { booking: any }) {
  const unitData = booking.car_units as {
    display_name: string | null;
    vin: string;
    car_models: { display_name: string } | null;
  } | null;
  const unitName =
    unitData?.display_name ?? unitData?.car_models?.display_name ?? unitData?.vin ?? "Unknown";
  const customerEmail =
    (booking.profiles as { email: string } | null)?.email ?? "—";
  const isCanceled = booking.status === "CANCELED";

  return (
    <tr className={isCanceled ? "text-gray-400" : ""}>
      <td className="px-6 py-4 font-medium text-gray-900">{unitName}</td>
      <td className="px-6 py-4 text-gray-600">{customerEmail}</td>
      <td className="px-6 py-4">{fmt(booking.start_ts)}</td>
      <td className="px-6 py-4">{fmt(booking.end_ts)}</td>
      <td className="px-6 py-4">
        <div>{booking.credits_charged}</div>
        {booking.pricing_mode && (
          <div className="mt-0.5 text-[10px] text-gray-400">
            {booking.hourly_rate_used} cr/hr
            {booking.pricing_mode !== "HOURLY" && ` · ${booking.billable_days}d`}
            {" · "}
            <span className="uppercase">{booking.pricing_mode.replace("_", " ")}</span>
          </div>
        )}
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            isCanceled
              ? "bg-gray-100 text-gray-500"
              : "bg-green-50 text-green-700"
          }`}
        >
          {booking.status}
        </span>
      </td>
    </tr>
  );
}
