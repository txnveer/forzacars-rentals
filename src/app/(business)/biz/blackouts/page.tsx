import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import AddBlackoutForm from "./AddBlackoutForm";
import BlackoutRow from "./BlackoutRow";

export default async function BusinessBlackoutsPage() {
  const profile = await getProfile();
  const hasBusinessId = !!profile?.business_id;

  const supabase = await createClient();

  // Fetch the business's car_units (for the dropdown) — RLS scoped
  const { data: units } = await supabase
    .from("car_units")
    .select("id, display_name, vin, car_models ( display_name )")
    .order("display_name");

  const unitOptions = (units ?? []).map((u) => ({
    id: u.id,
    label:
      u.display_name ??
      (u.car_models as unknown as { display_name: string } | null)?.display_name ??
      u.vin,
  }));

  // Fetch blackouts for business car_units — RLS scoped
  const { data: blackouts } = await supabase
    .from("car_blackouts")
    .select("id, car_unit_id, start_ts, end_ts, reason, car_units ( display_name, vin, car_models ( display_name ) )")
    .order("start_ts", { ascending: false });

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Blackout Windows
        </h1>
        <p className="mt-1 text-gray-500">
          Block time ranges when car units are unavailable (maintenance, events,
          etc.).
        </p>
      </div>

      {!hasBusinessId && (
        <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
          Your account is not linked to a business yet.
        </div>
      )}

      {hasBusinessId && (
        <>
          {/* Create form */}
          <div className="mt-8">
            <AddBlackoutForm units={unitOptions} />
          </div>

          {/* Blackout list */}
          <div className="mt-8 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Unit</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Start</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">End</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Reason</th>
                  <th className="px-6 py-3 text-left font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {blackouts && blackouts.length > 0 ? (
                  blackouts.map((b) => {
                    const unitData = b.car_units as unknown as {
                      display_name: string | null;
                      vin: string;
                      car_models: { display_name: string } | null;
                    } | null;
                    const unitLabel =
                      unitData?.display_name ??
                      unitData?.car_models?.display_name ??
                      unitData?.vin ??
                      "—";
                    return (
                      <BlackoutRow
                        key={b.id}
                        blackout={{
                          id: b.id,
                          start_ts: b.start_ts,
                          end_ts: b.end_ts,
                          reason: b.reason,
                          unit_label: unitLabel,
                        }}
                      />
                    );
                  })
                ) : (
                  <tr>
                    <td className="px-6 py-10 text-center text-gray-400" colSpan={5}>
                      No blackout windows yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
