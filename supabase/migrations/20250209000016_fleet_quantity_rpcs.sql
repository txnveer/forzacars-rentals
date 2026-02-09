-- ============================================================================
-- ForzaCars Rentals — Fleet Quantity Management RPCs
-- Migration: 20250209000016_fleet_quantity_rpcs
--
-- Provides RPCs for business users to manage their fleet quantities.
-- ============================================================================

-- ############################################################################
-- 1. business_add_model_to_fleet
--    Adds a car model to the business fleet with initial units.
-- ############################################################################

CREATE OR REPLACE FUNCTION public.business_add_model_to_fleet(
  p_car_model_id     uuid,
  p_quantity         int,
  p_color            text,
  p_color_hex        text DEFAULT NULL,
  p_credits_per_hour int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         uuid;
  v_role        text;
  v_business_id uuid;
  v_model       record;
  v_unit_ids    uuid[] := '{}';
  v_new_id      uuid;
  v_i           int;
BEGIN
  -- ==================================================================
  -- 1. Authenticate & authorise (BUSINESS only)
  -- ==================================================================
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, business_id
    INTO STRICT v_role, v_business_id
    FROM public.profiles
   WHERE id = v_uid;

  IF v_role IS DISTINCT FROM 'BUSINESS' THEN
    RAISE EXCEPTION 'Only business users can manage fleet';
  END IF;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Business user must be associated with a business';
  END IF;

  -- ==================================================================
  -- 2. Validate inputs
  -- ==================================================================
  IF p_quantity < 1 OR p_quantity > 100 THEN
    RAISE EXCEPTION 'Quantity must be between 1 and 100';
  END IF;

  IF p_color IS NULL OR trim(p_color) = '' THEN
    RAISE EXCEPTION 'Color is required';
  END IF;

  -- Verify model exists
  SELECT * INTO v_model
    FROM public.car_models
   WHERE id = p_car_model_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Car model not found';
  END IF;

  -- Check if business already has units of this model
  IF EXISTS (
    SELECT 1 FROM public.car_units
     WHERE business_id = v_business_id
       AND car_model_id = p_car_model_id
       AND active = true
  ) THEN
    RAISE EXCEPTION 'Model already in fleet. Use adjust quantity instead.';
  END IF;

  -- ==================================================================
  -- 3. Create units
  -- ==================================================================
  FOR v_i IN 1..p_quantity LOOP
    INSERT INTO public.car_units (
      business_id,
      car_model_id,
      color,
      color_hex,
      credits_per_hour,
      active
    ) VALUES (
      v_business_id,
      p_car_model_id,
      trim(p_color),
      p_color_hex,
      p_credits_per_hour,
      true
    )
    RETURNING id INTO v_new_id;
    
    v_unit_ids := v_unit_ids || v_new_id;
  END LOOP;

  -- ==================================================================
  -- 4. Audit log
  -- ==================================================================
  INSERT INTO public.audit_log (
    actor_user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    v_uid,
    'fleet.model_added',
    'car_model',
    p_car_model_id,
    jsonb_build_object(
      'business_id', v_business_id,
      'quantity', p_quantity,
      'color', trim(p_color),
      'credits_per_hour', p_credits_per_hour,
      'unit_ids', v_unit_ids
    )
  );

  RETURN jsonb_build_object(
    'car_model_id', p_car_model_id,
    'quantity', p_quantity,
    'unit_ids', v_unit_ids
  );
END;
$$;

COMMENT ON FUNCTION public.business_add_model_to_fleet(uuid, int, text, text, int) IS
  'RPC – BUSINESS-only. Adds a car model to the business fleet with initial units.';


-- ############################################################################
-- 2. business_adjust_quantity
--    Adjusts the quantity of units for a model in the business fleet.
-- ############################################################################

CREATE OR REPLACE FUNCTION public.business_adjust_quantity(
  p_car_model_id uuid,
  p_new_qty      int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid            uuid;
  v_role           text;
  v_business_id    uuid;
  v_current_qty    int;
  v_active_units   uuid[];
  v_units_to_add   int;
  v_units_to_remove int;
  v_sample_unit    record;
  v_new_id         uuid;
  v_added_ids      uuid[] := '{}';
  v_removed_ids    uuid[] := '{}';
  v_unit_id        uuid;
  v_has_booking    boolean;
  v_removed_count  int := 0;
BEGIN
  -- ==================================================================
  -- 1. Authenticate & authorise (BUSINESS only)
  -- ==================================================================
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, business_id
    INTO STRICT v_role, v_business_id
    FROM public.profiles
   WHERE id = v_uid;

  IF v_role IS DISTINCT FROM 'BUSINESS' THEN
    RAISE EXCEPTION 'Only business users can manage fleet';
  END IF;

  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'Business user must be associated with a business';
  END IF;

  -- ==================================================================
  -- 2. Validate inputs
  -- ==================================================================
  IF p_new_qty < 0 OR p_new_qty > 100 THEN
    RAISE EXCEPTION 'Quantity must be between 0 and 100';
  END IF;

  -- Get current active units for this model
  SELECT array_agg(id), count(*)::int
    INTO v_active_units, v_current_qty
    FROM public.car_units
   WHERE business_id = v_business_id
     AND car_model_id = p_car_model_id
     AND active = true;

  v_current_qty := COALESCE(v_current_qty, 0);
  v_active_units := COALESCE(v_active_units, '{}');

  IF v_current_qty = 0 AND p_new_qty > 0 THEN
    RAISE EXCEPTION 'Model not in fleet. Use add model to fleet first.';
  END IF;

  IF p_new_qty = v_current_qty THEN
    RETURN jsonb_build_object(
      'car_model_id', p_car_model_id,
      'previous_qty', v_current_qty,
      'new_qty', p_new_qty,
      'added_ids', '[]'::jsonb,
      'removed_ids', '[]'::jsonb,
      'message', 'No change needed'
    );
  END IF;

  -- ==================================================================
  -- 3. Adjust quantity
  -- ==================================================================
  
  IF p_new_qty > v_current_qty THEN
    -- INCREASING: Add new units
    v_units_to_add := p_new_qty - v_current_qty;
    
    -- Get a sample unit to copy color from
    SELECT * INTO v_sample_unit
      FROM public.car_units
     WHERE business_id = v_business_id
       AND car_model_id = p_car_model_id
       AND active = true
     LIMIT 1;
    
    FOR v_i IN 1..v_units_to_add LOOP
      INSERT INTO public.car_units (
        business_id,
        car_model_id,
        color,
        color_hex,
        credits_per_hour,
        active
      ) VALUES (
        v_business_id,
        p_car_model_id,
        COALESCE(v_sample_unit.color, 'Unspecified'),
        v_sample_unit.color_hex,
        v_sample_unit.credits_per_hour,
        true
      )
      RETURNING id INTO v_new_id;
      
      v_added_ids := v_added_ids || v_new_id;
    END LOOP;
    
  ELSE
    -- DECREASING: Deactivate units (never delete, just set active=false)
    v_units_to_remove := v_current_qty - p_new_qty;
    
    -- Iterate through units and deactivate those without future bookings
    FOR v_unit_id IN SELECT unnest(v_active_units) LOOP
      EXIT WHEN v_removed_count >= v_units_to_remove;
      
      -- Check if unit has any future CONFIRMED bookings
      SELECT EXISTS (
        SELECT 1 FROM public.bookings
         WHERE car_unit_id = v_unit_id
           AND status = 'CONFIRMED'
           AND end_ts > now()
      ) INTO v_has_booking;
      
      IF NOT v_has_booking THEN
        UPDATE public.car_units
           SET active = false,
               updated_at = now()
         WHERE id = v_unit_id;
        
        v_removed_ids := v_removed_ids || v_unit_id;
        v_removed_count := v_removed_count + 1;
      END IF;
    END LOOP;
    
    -- Check if we couldn't remove enough
    IF v_removed_count < v_units_to_remove THEN
      RAISE EXCEPTION 'Cannot reduce to % units. % units have future bookings.',
        p_new_qty, (v_units_to_remove - v_removed_count);
    END IF;
  END IF;

  -- ==================================================================
  -- 4. Audit log
  -- ==================================================================
  INSERT INTO public.audit_log (
    actor_user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    v_uid,
    'fleet.quantity_adjusted',
    'car_model',
    p_car_model_id,
    jsonb_build_object(
      'business_id', v_business_id,
      'previous_qty', v_current_qty,
      'new_qty', p_new_qty,
      'added_ids', v_added_ids,
      'removed_ids', v_removed_ids
    )
  );

  RETURN jsonb_build_object(
    'car_model_id', p_car_model_id,
    'previous_qty', v_current_qty,
    'new_qty', p_new_qty,
    'added_ids', v_added_ids,
    'removed_ids', v_removed_ids
  );
END;
$$;

COMMENT ON FUNCTION public.business_adjust_quantity(uuid, int) IS
  'RPC – BUSINESS-only. Adjusts unit quantity for a model. Cannot deactivate units with future bookings.';


-- ############################################################################
-- 3. EXECUTE privilege lockdown
-- ############################################################################

REVOKE EXECUTE ON FUNCTION public.business_add_model_to_fleet(uuid, int, text, text, int) FROM public;
GRANT  EXECUTE ON FUNCTION public.business_add_model_to_fleet(uuid, int, text, text, int) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.business_adjust_quantity(uuid, int) FROM public;
GRANT  EXECUTE ON FUNCTION public.business_adjust_quantity(uuid, int) TO authenticated;
