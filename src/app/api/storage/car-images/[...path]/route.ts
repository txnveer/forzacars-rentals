import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRoleClient";

const BUCKET = "car-images";
const CACHE_CONTROL = "public, max-age=3600"; // 1 hour cache

/**
 * Proxy images from Supabase Storage for authenticated access.
 * GET /api/storage/car-images/originals/{business_id}/{unit_id}.jpg
 * GET /api/storage/car-images/thumbs/{business_id}/{unit_id}.webp
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  const storagePath = pathSegments.join("/");

  if (!storagePath) {
    return NextResponse.json(
      { error: "Path is required" },
      { status: 400 }
    );
  }

  // Validate path to prevent directory traversal
  if (storagePath.includes("..")) {
    return NextResponse.json(
      { error: "Invalid path" },
      { status: 400 }
    );
  }

  const supabase = createServiceRoleClient();

  // Download the file from storage
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(storagePath);

  if (error || !data) {
    return NextResponse.json(
      { error: "File not found" },
      { status: 404 }
    );
  }

  // Determine content type from path
  const ext = storagePath.split(".").pop()?.toLowerCase();
  let contentType = "application/octet-stream";
  if (ext === "jpg" || ext === "jpeg") contentType = "image/jpeg";
  else if (ext === "png") contentType = "image/png";
  else if (ext === "webp") contentType = "image/webp";
  else if (ext === "gif") contentType = "image/gif";

  // Convert blob to array buffer
  const buffer = await data.arrayBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": CACHE_CONTROL,
    },
  });
}
