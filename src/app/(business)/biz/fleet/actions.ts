"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { rateLimit } from "@/lib/rateLimit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionResult {
  success: boolean;
  error?: string;
  data?: {
    carModelId?: string;
    quantity?: number;
    previousQty?: number;
    newQty?: number;
    unitIds?: string[];
    addedIds?: string[];
    removedIds?: string[];
  };
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const addModelSchema = z.object({
  car_model_id: z.string().uuid("Invalid model ID"),
  quantity: z
    .string()
    .transform((v) => parseInt(v, 10))
    .refine((v) => Number.isFinite(v) && v >= 1 && v <= 100, "Quantity must be 1-100"),
  color: z
    .string()
    .min(1, "Color is required")
    .max(50, "Color must be 50 characters or less"),
  color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color")
    .optional()
    .nullable()
    .transform((v) => v || null),
  credits_per_hour: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v > 0), "Price must be positive"),
});

const adjustQuantitySchema = z.object({
  car_model_id: z.string().uuid("Invalid model ID"),
  new_qty: z
    .string()
    .transform((v) => parseInt(v, 10))
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 100, "Quantity must be 0-100"),
});

// ---------------------------------------------------------------------------
// Add model to fleet
// ---------------------------------------------------------------------------

export async function addModelToFleet(formData: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) {
    return { success: false, error: "Not authenticated." };
  }

  if (profile.role !== "BUSINESS") {
    return { success: false, error: "Only business users can manage fleet." };
  }

  const rl = rateLimit(`${profile.id}:add_model_fleet`, 20, 60_000);
  if (!rl.ok) {
    return { success: false, error: "Too many requests. Please wait." };
  }

  const rawData = {
    car_model_id: formData.get("car_model_id") as string,
    quantity: formData.get("quantity") as string,
    color: formData.get("color") as string,
    color_hex: formData.get("color_hex") as string | null,
    credits_per_hour: formData.get("credits_per_hour") as string | null,
  };

  const parsed = addModelSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("business_add_model_to_fleet", {
    p_car_model_id: parsed.data.car_model_id,
    p_quantity: parsed.data.quantity,
    p_color: parsed.data.color,
    p_color_hex: parsed.data.color_hex,
    p_credits_per_hour: parsed.data.credits_per_hour,
  });

  if (error) {
    console.error("Add model to fleet error:", error);
    return { success: false, error: error.message || "Failed to add model to fleet." };
  }

  revalidatePath("/biz/fleet");
  revalidatePath("/biz/inventory");

  const result = data as { car_model_id: string; quantity: number; unit_ids: string[] };
  return {
    success: true,
    data: {
      carModelId: result.car_model_id,
      quantity: result.quantity,
      unitIds: result.unit_ids,
    },
  };
}

// ---------------------------------------------------------------------------
// Adjust quantity
// ---------------------------------------------------------------------------

export async function adjustFleetQuantity(formData: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) {
    return { success: false, error: "Not authenticated." };
  }

  if (profile.role !== "BUSINESS") {
    return { success: false, error: "Only business users can manage fleet." };
  }

  const rl = rateLimit(`${profile.id}:adjust_fleet_qty`, 30, 60_000);
  if (!rl.ok) {
    return { success: false, error: "Too many requests. Please wait." };
  }

  const rawData = {
    car_model_id: formData.get("car_model_id") as string,
    new_qty: formData.get("new_qty") as string,
  };

  const parsed = adjustQuantitySchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("business_adjust_quantity", {
    p_car_model_id: parsed.data.car_model_id,
    p_new_qty: parsed.data.new_qty,
  });

  if (error) {
    console.error("Adjust fleet quantity error:", error);
    return { success: false, error: error.message || "Failed to adjust quantity." };
  }

  revalidatePath("/biz/fleet");
  revalidatePath("/biz/inventory");

  const result = data as {
    car_model_id: string;
    previous_qty: number;
    new_qty: number;
    added_ids: string[];
    removed_ids: string[];
  };

  return {
    success: true,
    data: {
      carModelId: result.car_model_id,
      previousQty: result.previous_qty,
      newQty: result.new_qty,
      addedIds: result.added_ids,
      removedIds: result.removed_ids,
    },
  };
}

// ---------------------------------------------------------------------------
// Quick increment/decrement helpers
// ---------------------------------------------------------------------------

export async function incrementFleetQuantity(
  carModelId: string,
  currentQty: number
): Promise<ActionResult> {
  const form = new FormData();
  form.set("car_model_id", carModelId);
  form.set("new_qty", String(currentQty + 1));
  return adjustFleetQuantity(form);
}

export async function decrementFleetQuantity(
  carModelId: string,
  currentQty: number
): Promise<ActionResult> {
  if (currentQty <= 0) {
    return { success: false, error: "Cannot reduce below 0." };
  }
  const form = new FormData();
  form.set("car_model_id", carModelId);
  form.set("new_qty", String(currentQty - 1));
  return adjustFleetQuantity(form);
}
