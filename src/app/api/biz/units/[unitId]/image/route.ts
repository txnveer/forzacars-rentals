import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRoleClient";
import { getProfile } from "@/lib/auth/getProfile";
import { generateThumbnail } from "@/lib/images/generateThumbnail";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BUCKET = "car-images";
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

// ---------------------------------------------------------------------------
// POST /api/biz/units/[unitId]/image
//
// Upload or replace an image for a car unit.
// - Validates business owns the unit
// - Uploads original to originals/{business_id}/{unit_id}.{ext}
// - Generates 128x128 webp thumbnail
// - Uploads thumb to thumbs/{business_id}/{unit_id}.webp
// - Updates car_units.image_path + thumb_path
// - Writes audit_log
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ unitId: string }> }
) {
  const { unitId } = await params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(unitId)) {
    return NextResponse.json(
      { error: "Invalid unit ID" },
      { status: 400 }
    );
  }

  // Authenticate
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  if (profile.role !== "BUSINESS") {
    return NextResponse.json(
      { error: "Only business users can upload unit images" },
      { status: 403 }
    );
  }

  if (!profile.business_id) {
    return NextResponse.json(
      { error: "Business user must be associated with a business" },
      { status: 403 }
    );
  }

  // Verify unit exists and belongs to this business
  const supabase = await createClient();
  const { data: unit, error: unitError } = await supabase
    .from("car_units")
    .select("id, business_id, image_path, thumb_path")
    .eq("id", unitId)
    .single();

  if (unitError || !unit) {
    return NextResponse.json(
      { error: "Unit not found" },
      { status: 404 }
    );
  }

  if (unit.business_id !== profile.business_id) {
    return NextResponse.json(
      { error: "You do not own this unit" },
      { status: 403 }
    );
  }

  // Parse form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Allowed: PNG, JPEG, WEBP" },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File too large. Maximum 5 MB" },
      { status: 400 }
    );
  }

  // Read file into buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Determine file extension
  const ext = file.type === "image/png" ? "png" 
            : file.type === "image/webp" ? "webp" 
            : "jpg";

  // Generate paths
  const originalPath = `originals/${profile.business_id}/${unitId}.${ext}`;
  const thumbPath = `thumbs/${profile.business_id}/${unitId}.webp`;

  // Use service role client for storage operations
  const serviceClient = createServiceRoleClient();

  // Delete old files if they exist (to replace)
  if (unit.image_path) {
    await serviceClient.storage.from(BUCKET).remove([unit.image_path]);
  }
  if (unit.thumb_path) {
    await serviceClient.storage.from(BUCKET).remove([unit.thumb_path]);
  }

  // Upload original
  const { error: uploadError } = await serviceClient.storage
    .from(BUCKET)
    .upload(originalPath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("Original upload error:", uploadError);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }

  // Generate thumbnail
  let thumbBuffer: Buffer;
  try {
    thumbBuffer = await generateThumbnail(buffer, 128);
  } catch (err) {
    console.error("Thumbnail generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate thumbnail" },
      { status: 500 }
    );
  }

  // Upload thumbnail
  const { error: thumbUploadError } = await serviceClient.storage
    .from(BUCKET)
    .upload(thumbPath, thumbBuffer, {
      contentType: "image/webp",
      upsert: true,
    });

  if (thumbUploadError) {
    console.error("Thumbnail upload error:", thumbUploadError);
    return NextResponse.json(
      { error: "Failed to upload thumbnail" },
      { status: 500 }
    );
  }

  // Update car_units record
  const { error: updateError } = await serviceClient
    .from("car_units")
    .update({
      image_path: originalPath,
      thumb_path: thumbPath,
    })
    .eq("id", unitId);

  if (updateError) {
    console.error("DB update error:", updateError);
    return NextResponse.json(
      { error: "Failed to update unit record" },
      { status: 500 }
    );
  }

  // Audit log
  await serviceClient.from("audit_log").insert({
    actor_user_id: profile.id,
    action: "unit.image_uploaded",
    entity_type: "car_unit",
    entity_id: unitId,
    metadata: {
      business_id: profile.business_id,
      image_path: originalPath,
      thumb_path: thumbPath,
      file_size: file.size,
      file_type: file.type,
    },
  });

  return NextResponse.json({
    success: true,
    imagePath: originalPath,
    thumbPath: thumbPath,
  });
}
