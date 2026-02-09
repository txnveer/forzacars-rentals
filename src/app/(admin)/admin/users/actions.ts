"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { rateLimit } from "@/lib/rateLimit";

interface ActionResult {
  success: boolean;
  error?: string;
  newBalance?: number;
}

// ---------------------------------------------------------------------------
// Grant credits  (calls the admin_grant_credits RPC)
// ---------------------------------------------------------------------------

export async function grantCredits(formData: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "ADMIN") {
    return { success: false, error: "Unauthorized" };
  }

  const rl = rateLimit(`${profile.id}:admin_grant`, 20, 60_000);
  if (!rl.ok) return { success: false, error: "Too many requests. Slow down." };

  const userId = formData.get("user_id") as string;
  const amount = parseInt(formData.get("amount") as string, 10);
  const reason = (formData.get("reason") as string)?.trim();

  if (!userId) return { success: false, error: "Missing user." };
  if (!Number.isFinite(amount) || amount < 1) {
    return { success: false, error: "Amount must be a positive integer." };
  }
  if (!reason) return { success: false, error: "Reason is required." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_grant_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
  });

  if (error) return { success: false, error: error.message };

  const result = data as { new_balance?: number } | null;

  revalidatePath("/admin/users");
  return { success: true, newBalance: result?.new_balance ?? undefined };
}

// ---------------------------------------------------------------------------
// Update user role
// ---------------------------------------------------------------------------

export async function updateUserRole(
  userId: string,
  newRole: string
): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile || profile.role !== "ADMIN") {
    return { success: false, error: "Unauthorized" };
  }

  if (!["CUSTOMER", "BUSINESS", "ADMIN"].includes(newRole)) {
    return { success: false, error: "Invalid role." };
  }

  // Prevent admin from demoting themselves
  if (userId === profile.id) {
    return { success: false, error: "You cannot change your own role." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", userId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/admin/users");
  return { success: true };
}
