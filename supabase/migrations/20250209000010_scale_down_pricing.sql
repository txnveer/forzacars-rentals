-- ============================================================================
-- ForzaCars Rentals — Scale down suggested pricing
-- Migration: 20250209000010_scale_down_pricing
--
-- The original pricing heuristic mapped cars to [50, 300] cr/hr which felt
-- 3–4× too high for the game-themed economy.  This migration:
--
--   1. Scales existing suggested_credits_per_hour by 0.30
--   2. Rounds to nearest 5 for cleaner price points at the lower range
--   3. Clamps to [10, 100] cr/hr
--
-- Rationale for [10, 100]:
--   • 10 cr/hr — floor for the lowest-PI economy cars (D class)
--   • 100 cr/hr — ceiling for exotics / X class; keeps credits meaningful
--   • The 10× spread mirrors the old 50–300 spread proportionally
--   • Businesses can still override per unit if they want higher prices
-- ============================================================================

UPDATE public.car_models
SET
  suggested_credits_per_hour = GREATEST(10, LEAST(100,
    round(suggested_credits_per_hour * 0.30 / 5.0) * 5
  )),
  updated_at = now()
WHERE suggested_credits_per_hour IS NOT NULL;
