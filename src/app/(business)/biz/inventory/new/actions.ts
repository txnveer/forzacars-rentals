"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { rateLimit } from "@/lib/rateLimit";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const UnitRowSchema = z.object({
  color: z
    .string()
    .trim()
    .min(1, "Color is required"),
  color_hex: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB format")
    .nullable()
    .optional()
    .transform((v) => v || null),
  vin: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  license_plate: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => v || null),
  credits_per_hour: z
    .number()
    .int()
    .positive("Must be > 0")
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

const BulkCreateSchema = z.object({
  car_model_id: z.string().uuid("Invalid car model ID"),
  units: z
    .array(UnitRowSchema)
    .min(1, "At least one unit is required")
    .max(20, "Maximum 20 units at once"),
});

export type BulkCreateInput = z.infer<typeof BulkCreateSchema>;

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface BulkCreateResult {
  success: boolean;
  error?: string;
  /** Validation errors keyed by field path (e.g. "units.0.color") */
  fieldErrors?: Record<string, string[]>;
  /** Created unit rows with server-generated VIN/plate */
  created?: Array<{
    id: string;
    vin: string;
    license_plate: string;
    color: string;
    credits_per_hour: number | null;
  }>;
}

// ---------------------------------------------------------------------------
// Server action: bulk create car units
// ---------------------------------------------------------------------------

export async function bulkCreateUnits(
  input: unknown
): Promise<BulkCreateResult> {
  // 1. Auth + role check
  const profile = await getProfile();
  if (!profile || profile.role !== "BUSINESS" || !profile.business_id) {
    return { success: false, error: "Unauthorized — business account required." };
  }

  // 2. Rate limit (max 5 bulk creates per minute)
  const rl = rateLimit(`${profile.id}:bulk_create_units`, 5, 60_000);
  if (!rl.ok) {
    return { success: false, error: "Too many requests. Please wait a moment." };
  }

  // 3. Validate with zod
  const parsed = BulkCreateSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return {
      success: false,
      error: flat.formErrors[0] ?? "Validation failed.",
      fieldErrors: flat.fieldErrors as Record<string, string[]>,
    };
  }

  const { car_model_id, units } = parsed.data;

  // 4. Verify the car model exists
  const supabase = await createClient();
  const { data: model, error: modelErr } = await supabase
    .from("car_models")
    .select("id, display_name")
    .eq("id", car_model_id)
    .single();

  if (modelErr || !model) {
    return { success: false, error: "Car model not found." };
  }

  // 5. Build rows — omit vin/license_plate when null so DB defaults fire
  const rows = units.map((u) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: Record<string, any> = {
      business_id: profile.business_id,
      car_model_id,
      color: u.color,
      color_hex: u.color_hex,
      credits_per_hour: u.credits_per_hour,
    };
    // Only set vin/license_plate if explicitly provided so the DB
    // default functions (generate_vin / generate_plate) kick in.
    if (u.vin) row.vin = u.vin;
    if (u.license_plate) row.license_plate = u.license_plate;
    return row;
  });

  // 6. Insert
  const { data: created, error: insertErr } = await supabase
    .from("car_units")
    .insert(rows)
    .select("id, vin, license_plate, color, credits_per_hour");

  if (insertErr) {
    // Surface constraint errors nicely
    if (insertErr.message.includes("car_units_vin_key")) {
      return { success: false, error: "Duplicate VIN detected. Please use unique values." };
    }
    if (insertErr.message.includes("car_units_license_plate_key")) {
      return { success: false, error: "Duplicate license plate detected." };
    }
    return { success: false, error: insertErr.message };
  }

  // 7. Write audit_log entry for the bulk action
  await supabase.from("audit_log").insert({
    actor_user_id: profile.id,
    action: "BUSINESS_CREATE_UNITS",
    entity_type: "car_units",
    metadata: {
      car_model_id,
      car_model_name: model.display_name,
      unit_count: created?.length ?? units.length,
      unit_ids: (created ?? []).map((c) => c.id),
    },
  });

  // 8. Revalidate inventory page
  revalidatePath("/biz/inventory");
  revalidatePath("/biz/cars");

  return {
    success: true,
    created: created ?? [],
  };
}
