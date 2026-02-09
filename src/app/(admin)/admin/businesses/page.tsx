import { createClient } from "@/lib/supabase/server";
import AddBusinessForm from "./AddBusinessForm";
import BusinessRow from "./BusinessRow";

export default async function AdminBusinessesPage() {
  const supabase = await createClient();

  // RLS: admin can read all businesses
  const { data: businesses } = await supabase
    .from("businesses")
    .select("*")
    .order("name");

  // Aggregate car_unit + user counts per business
  const { data: carCounts } = await supabase
    .from("car_units")
    .select("business_id");

  const { data: userCounts } = await supabase
    .from("profiles")
    .select("business_id")
    .not("business_id", "is", null);

  // Build lookup maps
  const carCountMap = new Map<string, number>();
  for (const row of carCounts ?? []) {
    const bid = row.business_id as string;
    carCountMap.set(bid, (carCountMap.get(bid) ?? 0) + 1);
  }

  const userCountMap = new Map<string, number>();
  for (const row of userCounts ?? []) {
    const bid = row.business_id as string;
    userCountMap.set(bid, (userCountMap.get(bid) ?? 0) + 1);
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Businesses
          </h1>
          <p className="mt-1 text-gray-500">
            {(businesses ?? []).length} registered business
            {(businesses ?? []).length !== 1 ? "es" : ""}
          </p>
        </div>

        <AddBusinessForm />
      </div>

      <div className="mt-8 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-gray-500">
                Name
              </th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">
                Slug
              </th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">
                Cars
              </th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">
                Users
              </th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">
                Created
              </th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {businesses && businesses.length > 0 ? (
              businesses.map((biz) => (
                <BusinessRow
                  key={biz.id}
                  business={biz}
                  carCount={carCountMap.get(biz.id) ?? 0}
                  userCount={userCountMap.get(biz.id) ?? 0}
                />
              ))
            ) : (
              <tr>
                <td
                  className="px-6 py-10 text-center text-gray-400"
                  colSpan={6}
                >
                  No businesses yet. Click &quot;+ New Business&quot; to create
                  one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
