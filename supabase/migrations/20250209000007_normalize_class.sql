-- ============================================================================
-- ForzaCars Rentals — Normalize car_models.class
-- Migration: 20250209000007_normalize_class
--
-- The "class" column on car_models was never populated by the import script.
-- Filtering by class (S1, S2, etc.) therefore returned 0 rows.
--
-- This migration:
--   1. Derives class from stat_pi for every row that has a PI value.
--   2. Normalises any legacy string-based class values (e.g. "S 2" → "S2").
--   3. Adds an index on class for fast exact-match queries.
--
-- Canonical values: D, C, B, A, S1, S2, X   (NULL when unknown)
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Derive class from stat_pi  (ground truth for scraped data)
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.car_models
SET class = CASE
  WHEN stat_pi >= 999 THEN 'X'
  WHEN stat_pi >= 901 THEN 'S2'
  WHEN stat_pi >= 801 THEN 'S1'
  WHEN stat_pi >= 701 THEN 'A'
  WHEN stat_pi >= 601 THEN 'B'
  WHEN stat_pi >= 501 THEN 'C'
  ELSE 'D'
END
WHERE stat_pi IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Normalise existing string-based class values (legacy / manual rows)
--
--    Handles variants like 'S 2', 's-2', 'S_1', '  b  ', etc.
--    Unknown / un-mappable values are set to NULL.
-- ────────────────────────────────────────────────────────────────────────────

UPDATE public.car_models
SET class = (
  CASE upper(trim(regexp_replace(class, '[\s\-_]+', '', 'g')))
    WHEN 'D'  THEN 'D'
    WHEN 'C'  THEN 'C'
    WHEN 'B'  THEN 'B'
    WHEN 'A'  THEN 'A'
    WHEN 'S1' THEN 'S1'
    WHEN 'S2' THEN 'S2'
    WHEN 'X'  THEN 'X'
    ELSE NULL          -- unknown → NULL
  END
)
WHERE stat_pi IS NULL
  AND class IS NOT NULL
  AND class NOT IN ('D', 'C', 'B', 'A', 'S1', 'S2', 'X');


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Index for fast exact-match filtering  (class = 'S2')
-- ────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_car_models_class
  ON public.car_models (class)
  WHERE class IS NOT NULL;

COMMENT ON COLUMN public.car_models.class IS
  'Canonical performance class derived from stat_pi: D, C, B, A, S1, S2, X. '
  'Populated by the import script and the 20250209000007 migration.';
