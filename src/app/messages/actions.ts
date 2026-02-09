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
  threadId?: string;
  messageId?: string;
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const sendMessageSchema = z.object({
  thread_id: z.string().uuid("Invalid thread ID"),
  recipient_id: z.string().uuid("Invalid recipient ID"),
  body: z
    .string()
    .min(1, "Message cannot be empty")
    .max(2000, "Message must be 2000 characters or less"),
});

const createThreadSchema = z.object({
  subject: z
    .string()
    .max(200, "Subject must be 200 characters or less")
    .nullable()
    .transform((v) => (v?.trim() === "" ? null : v?.trim())),
  recipient_id: z.string().uuid("Invalid recipient ID"),
  body: z
    .string()
    .min(1, "Message cannot be empty")
    .max(2000, "Message must be 2000 characters or less"),
  business_id: z
    .string()
    .uuid("Invalid business ID")
    .nullable()
    .optional(),
});

// ---------------------------------------------------------------------------
// Send message in existing thread
// ---------------------------------------------------------------------------

export async function sendMessage(formData: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) {
    return { success: false, error: "You must be logged in to send messages." };
  }

  // Rate limit: 30 messages per minute
  const rl = rateLimit(`${profile.id}:send_message`, 30, 60_000);
  if (!rl.ok) {
    return { success: false, error: "Too many messages. Please wait." };
  }

  const rawData = {
    thread_id: formData.get("thread_id") as string,
    recipient_id: formData.get("recipient_id") as string,
    body: formData.get("body") as string,
  };

  const parsed = sendMessageSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  // Insert message
  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      thread_id: parsed.data.thread_id,
      sender_id: profile.id,
      recipient_id: parsed.data.recipient_id,
      body: parsed.data.body,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Send message error:", error);
    return { success: false, error: "Failed to send message." };
  }

  revalidatePath(`/messages/${parsed.data.thread_id}`);
  revalidatePath("/messages");

  return { success: true, messageId: message.id };
}

// ---------------------------------------------------------------------------
// Create new thread with first message
// ---------------------------------------------------------------------------

export async function createThread(formData: FormData): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) {
    return { success: false, error: "You must be logged in to start a conversation." };
  }

  // Rate limit: 10 new threads per minute
  const rl = rateLimit(`${profile.id}:create_thread`, 10, 60_000);
  if (!rl.ok) {
    return { success: false, error: "Too many requests. Please wait." };
  }

  const rawData = {
    subject: formData.get("subject") as string | null,
    recipient_id: formData.get("recipient_id") as string,
    body: formData.get("body") as string,
    business_id: formData.get("business_id") as string | null,
  };

  const parsed = createThreadSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  // Create thread
  const { data: thread, error: threadError } = await supabase
    .from("message_threads")
    .insert({
      subject: parsed.data.subject,
      created_by: profile.id,
      customer_id: profile.role === "CUSTOMER" ? profile.id : parsed.data.recipient_id,
      business_id: parsed.data.business_id ?? null,
    })
    .select("id")
    .single();

  if (threadError) {
    console.error("Create thread error:", threadError);
    return { success: false, error: "Failed to create conversation." };
  }

  // Insert first message
  const { error: msgError } = await supabase.from("messages").insert({
    thread_id: thread.id,
    sender_id: profile.id,
    recipient_id: parsed.data.recipient_id,
    body: parsed.data.body,
  });

  if (msgError) {
    console.error("Create first message error:", msgError);
    return { success: false, error: "Failed to send initial message." };
  }

  revalidatePath("/messages");

  return { success: true, threadId: thread.id };
}

// ---------------------------------------------------------------------------
// Mark messages as read
// ---------------------------------------------------------------------------

export async function markMessagesAsRead(threadId: string): Promise<ActionResult> {
  const profile = await getProfile();
  if (!profile) {
    return { success: false, error: "Not authenticated." };
  }

  // Validate threadId
  if (!z.string().uuid().safeParse(threadId).success) {
    return { success: false, error: "Invalid thread ID." };
  }

  const supabase = await createClient();

  // Update all unread messages in this thread where user is recipient
  const { error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .eq("recipient_id", profile.id)
    .is("read_at", null);

  if (error) {
    console.error("Mark messages read error:", error);
    return { success: false, error: "Failed to mark messages as read." };
  }

  revalidatePath("/messages");
  revalidatePath(`/messages/${threadId}`);

  return { success: true };
}

// ---------------------------------------------------------------------------
// Validation schema for granting credits
// ---------------------------------------------------------------------------

const grantCreditsSchema = z.object({
  thread_id: z.string().uuid("Invalid thread ID"),
  user_id: z.string().uuid("Invalid user ID"),
  amount: z
    .string()
    .transform((v) => parseInt(v, 10))
    .refine((v) => Number.isFinite(v) && v > 0, "Amount must be a positive number"),
  reason: z
    .string()
    .min(1, "Reason is required")
    .max(200, "Reason must be 200 characters or less"),
});

// ---------------------------------------------------------------------------
// Grant credits (BUSINESS uses RPC, ADMIN uses admin_grant_credits)
// ---------------------------------------------------------------------------

interface GrantCreditsResult {
  success: boolean;
  error?: string;
  newBalance?: number;
}

export async function grantCreditsInThread(
  formData: FormData
): Promise<GrantCreditsResult> {
  const profile = await getProfile();
  if (!profile) {
    return { success: false, error: "Not authenticated." };
  }

  if (profile.role !== "BUSINESS" && profile.role !== "ADMIN") {
    return { success: false, error: "Only business users or admins can grant credits." };
  }

  // Rate limit: 20 grants per minute
  const rl = rateLimit(`${profile.id}:grant_credits`, 20, 60_000);
  if (!rl.ok) {
    return { success: false, error: "Too many requests. Please wait." };
  }

  const rawData = {
    thread_id: formData.get("thread_id") as string,
    user_id: formData.get("user_id") as string,
    amount: formData.get("amount") as string,
    reason: formData.get("reason") as string,
  };

  const parsed = grantCreditsSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();

  if (profile.role === "ADMIN") {
    // Admin uses admin_grant_credits RPC
    const { data, error } = await supabase.rpc("admin_grant_credits", {
      p_user_id: parsed.data.user_id,
      p_amount: parsed.data.amount,
      p_reason: `${parsed.data.reason} (thread: ${parsed.data.thread_id})`,
    });

    if (error) {
      console.error("Admin grant credits error:", error);
      return { success: false, error: error.message || "Failed to grant credits." };
    }

    // Post confirmation message
    await supabase.from("messages").insert({
      thread_id: parsed.data.thread_id,
      sender_id: profile.id,
      recipient_id: parsed.data.user_id,
      body: `Granted ${parsed.data.amount} credits. Reason: ${parsed.data.reason}`,
    });

    revalidatePath(`/messages/${parsed.data.thread_id}`);
    revalidatePath("/messages");

    return {
      success: true,
      newBalance: (data as { new_balance?: number })?.new_balance,
    };
  } else {
    // Business uses business_grant_credits RPC
    const { data, error } = await supabase.rpc("business_grant_credits", {
      p_user_id: parsed.data.user_id,
      p_amount: parsed.data.amount,
      p_reason: parsed.data.reason,
      p_thread_id: parsed.data.thread_id,
    });

    if (error) {
      console.error("Business grant credits error:", error);
      return { success: false, error: error.message || "Failed to grant credits." };
    }

    revalidatePath(`/messages/${parsed.data.thread_id}`);
    revalidatePath("/messages");

    return {
      success: true,
      newBalance: (data as { new_balance?: number })?.new_balance,
    };
  }
}
