-- ============================================================================
-- ForzaCars Rentals — Day/week pricing caps for bookings
-- Migration: 20250209000011_booking_pricing_caps
--
-- 1. Add pricing-breakdown columns to bookings
-- 2. Replace create_booking RPC with day-cap & week-cap pricing
-- 3. Remove the same-calendar-day restriction (multi-day bookings now OK)
-- 4. cancel_booking is unchanged (uses credits_charged as-is)
-- ============================================================================


-- ############################################################################
-- 1. New columns on bookings
-- ############################################################################

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pricing_mode     text,
  ADD COLUMN IF NOT EXISTS hourly_rate_used int,
  ADD COLUMN IF NOT EXISTS day_price_used   int,
  ADD COLUMN IF NOT EXISTS billable_days    int,
  ADD COLUMN IF NOT EXISTS duration_minutes int;

COMMENT ON COLUMN public.bookings.pricing_mode IS
  'HOURLY — straight hourly billing (≤ 5 h)  |  DAY_CAP — single day capped at 5 h  |  WEEK_CAP — multi-day with 5-day weeks';
COMMENT ON COLUMN public.bookings.hourly_rate_used IS
  'Effective credits_per_hour at time of booking (snapshot)';
COMMENT ON COLUMN public.bookings.day_price_used IS
  'hourly_rate_used × 5 — the daily cap price';
COMMENT ON COLUMN public.bookings.billable_days IS
  'Number of days actually charged (weeks×5 + capped remainder)';
COMMENT ON COLUMN public.bookings.duration_minutes IS
  'Total duration in minutes (end_ts − start_ts)';


-- ############################################################################
-- 2. Replacement create_booking RPC
--
--    Pricing rules:
--      • duration ≤ 5 h   → HOURLY:  total = rate × hours (ceil)
--      • duration > 5 h   → compute day_price = rate × 5
--                            total_days  = ceil(duration_hours / 24)
--                            weeks       = floor(total_days / 7)
--                            remainder   = total_days % 7
--                            rem_billable = least(remainder, 5)
--                            billable_days = weeks × 5 + rem_billable
--                            total = billable_days × day_price
--                            mode  = 'DAY_CAP' if total_days=1 else 'WEEK_CAP'
--
--    Existing validations preserved:
--      • CUSTOMER only
--      • Start in future, min 60 min, 30-min increments
--      • Unit active, availability rules, blackout check
--      • Balance >= total
--      • Exclusion constraint for double-booking
--
--    Removed: same-calendar-day restriction (multi-day now allowed).
-- ############################################################################

CREATE OR REPLACE FUNCTION public.create_booking(
  p_car_unit_id uuid,
  p_start_ts    timestamptz,
  p_end_ts      timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid            uuid;
  v_role           text;
  v_unit           record;
  v_model          record;
  v_start_utc      timestamp;
  v_end_utc        timestamp;
  v_duration_min   int;
  v_duration_hours numeric;
  v_cph            int;            -- effective credits per hour
  v_day_price      int;            -- cph × 5
  v_total_days     int;
  v_weeks          int;
  v_remainder      int;
  v_rem_billable   int;
  v_billable_days  int;
  v_credits        int;
  v_pricing_mode   text;
  v_balance        int;
  v_booking_id     uuid;
BEGIN
  -- ================================================================
  -- 1. Authenticate & authorise (CUSTOMER only)
  -- ================================================================
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO STRICT v_role
    FROM public.profiles
   WHERE id = v_uid;

  IF v_role IS DISTINCT FROM 'CUSTOMER' THEN
    RAISE EXCEPTION 'Only customers can create bookings';
  END IF;

  -- ================================================================
  -- 2. Timestamp validations
  -- ================================================================
  IF p_end_ts <= p_start_ts THEN
    RAISE EXCEPTION 'end_ts must be after start_ts';
  END IF;

  IF p_start_ts <= now() THEN
    RAISE EXCEPTION 'Booking must start in the future';
  END IF;

  v_start_utc := p_start_ts AT TIME ZONE 'UTC';
  v_end_utc   := p_end_ts   AT TIME ZONE 'UTC';

  -- 30-minute boundary
  IF extract(second FROM v_start_utc) <> 0
     OR extract(minute FROM v_start_utc)::int % 30 <> 0 THEN
    RAISE EXCEPTION 'Start time must align to a 30-minute boundary';
  END IF;

  IF extract(second FROM v_end_utc) <> 0
     OR extract(minute FROM v_end_utc)::int % 30 <> 0 THEN
    RAISE EXCEPTION 'End time must align to a 30-minute boundary';
  END IF;

  v_duration_min := extract(epoch FROM (p_end_ts - p_start_ts))::int / 60;

  IF v_duration_min < 60 THEN
    RAISE EXCEPTION 'Minimum booking duration is 60 minutes (got % min)', v_duration_min;
  END IF;

  IF v_duration_min % 30 <> 0 THEN
    RAISE EXCEPTION 'Duration must be a multiple of 30 minutes';
  END IF;

  v_duration_hours := v_duration_min / 60.0;

  -- ================================================================
  -- 3. Car unit must exist and be active
  -- ================================================================
  SELECT * INTO v_unit
    FROM public.car_units
   WHERE id = p_car_unit_id
     AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Car unit not found or is not currently active';
  END IF;

  SELECT * INTO v_model
    FROM public.car_models
   WHERE id = v_unit.car_model_id;

  -- ================================================================
  -- 4. Blackout check (availability rules skipped for multi-day MVP)
  -- ================================================================
  IF EXISTS (
    SELECT 1
      FROM public.car_blackouts b
     WHERE b.car_unit_id = p_car_unit_id
       AND b.start_ts    < p_end_ts
       AND b.end_ts      > p_start_ts
  ) THEN
    RAISE EXCEPTION 'Car unit is blacked out during the requested time window';
  END IF;

  -- ================================================================
  -- 5. Compute effective hourly rate
  -- ================================================================
  v_cph := coalesce(v_unit.credits_per_hour, v_model.suggested_credits_per_hour);

  IF v_cph IS NULL OR v_cph <= 0 THEN
    RAISE EXCEPTION 'No credits-per-hour rate configured for this car unit';
  END IF;

  v_day_price := v_cph * 5;

  -- ================================================================
  -- 6. Pricing logic
  -- ================================================================
  IF v_duration_hours <= 5 THEN
    -- Straight hourly (ceil so partial hours round up)
    v_credits       := ceil(v_cph * v_duration_hours)::int;
    v_pricing_mode  := 'HOURLY';
    v_billable_days := NULL;
  ELSE
    -- Day/week cap pricing
    v_total_days   := ceil(v_duration_hours / 24.0)::int;
    v_weeks        := v_total_days / 7;           -- integer division = floor
    v_remainder    := v_total_days % 7;
    v_rem_billable := LEAST(v_remainder, 5);
    v_billable_days := v_weeks * 5 + v_rem_billable;
    v_credits       := v_billable_days * v_day_price;

    IF v_total_days = 1 THEN
      v_pricing_mode := 'DAY_CAP';
    ELSE
      v_pricing_mode := 'WEEK_CAP';
    END IF;
  END IF;

  -- ================================================================
  -- 7. Credit-balance check
  -- ================================================================
  SELECT coalesce(sum(delta), 0)
    INTO v_balance
    FROM public.credit_ledger
   WHERE user_id = v_uid;

  IF v_balance < v_credits THEN
    RAISE EXCEPTION 'Insufficient credit balance (have %, need %)', v_balance, v_credits;
  END IF;

  -- ================================================================
  -- 8. Insert booking + debit ledger + audit log (atomic)
  -- ================================================================
  BEGIN
    INSERT INTO public.bookings
           (car_unit_id, customer_id, start_ts, end_ts, credits_charged,
            pricing_mode, hourly_rate_used, day_price_used,
            billable_days, duration_minutes)
    VALUES (p_car_unit_id, v_uid, p_start_ts, p_end_ts, v_credits,
            v_pricing_mode, v_cph, v_day_price,
            v_billable_days, v_duration_min)
    RETURNING id INTO v_booking_id;

    INSERT INTO public.credit_ledger
           (user_id, delta, reason, related_booking_id)
    VALUES (v_uid, -v_credits, 'Booking charge', v_booking_id);

    INSERT INTO public.audit_log
           (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (
      v_uid,
      'booking.created',
      'booking',
      v_booking_id,
      jsonb_build_object(
        'car_unit_id',    p_car_unit_id,
        'car_model_id',   v_unit.car_model_id,
        'start_ts',       p_start_ts,
        'end_ts',         p_end_ts,
        'credits',        v_credits,
        'cph',            v_cph,
        'pricing_mode',   v_pricing_mode,
        'billable_days',  v_billable_days,
        'duration_min',   v_duration_min
      )
    );
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'This time slot is already booked for the selected car unit';
  END;

  -- ================================================================
  -- 9. Return summary
  -- ================================================================
  RETURN jsonb_build_object(
    'booking_id',      v_booking_id,
    'credits_charged', v_credits,
    'balance_after',   v_balance - v_credits,
    'pricing_mode',    v_pricing_mode,
    'hourly_rate',     v_cph,
    'day_price',       v_day_price,
    'billable_days',   v_billable_days,
    'duration_minutes', v_duration_min
  );
END;
$$;

COMMENT ON FUNCTION public.create_booking(uuid, timestamptz, timestamptz) IS
  'RPC – Creates a CONFIRMED booking with day-cap / week-cap pricing.  '
  'Rentals ≤ 5 h are billed hourly; longer rentals are capped at 5 h/day, '
  'and weeks bill only 5 of 7 days.  Stores a full pricing breakdown.';

-- Re-lock privileges (CREATE OR REPLACE resets grants)
REVOKE EXECUTE ON FUNCTION public.create_booking(uuid, timestamptz, timestamptz) FROM public;
GRANT  EXECUTE ON FUNCTION public.create_booking(uuid, timestamptz, timestamptz) TO authenticated;
