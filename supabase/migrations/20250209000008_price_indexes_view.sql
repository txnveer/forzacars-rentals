-- ============================================================================
-- ForzaCars Rentals — Price filtering support
-- Migration: 20250209000008_price_indexes_view
--
-- 1. Composite indexes for starting-price computation & availability queries
-- 2. car_models_with_price VIEW  (adds starting_price column)
-- ============================================================================


-- ############################################################################
-- 1. Performance indexes
-- ############################################################################

-- car_units: covers the starting-price subquery  (WHERE car_model_id = ? AND active)
CREATE INDEX IF NOT EXISTS idx_car_units_model_active
  ON public.car_units (car_model_id)
  WHERE active = true;

-- bookings: covers availability overlap checks  (WHERE car_unit_id = ? AND status = 'CONFIRMED')
CREATE INDEX IF NOT EXISTS idx_bookings_unit_confirmed
  ON public.bookings (car_unit_id, start_ts, end_ts)
  WHERE status = 'CONFIRMED';

-- car_blackouts: covers blackout overlap checks  (WHERE car_unit_id = ?)
CREATE INDEX IF NOT EXISTS idx_car_blackouts_unit_time
  ON public.car_blackouts (car_unit_id, start_ts, end_ts);


-- ############################################################################
-- 2. VIEW: car_models_with_price
--
-- starting_price = cheapest effective hourly rate among active units,
-- falling back to the model's suggested_credits_per_hour when no units exist.
--
-- effective_price per unit = COALESCE(unit override, model suggestion).
-- ############################################################################

CREATE OR REPLACE VIEW public.car_models_with_price
WITH (security_invoker = true) AS
SELECT
  cm.*,
  COALESCE(
    (SELECT MIN(COALESCE(cu.credits_per_hour, cm.suggested_credits_per_hour))
     FROM public.car_units cu
     WHERE cu.car_model_id = cm.id
       AND cu.active = true),
    cm.suggested_credits_per_hour
  ) AS starting_price
FROM public.car_models cm;

-- Grant SELECT so PostgREST / Supabase client can query the view
GRANT SELECT ON public.car_models_with_price TO anon, authenticated;

COMMENT ON VIEW public.car_models_with_price IS
  'Read-only view over car_models that adds starting_price — the cheapest '
  'effective hourly rate across active units, with fallback to suggested price.';
