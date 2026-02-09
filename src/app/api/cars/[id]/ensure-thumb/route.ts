import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRoleClient";
import { getImageUrl } from "@/lib/supabase/getImageUrl";
import { generateThumbnail } from "@/lib/images/generateThumbnail";
import { rateLimit } from "@/lib/rateLimit";

const CAR_IMAGES_BUCKET = "car-images";
const THUMB_PREFIX = "thumbs/";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/**
 * GET /api/cars/[id]/ensure-thumb
 * Ensures a thumbnail exists for the car model. If thumb_path is missing
 * but image_path exists, generates the thumb, uploads to Storage, updates DB.
 * Returns { thumb_url } (and optionally thumb_path). Public GET for MVP.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id || !isUuid(id)) {
      return NextResponse.json(
        { error: "Invalid car model id" },
        { status: 400 }
      );
    }

    // Rate limit by IP (no auth required for public read)
    const forwarded = _request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? "anonymous";
    const rl = rateLimit(`ensure-thumb:${ip}`, 30, 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const supabase = createServiceRoleClient();

    const { data: car, error: fetchError } = await supabase
      .from("car_models")
      .select("id, image_path, thumb_path")
      .eq("id", id)
      .single();

    if (fetchError || !car) {
      return NextResponse.json(
        { error: "Car model not found" },
        { status: 404 }
      );
    }

    if (car.thumb_path) {
      const thumbUrl = await getImageUrl(car.thumb_path);
      if (thumbUrl) {
        return NextResponse.json({
          thumb_path: car.thumb_path,
          thumb_url: thumbUrl,
        });
      }
    }

    if (!car.image_path || !car.image_path.trim()) {
      return NextResponse.json(
        { error: "No stored image to thumbnail" },
        { status: 400 }
      );
    }

    // Download original from Storage
    const {
      data: originalBytes,
      error: downloadError,
    } = await supabase.storage
      .from(CAR_IMAGES_BUCKET)
      .download(car.image_path);

    if (downloadError || !originalBytes) {
      return NextResponse.json(
        { error: "Could not load original image" },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(await originalBytes.arrayBuffer());
    const thumbBuffer = await generateThumbnail(buffer);

    const thumbPath = `${THUMB_PREFIX}${id}.webp`;

    const { error: uploadError } = await supabase.storage
      .from(CAR_IMAGES_BUCKET)
      .upload(thumbPath, thumbBuffer, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "Failed to save thumbnail" },
        { status: 502 }
      );
    }

    const { error: updateError } = await supabase
      .from("car_models")
      .update({
        thumb_path: thumbPath,
        image_updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update record" },
        { status: 502 }
      );
    }

    const thumbUrl = await getImageUrl(thumbPath);
    if (!thumbUrl) {
      return NextResponse.json(
        { error: "Failed to get thumbnail URL" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      thumb_path: thumbPath,
      thumb_url: thumbUrl,
    });
  } catch {
    return NextResponse.json(
      { error: "An error occurred" },
      { status: 500 }
    );
  }
}
