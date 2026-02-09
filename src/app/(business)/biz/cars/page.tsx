import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import AddCarForm from "./AddCarForm";
import CarRow from "./CarRow";

export default async function BusinessCarsPage() {
  const profile = await getProfile();
  const hasBusinessId = !!profile?.business_id;

  const supabase = await createClient();

  // Fetch car_units scoped by RLS — business users only see their own
  const { data: units } = await supabase
    .from("car_units")
    .select("*, car_models ( display_name )")
    .order("created_at", { ascending: false });

  // Fetch all car_models for the add-unit dropdown (include suggested price)
  const { data: models } = await supabase
    .from("car_models")
    .select("id, display_name, suggested_credits_per_hour")
    .order("display_name");

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Fleet Inventory
          </h1>
          <p className="mt-1 text-gray-500">
            Manage car units in your fleet. Each unit is a physical rentable
            instance of a car model.
          </p>
        </div>

        {hasBusinessId && (
          <AddCarForm models={(models ?? []).map((m) => ({ id: m.id, display_name: m.display_name, suggested_credits_per_hour: m.suggested_credits_per_hour }))} />
        )}
      </div>

      {!hasBusinessId && (
        <div className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
          Your account is not linked to a business yet. Contact an administrator
          to associate your profile with a business.
        </div>
      )}

      {/* Unit table */}
      {hasBusinessId && (
        <div className="mt-8 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Unit Name</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Model</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Color</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">VIN</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Plate</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 text-left font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {units && units.length > 0 ? (
                units.map((unit) => <CarRow key={unit.id} unit={unit} />)
              ) : (
                <tr>
                  <td className="px-6 py-10 text-center text-gray-400" colSpan={7}>
                    No units yet. Click &quot;+ Add Unit&quot; to add a car to your fleet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
