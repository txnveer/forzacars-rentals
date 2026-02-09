/**
 * Server-only: resolve a storage path to a URL (signed or public).
 * Never create signed URLs in client code.
 */

import { createServiceRoleClient } from "./serviceRoleClient";

const CAR_IMAGES_BUCKET = "car-images";
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Returns a URL for the given storage path in the car-images bucket.
 * Uses signed URLs so the bucket can stay private.
 */
export async function getImageUrl(
  path: string | null | undefined
): Promise<string | null> {
  if (!path || !path.trim()) return null;

  const supabase = createServiceRoleClient();
  const {
    data: { signedUrl },
    error,
  } = await supabase.storage
    .from(CAR_IMAGES_BUCKET)
    .createSignedUrl(path.trim(), SIGNED_URL_EXPIRY_SECONDS);

  if (error || !signedUrl) return null;
  return signedUrl;
}
