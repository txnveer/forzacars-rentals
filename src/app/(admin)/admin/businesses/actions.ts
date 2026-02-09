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
// Create business
// ---------------------------------------------------------------------------

export async function createBusiness(formData: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "ADMIN") {
    return { success: false, error: "Unauthorized" };
  }

  const rl = rateLimit(`${profile.id}:admin_biz`, 10, 60_000);
  if (!rl.ok) return { success: false, error: "Too many requests." };

  const name = (formData.get("name") as string)?.trim();
  const slug = (formData.get("slug") as string)?.trim().toLowerCase();

  if (!name || !slug) {
    return { success: false, error: "Name and slug are required." };
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return {
      success: false,
      error: "Slug must be lowercase alphanumeric with hyphens only.",
    };
  }

  // RLS: admin can insert businesses
  const supabase = await createClient();
  const { error } = await supabase.from("businesses").insert({ name, slug });

  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      return { success: false, error: "A business with that slug already exists." };
    }
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/businesses");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete business
// ---------------------------------------------------------------------------

export async function deleteBusiness(businessId: string): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "ADMIN") {
    return { success: false, error: "Unauthorized" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .delete()
    .eq("id", businessId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/businesses");
  return { success: true };
}
