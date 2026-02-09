import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import Link from "next/link";
import BulkAddForm from "./BulkAddForm";

export const metadata = { title: "Add Inventory Units — ForzaCars" };

export default async function NewInventoryPage() {
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

  // Fetch car_models for the model selector
  const supabase = await createClient();
  const { data: models } = await supabase
    .from("car_models")
    .select("id, display_name, manufacturer, model, year, image_url, stat_pi, suggested_credits_per_hour")
    .order("manufacturer")
    .order("model");

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Add Inventory Units
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Create multiple car units for a model in one go.
          </p>
        </div>
        <Link
          href="/biz/inventory"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Back to Inventory
        </Link>
      </div>

      <BulkAddForm models={models ?? []} />
    </section>
  );
}
