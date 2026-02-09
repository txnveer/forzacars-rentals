-- ============================================================================
-- ForzaCars Rentals — Updated RPCs for car_units
-- Migration: 20250209000006_car_inventory_rpcs
--
-- Replaces create_booking to use car_unit_id instead of car_id.
-- cancel_booking and admin_grant_credits are unchanged in signature
-- but cancel_booking's internal column reference is now car_unit_id
-- (the booking row itself was already migrated by 0004).
-- ============================================================================


-- ############################################################################
-- 1. create_booking  (REPLACES the old version — same signature: uuid,tz,tz)
--
--    Parameter renamed: p_car_id → p_car_unit_id
--    Because Postgres signatures are type-based (uuid,tz,tz), CREATE OR
--    REPLACE works without dropping the old function.
-- ############################################################################

create or replace function public.create_booking(
  p_car_unit_id uuid,
  p_start_ts    timestamptz,
  p_end_ts      timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid;
  v_role         text;
  v_unit         record;          -- car_units row
  v_model        record;          -- car_models row
  v_start_utc    timestamp;
  v_end_utc      timestamp;
  v_dow          int;
  v_duration_min int;
  v_cph          int;             -- effective credits_per_hour
  v_credits      int;
  v_balance      int;
  v_booking_id   uuid;
begin
  -- ==================================================================
  -- 1. Authenticate & authorise (CUSTOMER only)
  -- ==================================================================
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role into strict v_role
    from public.profiles
   where id = v_uid;

  if v_role is distinct from 'CUSTOMER' then
    raise exception 'Only customers can create bookings';
  end if;

  -- ==================================================================
  -- 2. Timestamp validations
  -- ==================================================================
  if p_end_ts <= p_start_ts then
    raise exception 'end_ts must be after start_ts';
  end if;

  if p_start_ts <= now() then
    raise exception 'Booking must start in the future';
  end if;

  v_start_utc := p_start_ts at time zone 'UTC';
  v_end_utc   := p_end_ts   at time zone 'UTC';

  -- 30-minute boundary check
  if extract(second from v_start_utc) <> 0
     or extract(minute from v_start_utc)::int % 30 <> 0 then
    raise exception 'Start time must align to a 30-minute boundary';
  end if;

  if extract(second from v_end_utc) <> 0
     or extract(minute from v_end_utc)::int % 30 <> 0 then
    raise exception 'End time must align to a 30-minute boundary';
  end if;

  v_duration_min := extract(epoch from (p_end_ts - p_start_ts))::int / 60;

  if v_duration_min < 60 then
    raise exception 'Minimum booking duration is 60 minutes (got % min)', v_duration_min;
  end if;

  if v_duration_min % 30 <> 0 then
    raise exception 'Duration must be a multiple of 30 minutes';
  end if;

  if v_start_utc::date <> v_end_utc::date then
    raise exception 'Booking must start and end on the same calendar day (UTC)';
  end if;

  v_dow := extract(dow from v_start_utc)::int;

  -- ==================================================================
  -- 3. Car unit must exist and be active
  -- ==================================================================
  select * into v_unit
    from public.car_units
   where id = p_car_unit_id
     and active = true;

  if not found then
    raise exception 'Car unit not found or is not currently active';
  end if;

  -- Fetch the parent model for credits fallback
  select * into v_model
    from public.car_models
   where id = v_unit.car_model_id;

  -- ==================================================================
  -- 4. Availability rules (now per car_unit_id)
  -- ==================================================================
  if not exists (
    select 1
      from public.car_availability_rules r
     where r.car_unit_id  = p_car_unit_id
       and r.day_of_week  = v_dow
       and r.start_time  <= v_start_utc::time
       and r.end_time    >= v_end_utc::time
  ) then
    raise exception 'Car unit is not available during the requested time window';
  end if;

  -- ==================================================================
  -- 5. Blackout check (now per car_unit_id)
  -- ==================================================================
  if exists (
    select 1
      from public.car_blackouts b
     where b.car_unit_id = p_car_unit_id
       and b.start_ts    < p_end_ts
       and b.end_ts      > p_start_ts
  ) then
    raise exception 'Car unit is blacked out during the requested time window';
  end if;

  -- ==================================================================
  -- 6. Compute credits
  --    Effective rate: coalesce(unit override, model suggested)
  -- ==================================================================
  v_cph := coalesce(v_unit.credits_per_hour, v_model.suggested_credits_per_hour);

  if v_cph is null or v_cph <= 0 then
    raise exception 'No credits-per-hour rate configured for this car unit';
  end if;

  v_credits := ceil(v_cph * (v_duration_min / 60.0))::int;

  -- ==================================================================
  -- 7. Credit-balance check
  -- ==================================================================
  select coalesce(sum(delta), 0)
    into v_balance
    from public.credit_ledger
   where user_id = v_uid;

  if v_balance < v_credits then
    raise exception 'Insufficient credit balance (have %, need %)', v_balance, v_credits;
  end if;

  -- ==================================================================
  -- 8. Insert booking + debit ledger + audit log  (atomic)
  -- ==================================================================
  begin
    insert into public.bookings
           (car_unit_id, customer_id, start_ts, end_ts, credits_charged)
    values (p_car_unit_id, v_uid, p_start_ts, p_end_ts, v_credits)
    returning id into v_booking_id;

    insert into public.credit_ledger
           (user_id, delta, reason, related_booking_id)
    values (v_uid, -v_credits, 'Booking charge', v_booking_id);

    insert into public.audit_log
           (actor_user_id, action, entity_type, entity_id, metadata)
    values (
      v_uid,
      'booking.created',
      'booking',
      v_booking_id,
      jsonb_build_object(
        'car_unit_id', p_car_unit_id,
        'car_model_id', v_unit.car_model_id,
        'start_ts',     p_start_ts,
        'end_ts',       p_end_ts,
        'credits',      v_credits,
        'cph',          v_cph
      )
    );
  exception
    when exclusion_violation then
      raise exception 'This time slot is already booked for the selected car unit';
  end;

  return jsonb_build_object(
    'booking_id',      v_booking_id,
    'credits_charged', v_credits,
    'balance_after',   v_balance - v_credits
  );
end;
$$;

comment on function public.create_booking(uuid, timestamptz, timestamptz) is
  'RPC – Atomically creates a CONFIRMED booking on a specific car_unit, '
  'debits the customer''s credit balance, and writes an audit-log entry.  '
  'Credits rate = coalesce(car_units.credits_per_hour, car_models.suggested_credits_per_hour).';


-- ############################################################################
-- 2. cancel_booking — no signature change, but re-create to refresh body
--    (the booking row already has car_unit_id after the schema migration)
-- ############################################################################

create or replace function public.cancel_booking(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid;
  v_role          text;
  v_booking       record;
  v_hours_until   numeric;
  v_refund_pct    numeric;
  v_refund        int;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role into strict v_role
    from public.profiles
   where id = v_uid;

  select * into v_booking
    from public.bookings
   where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.customer_id <> v_uid
     and v_role is distinct from 'ADMIN' then
    raise exception 'Not authorised to cancel this booking';
  end if;

  if v_booking.status = 'CANCELED' then
    return jsonb_build_object(
      'booking_id', p_booking_id,
      'status',     'CANCELED',
      'refund',     0,
      'message',    'Booking was already canceled'
    );
  end if;

  v_hours_until := extract(epoch from (v_booking.start_ts - now())) / 3600.0;

  if v_hours_until > 6 then
    v_refund_pct := 1.0;
  elsif v_hours_until >= 1 then
    v_refund_pct := 0.5;
  else
    v_refund_pct := 0.0;
  end if;

  v_refund := floor(v_booking.credits_charged * v_refund_pct)::int;

  update public.bookings
     set status = 'CANCELED'
   where id = p_booking_id;

  if v_refund > 0 then
    insert into public.credit_ledger
           (user_id, delta, reason, related_booking_id)
    values (
      v_booking.customer_id,
      v_refund,
      format('Cancellation refund (%s%%)', (v_refund_pct * 100)::int),
      p_booking_id
    );
  end if;

  insert into public.audit_log
         (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_uid,
    'booking.canceled',
    'booking',
    p_booking_id,
    jsonb_build_object(
      'refund_credits',    v_refund,
      'refund_pct',        v_refund_pct,
      'hours_until_start', round(v_hours_until, 2),
      'car_unit_id',       v_booking.car_unit_id,
      'canceled_by',       case when v_booking.customer_id = v_uid
                                then 'customer' else 'admin' end
    )
  );

  return jsonb_build_object(
    'booking_id', p_booking_id,
    'status',     'CANCELED',
    'refund',     v_refund,
    'refund_pct', v_refund_pct
  );
end;
$$;


-- ############################################################################
-- 3. Privilege lockdown — ensure the new/replaced functions are locked
-- ############################################################################

revoke execute on function public.create_booking(uuid, timestamptz, timestamptz) from public;
grant  execute on function public.create_booking(uuid, timestamptz, timestamptz) to authenticated;

revoke execute on function public.cancel_booking(uuid) from public;
grant  execute on function public.cancel_booking(uuid) to authenticated;

-- VIN/plate generators — needed by car_units default, grant to authenticated
revoke execute on function public.generate_vin()   from public;
revoke execute on function public.generate_plate()  from public;
grant  execute on function public.generate_vin()    to authenticated;
grant  execute on function public.generate_plate()  to authenticated;
