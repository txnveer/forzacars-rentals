-- ============================================================================
-- ForzaCars Rentals — Car image storage paths and thumbnails
-- Migration: 20250209000012_car_image_thumb
--
-- Adds columns for Supabase Storage paths (original + thumbnail).
-- image_url remains for wiki/external URLs; image_path/thumb_path are for
-- objects in the car-images bucket. URLs are generated server-side (signed
-- or public) via getImageUrl.
-- ============================================================================

ALTER TABLE public.car_models
  ADD COLUMN IF NOT EXISTS image_path     text,
  ADD COLUMN IF NOT EXISTS thumb_path    text,
  ADD COLUMN IF NOT EXISTS image_updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN public.car_models.image_path IS
  'Storage path in car-images bucket for the original image (e.g. originals/<id>.jpg)';
COMMENT ON COLUMN public.car_models.thumb_path IS
  'Storage path in car-images bucket for the thumbnail (e.g. thumbs/<id>.webp)';
COMMENT ON COLUMN public.car_models.image_updated_at IS
  'Last time the image or thumbnail was updated';

CREATE INDEX IF NOT EXISTS idx_car_models_thumb_path
  ON public.car_models (thumb_path)
  WHERE thumb_path IS NOT NULL;
