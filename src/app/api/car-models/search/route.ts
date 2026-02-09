import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/car-models/search?q=...
//
// Searches car_models by display_name, manufacturer, or model.
// Returns up to 20 results.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ models: [] });
  }

  const supabase = await createClient();

  // Search using ilike on display_name, manufacturer, and model
  const searchPattern = `%${query}%`;

  const { data: models, error } = await supabase
    .from("car_models")
    .select(
      "id, display_name, manufacturer, model, image_url, suggested_credits_per_hour, stat_pi, class"
    )
    .or(
      `display_name.ilike.${searchPattern},manufacturer.ilike.${searchPattern},model.ilike.${searchPattern}`
    )
    .order("display_name")
    .limit(20);

  if (error) {
    console.error("Car model search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ models: models ?? [] });
}
