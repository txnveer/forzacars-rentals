import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  modelId: z.string().uuid("Invalid model ID"),
  start: z.string().datetime("Invalid start timestamp"),
  end: z.string().datetime("Invalid end timestamp"),
  color: z.string().max(50).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/availability
//
// Returns available unit IDs for a car model within a time range.
// Excludes units with overlapping CONFIRMED bookings or blackouts.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const rawParams = {
    modelId: searchParams.get("modelId") ?? "",
    start: searchParams.get("start") ?? "",
    end: searchParams.get("end") ?? "",
    color: searchParams.get("color") ?? undefined,
  };

  // Validate inputs
  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { modelId, start, end, color } = parsed.data;

  // Validate time range
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (endDate <= startDate) {
    return NextResponse.json(
      { error: "End time must be after start time" },
      { status: 400 }
    );
  }

  // Minimum 1 hour
  const durationMs = endDate.getTime() - startDate.getTime();
  if (durationMs < 60 * 60 * 1000) {
    return NextResponse.json(
      { error: "Minimum booking duration is 1 hour" },
      { status: 400 }
    );
  }

  // 30-minute boundary check
  const startMinutes = startDate.getUTCMinutes();
  const endMinutes = endDate.getUTCMinutes();
  if (
    startDate.getUTCSeconds() !== 0 ||
    (startMinutes !== 0 && startMinutes !== 30) ||
    endDate.getUTCSeconds() !== 0 ||
    (endMinutes !== 0 && endMinutes !== 30)
  ) {
    return NextResponse.json(
      { error: "Times must align to 30-minute boundaries" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Build query for active car units for this model
  let unitsQuery = supabase
    .from("car_units")
    .select("id, display_name, color, color_hex, credits_per_hour, business_id")
    .eq("car_model_id", modelId)
    .eq("active", true);

  // Apply optional color filter
  if (color) {
    unitsQuery = unitsQuery.ilike("color", color);
  }

  const { data: units, error: unitsError } = await unitsQuery;

  if (unitsError) {
    console.error("Availability query error:", unitsError);
    return NextResponse.json(
      { error: "Failed to fetch units" },
      { status: 500 }
    );
  }

  if (!units || units.length === 0) {
    return NextResponse.json({
      availableUnitIds: [],
      availableUnits: [],
      totalUnits: 0,
      availableCount: 0,
    });
  }

  const unitIds = units.map((u) => u.id);

  // Find units with overlapping CONFIRMED bookings
  const { data: overlappingBookings } = await supabase
    .from("bookings")
    .select("car_unit_id")
    .in("car_unit_id", unitIds)
    .eq("status", "CONFIRMED")
    .lt("start_ts", end) // booking starts before our end
    .gt("end_ts", start); // booking ends after our start

  const bookedUnitIds = new Set(
    (overlappingBookings ?? []).map((b) => b.car_unit_id)
  );

  // Find units with overlapping blackouts
  const { data: overlappingBlackouts } = await supabase
    .from("car_blackouts")
    .select("car_unit_id")
    .in("car_unit_id", unitIds)
    .lt("start_ts", end)
    .gt("end_ts", start);

  const blackedOutUnitIds = new Set(
    (overlappingBlackouts ?? []).map((b) => b.car_unit_id)
  );

  // Filter to available units
  const availableUnits = units.filter(
    (u) => !bookedUnitIds.has(u.id) && !blackedOutUnitIds.has(u.id)
  );

  return NextResponse.json({
    availableUnitIds: availableUnits.map((u) => u.id),
    availableUnits: availableUnits.map((u) => ({
      id: u.id,
      displayName: u.display_name,
      color: u.color,
      colorHex: u.color_hex,
      creditsPerHour: u.credits_per_hour,
      businessId: u.business_id,
    })),
    totalUnits: units.length,
    availableCount: availableUnits.length,
    // Also return blocked intervals for calendar display
    blockedIntervals: {
      bookings: (overlappingBookings ?? []).map((b) => b.car_unit_id),
      blackouts: (overlappingBlackouts ?? []).map((b) => b.car_unit_id),
    },
  });
}
