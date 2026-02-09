-- ============================================================================
-- ForzaCars Rentals — "Available now" server-side filtering
-- Migration: 20250209000009_available_now
--
-- 1. SECURITY DEFINER function: available_unit_count(model_id)
--    Counts active units with no overlapping CONFIRMED booking or blackout
--    at the current moment.  Runs as owner to bypass RLS on bookings
--    (customers can only see their own bookings, but we need to check ALL).
--
-- 2. Update car_models_with_price view to expose the count.
-- ============================================================================


-- ############################################################################
-- 1. available_unit_count(model_id)
-- ############################################################################

CREATE OR REPLACE FUNCTION public.available_unit_count(p_model_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT count(*)::int
  FROM public.car_units cu
  WHERE cu.car_model_id = p_model_id
    AND cu.active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.car_unit_id = cu.id
        AND b.status = 'CONFIRMED'
        AND b.start_ts <= now()
        AND b.end_ts > now()
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.car_blackouts cb
      WHERE cb.car_unit_id = cu.id
        AND cb.start_ts <= now()
        AND cb.end_ts > now()
    );
$$;

GRANT EXECUTE ON FUNCTION public.available_unit_count(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.available_unit_count(uuid) IS
  'Returns the number of currently-available car_units for a given car_model. '
  'A unit is available if active, not in a confirmed booking, and not blacked out. '
  'SECURITY DEFINER so it sees all bookings regardless of the caller''s RLS context.';


-- ############################################################################
-- 2. Extend the view with available_unit_count
--
-- CREATE OR REPLACE VIEW allows adding new columns at the end.
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
  ) AS starting_price,
  public.available_unit_count(cm.id) AS available_unit_count
FROM public.car_models cm;

-- Re-grant (view was replaced)
GRANT SELECT ON public.car_models_with_price TO anon, authenticated;
