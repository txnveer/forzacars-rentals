import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import FleetRow from "./FleetRow";

export const metadata = {
  title: "Fleet Management | ForzaCars Rentals",
};

interface FleetUnit {
  id: string;
  color: string | null;
  color_hex: string | null;
  credits_per_hour: number | null;
  image_path: string | null;
  thumb_path: string | null;
}

interface FleetModel {
  car_model_id: string;
  display_name: string;
  manufacturer: string | null;
  model: string | null;
  image_url: string | null;
  suggested_credits_per_hour: number | null;
  stat_pi: number | null;
  class: string | null;
  quantity: number;
  effective_price: number | null;
  colors: string[];
  units: FleetUnit[];
}

export default async function FleetPage() {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  if (profile.role !== "BUSINESS") {
    redirect("/");
  }

  const supabase = await createClient();

  // Fetch all active car_units for this business, grouped by car_model_id
  const { data: units } = await supabase
    .from("car_units")
    .select(`
      id,
      car_model_id,
      color,
      color_hex,
      credits_per_hour,
      image_path,
      thumb_path,
      active,
      car_models (
        id,
        display_name,
        manufacturer,
        model,
        image_url,
        suggested_credits_per_hour,
        stat_pi,
        class
      )
    `)
    .eq("business_id", profile.business_id)
    .eq("active", true);

  // Group by car_model_id
  const modelMap = new Map<string, FleetModel>();

  for (const unit of units ?? []) {
    const model = unit.car_models as unknown as {
      id: string;
      display_name: string;
      manufacturer: string | null;
      model: string | null;
      image_url: string | null;
      suggested_credits_per_hour: number | null;
      stat_pi: number | null;
      class: string | null;
    };

    if (!model) continue;

    const fleetUnit: FleetUnit = {
      id: unit.id,
      color: unit.color,
      color_hex: unit.color_hex,
      credits_per_hour: unit.credits_per_hour,
      image_path: unit.image_path,
      thumb_path: unit.thumb_path,
    };

    const existing = modelMap.get(model.id);
    if (existing) {
      existing.quantity += 1;
      existing.units.push(fleetUnit);
      if (unit.color && !existing.colors.includes(unit.color)) {
        existing.colors.push(unit.color);
      }
      // Use first unit's price override if set
      if (existing.effective_price === null && unit.credits_per_hour) {
        existing.effective_price = unit.credits_per_hour;
      }
    } else {
      modelMap.set(model.id, {
        car_model_id: model.id,
        display_name: model.display_name,
        manufacturer: model.manufacturer,
        model: model.model,
        image_url: model.image_url,
        suggested_credits_per_hour: model.suggested_credits_per_hour,
        stat_pi: model.stat_pi,
        class: model.class,
        quantity: 1,
        effective_price: unit.credits_per_hour ?? model.suggested_credits_per_hour,
        colors: unit.color ? [unit.color] : [],
        units: [fleetUnit],
      });
    }
  }

  const fleetModels = Array.from(modelMap.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  );

  return (
    <section className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fleet Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage the quantity of cars in your fleet by model.
          </p>
        </div>
        <Link
          href="/biz/fleet/add"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Add Model
        </Link>
      </div>

      {fleetModels.length === 0 ? (
        <div className="mt-10 rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No models in your fleet yet.</p>
          <p className="mt-2 text-sm text-gray-400">
            Add a model from the catalog to get started.
          </p>
          <Link
            href="/biz/fleet/add"
            className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Add Your First Model
          </Link>
        </div>
      ) : (
        <div className="mt-8 divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
          {fleetModels.map((fm) => (
            <FleetRow key={fm.car_model_id} model={fm} />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Tip: Use + and - buttons to quickly adjust quantities. Units with future
        bookings cannot be removed.
      </p>
    </section>
  );
}
