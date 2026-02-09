"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { rateLimit } from "@/lib/rateLimit";
import { sendCancellationEmail } from "@/lib/email/cancellation";

// 5 cancel actions per user per 5 minutes
const CANCEL_MAX = 5;
const CANCEL_WINDOW_MS = 5 * 60 * 1000;

export interface CancelResult {
  success: boolean;
  error?: string;
  refundCredits?: number;
  refundPct?: number;
}

/**
 * Server action — cancel a confirmed booking.
 *
 * Calls the `cancel_booking` SECURITY DEFINER RPC which handles
 * authorisation (owner or ADMIN), tiered refund logic, and atomic
 * status + ledger + audit writes.
 */
export async function cancelBooking(bookingId: string): Promise<CancelResult> {
  // ------------------------------------------------------------------
  // 1. Auth check
  // ------------------------------------------------------------------
  const profile = await getProfile();
  if (!profile) {
    return { success: false, error: "Not authenticated" };
  }

  // ------------------------------------------------------------------
  // 2. Rate limit
  // ------------------------------------------------------------------
  const rl = rateLimit(`${profile.id}:cancel_booking`, CANCEL_MAX, CANCEL_WINDOW_MS);
  if (!rl.ok) {
    const secs = Math.ceil(rl.retryAfterMs / 1000);
    return {
      success: false,
      error: `Too many cancel requests. Try again in ${secs}s.`,
    };
  }

  // ------------------------------------------------------------------
  // 3. Call RPC
  // ------------------------------------------------------------------
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_booking", {
    p_booking_id: bookingId,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const result = data as {
    booking_id: string;
    status: string;
    refund: number;
    refund_pct: number;
    message?: string;
  };

  // ------------------------------------------------------------------
  // 4. Send cancellation email (non-blocking / non-critical)
  // ------------------------------------------------------------------
  sendCancellationEmail({
    to: profile.email,
    bookingId: result.booking_id,
    refundCredits: result.refund,
    refundPct: result.refund_pct,
  });

  // ------------------------------------------------------------------
  // 5. Revalidate
  // ------------------------------------------------------------------
  revalidatePath("/bookings");
  revalidatePath("/wallet");

  return {
    success: true,
    refundCredits: result.refund,
    refundPct: result.refund_pct,
  };
}
