"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { rateLimit } from "@/lib/rateLimit";

const RATE_MAX = 10;
const RATE_WINDOW = 60_000;

interface ActionResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Create blackout  (now references car_unit_id)
// ---------------------------------------------------------------------------

export async function addBlackout(formData: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "BUSINESS") {
    return { success: false, error: "Unauthorized" };
  }

  const rl = rateLimit(`${profile.id}:biz_blackout`, RATE_MAX, RATE_WINDOW);
  if (!rl.ok) return { success: false, error: "Too many requests. Slow down." };

  const carUnitId = formData.get("car_unit_id") as string;
  const startTs = formData.get("start_ts") as string;
  const endTs = formData.get("end_ts") as string;
  const reason = (formData.get("reason") as string)?.trim() || null;

  if (!carUnitId || !startTs || !endTs) {
    return { success: false, error: "Car unit, start time, and end time are required." };
  }

  const start = new Date(startTs);
  const end = new Date(endTs);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { success: false, error: "Invalid date format." };
  }
  if (start >= end) {
    return { success: false, error: "End time must be after start time." };
  }

  // RLS ensures the car_unit belongs to the caller's business
  const supabase = await createClient();
  const { error } = await supabase.from("car_blackouts").insert({
    car_unit_id: carUnitId,
    start_ts: start.toISOString(),
    end_ts: end.toISOString(),
    reason,
  });

  if (error) return { success: false, error: error.message };

  revalidatePath("/biz/blackouts");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete blackout
// ---------------------------------------------------------------------------

export async function deleteBlackout(blackoutId: string): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "BUSINESS") {
    return { success: false, error: "Unauthorized" };
  }

  // RLS ensures only own car unit blackouts are deletable
  const supabase = await createClient();
  const { error } = await supabase
    .from("car_blackouts")
    .delete()
    .eq("id", blackoutId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/biz/blackouts");
  return { success: true };
}
