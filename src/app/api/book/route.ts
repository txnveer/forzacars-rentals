import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const bookingSchema = z.object({
  carUnitId: z.string().uuid("Invalid unit ID"),
  startTs: z.string().datetime("Invalid start timestamp"),
  endTs: z.string().datetime("Invalid end timestamp"),
});

// ---------------------------------------------------------------------------
// POST /api/book
//
// Creates a booking by calling the create_booking RPC.
// The RPC handles all validation (availability, balance, etc.).
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const profile = await getProfile();

  if (!profile) {
    return NextResponse.json(
      { error: "You must be logged in to book" },
      { status: 401 }
    );
  }

  if (profile.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Only customers can create bookings" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { carUnitId, startTs, endTs } = parsed.data;

  const supabase = await createClient();

  // Call the create_booking RPC
  // Note: The RPC was originally designed for car_id, but now uses car_unit_id.
  // We need to check if there's an updated RPC or call it appropriately.
  const { data, error } = await supabase.rpc("create_booking", {
    p_car_unit_id: carUnitId,
    p_start_ts: startTs,
    p_end_ts: endTs,
  });

  if (error) {
    console.error("Booking RPC error:", error);
    return NextResponse.json(
      { error: error.message || "Booking failed" },
      { status: 400 }
    );
  }

  const result = data as {
    booking_id: string;
    credits_charged: number;
    balance_after: number;
  };

  return NextResponse.json({
    bookingId: result.booking_id,
    creditsCharged: result.credits_charged,
    balanceAfter: result.balance_after,
  });
}
