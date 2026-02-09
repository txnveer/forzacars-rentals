"use server";

import { redirect } from "next/navigation";
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
  threadId?: string;
}

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const requestCreditsSchema = z.object({
  amount: z
    .string()
    .transform((v) => parseInt(v, 10))
    .refine((v) => Number.isFinite(v) && v > 0, "Amount must be a positive number"),
  note: z
    .string()
    .max(500, "Note must be 500 characters or less")
    .optional()
    .transform((v) => v?.trim() || ""),
});

// ---------------------------------------------------------------------------
// Request Credits — creates a thread to admin and sends initial message
// ---------------------------------------------------------------------------

export async function requestCredits(formData: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) {
    return { success: false, error: "You must be logged in." };
  }

  // Rate limit: 5 requests per hour
  const rl = rateLimit(`${profile.id}:request_credits`, 5, 3600_000);
  if (!rl.ok) {
    return { success: false, error: "Too many credit requests. Please wait before trying again." };
  }

  const rawData = {
    amount: formData.get("amount") as string,
    note: formData.get("note") as string,
  };

  const parsed = requestCreditsSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  // Find an admin to send the request to
  // In a real app, you might have a specific support admin or queue
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "ADMIN")
    .limit(1);

  if (!admins || admins.length === 0) {
    return { success: false, error: "No admin available to process your request. Please try again later." };
  }

  const adminId = admins[0].id;

  // Check if there's an existing open credit request thread with this admin
  // For simplicity, we'll create a new thread each time
  // (In production, you might reuse threads)

  // Create thread
  const { data: thread, error: threadError } = await supabase
    .from("message_threads")
    .insert({
      subject: `Credit Request: ${parsed.data.amount} credits`,
      created_by: profile.id,
      customer_id: profile.id,
      business_id: null, // Admin thread, not business-specific
    })
    .select("id")
    .single();

  if (threadError) {
    console.error("Create credit request thread error:", threadError);
    return { success: false, error: "Failed to create request. Please try again." };
  }

  // Build message body
  const messageBody = parsed.data.note
    ? `I would like to request ${parsed.data.amount} credits.\n\nNote: ${parsed.data.note}`
    : `I would like to request ${parsed.data.amount} credits.`;

  // Insert initial message
  const { error: msgError } = await supabase.from("messages").insert({
    thread_id: thread.id,
    sender_id: profile.id,
    recipient_id: adminId,
    body: messageBody,
  });

  if (msgError) {
    console.error("Create credit request message error:", msgError);
    return { success: false, error: "Failed to send request message." };
  }

  // Redirect to the thread
  redirect(`/messages/${thread.id}`);
}
