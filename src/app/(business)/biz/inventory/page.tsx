import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import InventoryRow from "./InventoryRow";

export const metadata = { title: "Inventory — ForzaCars" };

export default async function InventoryPage() {
  const profile = await getProfile();

  if (!profile?.business_id) {
    return (
      <section className="mx-auto max-w-3xl px-6 py-10 text-center">
        <h1 className="text-xl font-bold text-gray-900">No Business Linked</h1>
        <p className="mt-2 text-sm text-gray-500">
          Your account is not associated with a business. Contact an admin.
        </p>
      </section>
    );
  }

  const supabase = await createClient();

  // Fetch car_units scoped by RLS (business only sees own units)
  // Join car_models for display_name and suggested_credits_per_hour
  const { data: units } = await supabase
    .from("car_units")
    .select(
      "id, display_name, color, color_hex, vin, license_plate, credits_per_hour, active, created_at, car_models ( display_name, suggested_credits_per_hour )"
    )
    .order("created_at", { ascending: false });

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {(units ?? []).length} unit{(units ?? []).length !== 1 ? "s" : ""} in
            your fleet
          </p>
        </div>

        <Link
          href="/biz/inventory/new"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700"
        >
          + Bulk Add Units
        </Link>
      </div>

      {/* Table */}
      <div className="mt-8 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-gray-500">
                Model
              </th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">
                Color
              </th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">
                VIN
              </th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">
                Plate
              </th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">
                Price (cr/hr)
              </th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">
                Status
              </th>
              <th className="px-5 py-3 text-left font-medium text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {units && units.length > 0 ? (
              units.map((unit) => {
                const modelData = unit.car_models as unknown as {
                  display_name: string;
                  suggested_credits_per_hour: number | null;
                } | null;
                const modelName = modelData?.display_name ?? "—";
                const suggestedPrice = modelData?.suggested_credits_per_hour;
                const effectivePrice = unit.credits_per_hour ?? suggestedPrice;

                return (
                  <InventoryRow
                    key={unit.id}
                    unit={{
                      id: unit.id,
                      display_name: unit.display_name,
                      color: unit.color,
                      color_hex: unit.color_hex,
                      vin: unit.vin,
                      license_plate: unit.license_plate,
                      credits_per_hour: unit.credits_per_hour,
                      active: unit.active,
                    }}
                    modelName={modelName}
                    effectivePrice={effectivePrice}
                    isOverride={unit.credits_per_hour != null}
                  />
                );
              })
            ) : (
              <tr>
                <td
                  className="px-5 py-10 text-center text-gray-400"
                  colSpan={7}
                >
                  No units yet.{" "}
                  <Link
                    href="/biz/inventory/new"
                    className="text-gray-600 underline hover:text-gray-900"
                  >
                    Add your first batch
                  </Link>
                  .
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
