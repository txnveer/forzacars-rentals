import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/health
 * 
 * Health check endpoint to verify:
 * - API is responding
 * - Database connection is working
 * - Environment variables are configured
 */
export async function GET() {
  try {
    const supabase = await createClient();
    
    // Simple query to verify database connection
    const { error } = await supabase
      .from("car_models")
      .select("id")
      .limit(1);

    if (error) throw error;

    return NextResponse.json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    });
  } catch (error) {
    console.error("Health check failed:", error);
    
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
