"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { rateLimit } from "@/lib/rateLimit";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const profileUpdateSchema = z.object({
  display_name: z
    .string()
    .max(100, "Display name must be 100 characters or less")
    .nullable()
    .transform((v) => (v?.trim() === "" ? null : v?.trim())),
  phone: z
    .string()
    .max(30, "Phone must be 30 characters or less")
    .nullable()
    .transform((v) => (v?.trim() === "" ? null : v?.trim())),
  bio: z
    .string()
    .max(500, "Bio must be 500 characters or less")
    .nullable()
    .transform((v) => (v?.trim() === "" ? null : v?.trim())),
});

// ---------------------------------------------------------------------------
// Action result type
// ---------------------------------------------------------------------------

interface ActionResult {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Update profile action
// ---------------------------------------------------------------------------

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) {
    return { success: false, error: "You must be logged in to update your profile." };
  }

  // Rate limit: 10 updates per minute
  const rl = rateLimit(`${profile.id}:profile_update`, 10, 60_000);
  if (!rl.ok) {
    return { success: false, error: "Too many requests. Please wait before trying again." };
  }

  // Parse form data
  const rawData = {
    display_name: formData.get("display_name") as string | null,
    phone: formData.get("phone") as string | null,
    bio: formData.get("bio") as string | null,
  };

  // Validate
  const parsed = profileUpdateSchema.safeParse(rawData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as string;
      fieldErrors[key] = fieldErrors[key] || [];
      fieldErrors[key].push(issue.message);
    }
    return { success: false, error: "Validation failed.", fieldErrors };
  }

  // Update in database
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.display_name,
      phone: parsed.data.phone,
      bio: parsed.data.bio,
    })
    .eq("id", profile.id);

  if (error) {
    console.error("Profile update error:", error);
    return { success: false, error: "Failed to update profile. Please try again." };
  }

  revalidatePath("/profile");
  return { success: true };
}
