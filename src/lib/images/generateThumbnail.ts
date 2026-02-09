/**
 * Server-only: generate a square WEBP thumbnail from image bytes.
 */

import sharp from "sharp";

const DEFAULT_SIZE = 128;
const WEBP_QUALITY = 75;

/**
 * Creates a square thumbnail (cover crop, center) in WEBP format.
 * @param inputBuffer - Raw image bytes (JPEG, PNG, etc.)
 * @param size - Output width/height (default 128)
 * @returns WEBP buffer
 */
export async function generateThumbnail(
  inputBuffer: Buffer,
  size: number = DEFAULT_SIZE
): Promise<Buffer> {
  return sharp(inputBuffer)
    .resize(size, size, { fit: "cover", position: "center" })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}
