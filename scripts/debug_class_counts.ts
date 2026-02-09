/**
 * scripts/debug_class_counts.ts
 *
 * Dev-only debug helper — prints car_models counts grouped by class.
 * Use this to verify that class normalization was applied correctly
 * and that S1/S2/X have the expected number of cars.
 *
 * Usage:
 *   npx tsx scripts/debug_class_counts.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  // Group-by class using a raw RPC-style query
  const { data, error } = await supabase.rpc("debug_class_counts" as never);

  // Fallback: if the RPC doesn't exist, do it client-side
  if (error) {
    console.log("(RPC not found — falling back to client-side grouping)\n");

    const { data: cars, error: fetchErr } = await supabase
      .from("car_models")
      .select("class, stat_pi");

    if (fetchErr) {
      console.error("Error fetching car_models:", fetchErr.message);
      process.exit(1);
    }

    const counts = new Map<string, number>();
    const piSamples = new Map<string, number[]>();

    for (const car of cars ?? []) {
      const cls = car.class ?? "(NULL)";
      counts.set(cls, (counts.get(cls) ?? 0) + 1);
      if (car.stat_pi != null) {
        if (!piSamples.has(cls)) piSamples.set(cls, []);
        piSamples.get(cls)!.push(car.stat_pi);
      }
    }

    // Sort by canonical order
    const order = ["D", "C", "B", "A", "S1", "S2", "X", "(NULL)"];
    const sorted = [...counts.entries()].sort(
      (a, b) => (order.indexOf(a[0]) ?? 99) - (order.indexOf(b[0]) ?? 99)
    );

    console.log("=".repeat(50));
    console.log("car_models — class distribution");
    console.log("=".repeat(50));
    console.log();

    let total = 0;
    for (const [cls, count] of sorted) {
      const pis = piSamples.get(cls) ?? [];
      const piMin = pis.length ? Math.min(...pis) : "—";
      const piMax = pis.length ? Math.max(...pis) : "—";
      console.log(
        `  ${cls.padEnd(8)} ${String(count).padStart(4)} cars   PI range: ${piMin}–${piMax}`
      );
      total += count;
    }
    console.log(`  ${"─".repeat(35)}`);
    console.log(`  ${"TOTAL".padEnd(8)} ${String(total).padStart(4)} cars`);
    console.log();
    return;
  }

  // If RPC exists, print its result
  console.log("Class counts from RPC:");
  console.table(data);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
