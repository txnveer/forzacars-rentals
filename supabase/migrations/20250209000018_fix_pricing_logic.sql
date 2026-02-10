-- ============================================================================
-- ForzaCars Rentals — Fix day-rate cap pricing logic
-- Migration: 20250209000018_fix_pricing_logic
--
-- Pricing rules:
-- - Duration ≤ 5 hours: hourly rate (durationHours * hourlyRate)
-- - Duration 5-24 hours: day rate cap (hourlyRate * 5)
-- - Duration > 24 hours:
--     fullDays * dayRate + remainderCost
--     where remainderCost =
--       - 0 if remainder == 0
--       - remainder * hourlyRate if remainder <= 5
--       - dayRate if remainder > 5
-- ============================================================================


-- ############################################################################
-- Updated create_booking RPC with corrected pricing logic
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
  v_duration_hours int;            -- rounded up hours
  v_cph            int;            -- effective credits per hour
  v_day_price      int;            -- cph × 5
  v_full_days      int;
  v_remainder      int;
  v_remainder_cost int;
  v_billable_days  int;
  v_credits        int;
  v_pricing_mode   text;
  v_balance        int;
  v_booking_id     uuid;
  v_new_balance    int;
BEGIN
  -- ================================================================
  -- 1. Auth: only CUSTOMERs may book
  -- ================================================================
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO v_role
    FROM public.profiles
   WHERE id = v_uid;

  IF v_role IS NULL OR v_role <> 'CUSTOMER' THEN
    RAISE EXCEPTION 'Only customers may create bookings';
  END IF;

  -- ================================================================
  -- 2. Basic time validation
  -- ================================================================
  IF p_end_ts <= p_start_ts THEN
    RAISE EXCEPTION 'End time must be after start time';
  END IF;

  v_start_utc    := p_start_ts AT TIME ZONE 'UTC';
  v_end_utc      := p_end_ts   AT TIME ZONE 'UTC';
  v_duration_min := extract(epoch FROM (p_end_ts - p_start_ts))::int / 60;

  IF v_duration_min < 60 THEN
    RAISE EXCEPTION 'Minimum booking duration is 60 minutes';
  END IF;

  -- Round up to whole hours
  v_duration_hours := ceil(v_duration_min / 60.0)::int;

  -- ================================================================
  -- 3. Fetch and validate unit + model
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
  -- 4. Blackout check
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
  -- 5. Compute effective hourly rate and day rate
  -- ================================================================
  v_cph := coalesce(v_unit.credits_per_hour, v_model.suggested_credits_per_hour);

  IF v_cph IS NULL OR v_cph <= 0 THEN
    RAISE EXCEPTION 'No credits-per-hour rate configured for this car unit';
  END IF;

  v_day_price := v_cph * 5;

  -- ================================================================
  -- 6. Pricing logic (corrected)
  -- 
  -- Rules:
  -- - <= 5 hours: straight hourly
  -- - 5-24 hours: 1 day rate cap
  -- - > 24 hours: fullDays * dayRate + remainderCost
  --     remainderCost = 0 if remainder == 0
  --                   = remainder * hourly if remainder <= 5
  --                   = dayRate if remainder > 5
  -- ================================================================
  IF v_duration_hours <= 5 THEN
    -- Straight hourly pricing
    v_credits       := v_duration_hours * v_cph;
    v_pricing_mode  := 'HOURLY';
    v_billable_days := NULL;
    v_full_days     := 0;
    v_remainder     := v_duration_hours;
    v_remainder_cost := v_credits;
  ELSIF v_duration_hours <= 24 THEN
    -- Day cap applies (5-24 hours = 1 day)
    v_credits       := v_day_price;
    v_pricing_mode  := 'DAY_CAP';
    v_billable_days := 1;
    v_full_days     := 1;
    v_remainder     := 0;
    v_remainder_cost := 0;
  ELSE
    -- Multi-day pricing
    v_pricing_mode  := 'MULTI_DAY';
    v_full_days     := v_duration_hours / 24;  -- integer division = floor
    v_remainder     := v_duration_hours % 24;

    IF v_remainder = 0 THEN
      v_remainder_cost := 0;
    ELSIF v_remainder <= 5 THEN
      v_remainder_cost := v_remainder * v_cph;
    ELSE
      -- Remainder > 5 hours gets capped at day rate
      v_remainder_cost := v_day_price;
    END IF;

    v_credits := v_full_days * v_day_price + v_remainder_cost;
    
    -- Calculate billable days for display
    IF v_remainder = 0 THEN
      v_billable_days := v_full_days;
    ELSIF v_remainder > 5 THEN
      v_billable_days := v_full_days + 1;
    ELSE
      v_billable_days := v_full_days;  -- partial day charged hourly
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

    INSERT INTO public.credit_ledger (user_id, delta, reason)
    VALUES (v_uid, -v_credits,
            format('Booking %s: %s → %s', v_booking_id, v_start_utc, v_end_utc));

    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (v_uid, 'booking.created', 'booking', v_booking_id,
      jsonb_build_object(
        'car_unit_id',     p_car_unit_id,
        'start_ts',        v_start_utc,
        'end_ts',          v_end_utc,
        'duration_hours',  v_duration_hours,
        'pricing_mode',    v_pricing_mode,
        'hourly_rate',     v_cph,
        'day_price',       v_day_price,
        'full_days',       v_full_days,
        'remainder_hours', v_remainder,
        'remainder_cost',  v_remainder_cost,
        'credits_charged', v_credits
    ));
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'This car unit is already booked during the requested time window';
  END;

  -- Compute new balance
  SELECT coalesce(sum(delta), 0)
    INTO v_new_balance
    FROM public.credit_ledger
   WHERE user_id = v_uid;

  RETURN jsonb_build_object(
    'booking_id',       v_booking_id,
    'credits_charged',  v_credits,
    'balance_after',    v_new_balance,
    'pricing_mode',     v_pricing_mode,
    'duration_hours',   v_duration_hours,
    'hourly_rate',      v_cph,
    'day_rate',         v_day_price,
    'full_days',        v_full_days,
    'remainder_hours',  v_remainder,
    'remainder_cost',   v_remainder_cost
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_booking(uuid, timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.create_booking IS 
  'Creates a booking with corrected day-rate cap pricing. '
  'Durations <= 5h are hourly, 5-24h are 1 day rate, >24h use fullDays * dayRate + remainder.';
