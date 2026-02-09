"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { rateLimit } from "@/lib/rateLimit";

interface ActionResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Toggle active / inactive
// ---------------------------------------------------------------------------

export async function toggleInventoryActive(
  unitId: string,
  active: boolean
): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "BUSINESS") {
    return { success: false, error: "Unauthorized" };
  }

  const rl = rateLimit(`${profile.id}:inv_toggle`, 20, 60_000);
  if (!rl.ok) return { success: false, error: "Too many requests." };

  // RLS ensures only own units are updatable
  const supabase = await createClient();
  const { error } = await supabase
    .from("car_units")
    .update({ active })
    .eq("id", unitId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/biz/inventory");
  return { success: true };
}
