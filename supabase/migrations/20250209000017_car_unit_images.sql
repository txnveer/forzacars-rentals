-- ============================================================================
-- ForzaCars Rentals — Car Unit Images
-- Migration: 20250209000017_car_unit_images
--
-- Adds image storage fields to car_units and updated_at trigger.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add new columns to car_units table
-- ---------------------------------------------------------------------------

ALTER TABLE public.car_units
  ADD COLUMN IF NOT EXISTS image_path text NULL,
  ADD COLUMN IF NOT EXISTS thumb_path text NULL;

-- Ensure updated_at column exists (it should from schema, but be safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'car_units' 
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.car_units 
      ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Trigger to auto-update updated_at on row modification
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_car_units_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

-- Drop trigger if exists (idempotent re-runs)
DROP TRIGGER IF EXISTS on_car_units_updated ON public.car_units;

CREATE TRIGGER on_car_units_updated
  BEFORE UPDATE ON public.car_units
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_car_units_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Comments
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.car_units.image_path IS
  'Path to original image in car-images bucket, e.g. originals/{business_id}/{unit_id}.jpg';

COMMENT ON COLUMN public.car_units.thumb_path IS
  'Path to thumbnail in car-images bucket, e.g. thumbs/{business_id}/{unit_id}.webp';
