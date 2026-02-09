-- ============================================================================
-- ForzaCars Rentals — RPC Functions
-- Migration: 20250209000002_rpc_functions
--
-- All three functions use SECURITY DEFINER so they can write to tables that
-- have no client INSERT/UPDATE/DELETE RLS policies (bookings, credit_ledger,
-- audit_log).  Each function manually verifies the caller's role before
-- doing anything.
--
-- search_path is locked to '' and every reference is schema-qualified to
-- prevent search-path hijacking.
-- ============================================================================


-- ############################################################################
-- 1. create_booking
--    Called by CUSTOMER to reserve a car.
-- ############################################################################

create or replace function public.create_booking(
  p_car_id   uuid,
  p_start_ts timestamptz,
  p_end_ts   timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid;
  v_role         text;
  v_car          record;
  v_start_utc    timestamp;    -- p_start_ts converted to UTC (no tz)
  v_end_utc      timestamp;    -- p_end_ts   converted to UTC (no tz)
  v_dow          int;          -- day-of-week 0 = Sun … 6 = Sat
  v_duration_min int;
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

  -- Convert to UTC for all date/time component checks so behaviour
  -- is deterministic regardless of the session timezone.
  v_start_utc := p_start_ts at time zone 'UTC';
  v_end_utc   := p_end_ts   at time zone 'UTC';

  -- 30-minute boundary check (minutes ∈ {0, 30}, seconds = 0)
  if extract(second from v_start_utc) <> 0
     or extract(minute from v_start_utc)::int % 30 <> 0 then
    raise exception 'Start time must align to a 30-minute boundary (e.g. 14:00, 14:30)';
  end if;

  if extract(second from v_end_utc) <> 0
     or extract(minute from v_end_utc)::int % 30 <> 0 then
    raise exception 'End time must align to a 30-minute boundary (e.g. 15:00, 15:30)';
  end if;

  -- Duration in whole minutes
  v_duration_min := extract(epoch from (p_end_ts - p_start_ts))::int / 60;

  if v_duration_min < 60 then
    raise exception 'Minimum booking duration is 60 minutes (got % min)', v_duration_min;
  end if;

  -- Redundant after the boundary checks above, but defence-in-depth
  if v_duration_min % 30 <> 0 then
    raise exception 'Duration must be a multiple of 30 minutes';
  end if;

  -- MVP constraint: booking must start and end on the same UTC calendar day
  -- so the availability-rule check below can use a single day_of_week value.
  if v_start_utc::date <> v_end_utc::date then
    raise exception 'Booking must start and end on the same calendar day (UTC)';
  end if;

  v_dow := extract(dow from v_start_utc)::int;  -- 0 = Sun … 6 = Sat

  -- ==================================================================
  -- 3. Car must exist and be active
  -- ==================================================================
  select *
    into v_car
    from public.cars
   where id = p_car_id
     and active = true;

  if not found then
    raise exception 'Car not found or is not currently active';
  end if;

  -- ==================================================================
  -- 4. Availability rules
  --    At least one rule for this car + day_of_week must fully contain
  --    the requested [start_time, end_time] window.
  -- ==================================================================
  if not exists (
    select 1
      from public.car_availability_rules r
     where r.car_id      = p_car_id
       and r.day_of_week = v_dow
       and r.start_time <= v_start_utc::time
       and r.end_time   >= v_end_utc::time
  ) then
    raise exception 'Car is not available during the requested time window';
  end if;

  -- ==================================================================
  -- 5. Blackout check
  --    Standard overlap test: blackout.start < booking.end
  --                       AND blackout.end   > booking.start
  -- ==================================================================
  if exists (
    select 1
      from public.car_blackouts b
     where b.car_id   = p_car_id
       and b.start_ts < p_end_ts
       and b.end_ts   > p_start_ts
  ) then
    raise exception 'Car is blacked out during the requested time window';
  end if;

  -- ==================================================================
  -- 6. Compute credits
  --    credits_per_hour × hours, rounded UP so partial-hour increments
  --    always charge the full credit (in favour of the business).
  --    Example: 90 min at 10 cr/hr = ceil(15.0) = 15 credits
  --             30 min at  7 cr/hr = ceil(3.5)  =  4 credits
  -- ==================================================================
  v_credits := ceil(v_car.credits_per_hour * (v_duration_min / 60.0))::int;

  -- ==================================================================
  -- 7. Credit-balance check (sum of all ledger deltas for this user)
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
  --    If a concurrent booking wins the same slot, the exclusion
  --    constraint fires and we return a friendly message.
  -- ==================================================================
  begin
    insert into public.bookings
           (car_id, customer_id, start_ts, end_ts, credits_charged)
    values (p_car_id, v_uid, p_start_ts, p_end_ts, v_credits)
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
        'car_id',    p_car_id,
        'start_ts',  p_start_ts,
        'end_ts',    p_end_ts,
        'credits',   v_credits
      )
    );
  exception
    -- The GiST exclusion constraint (bookings_no_overlap) fires when
    -- two CONFIRMED bookings for the same car have overlapping ranges.
    when exclusion_violation then
      raise exception 'This time slot is already booked for the selected car';
  end;

  -- Return a summary to the caller
  return jsonb_build_object(
    'booking_id',      v_booking_id,
    'credits_charged', v_credits,
    'balance_after',   v_balance - v_credits
  );
end;
$$;

comment on function public.create_booking(uuid, timestamptz, timestamptz) is
  'RPC – Atomically creates a CONFIRMED booking, debits the customer''s '
  'credit balance, and writes an audit-log entry.  Relies on the '
  'bookings_no_overlap exclusion constraint to prevent double-booking.';


-- ############################################################################
-- 2. cancel_booking
--    Called by the booking owner or an ADMIN.
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
  v_refund_pct    numeric;      -- 0.0 | 0.5 | 1.0
  v_refund        int;
begin
  -- ==================================================================
  -- 1. Authenticate
  -- ==================================================================
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role into strict v_role
    from public.profiles
   where id = v_uid;

  -- ==================================================================
  -- 2. Fetch booking
  -- ==================================================================
  select *
    into v_booking
    from public.bookings
   where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  -- ==================================================================
  -- 3. Authorise — owner or ADMIN
  -- ==================================================================
  if v_booking.customer_id <> v_uid
     and v_role is distinct from 'ADMIN' then
    raise exception 'Not authorised to cancel this booking';
  end if;

  -- ==================================================================
  -- 4. Idempotent — already canceled → early return
  -- ==================================================================
  if v_booking.status = 'CANCELED' then
    return jsonb_build_object(
      'booking_id', p_booking_id,
      'status',     'CANCELED',
      'refund',     0,
      'message',    'Booking was already canceled'
    );
  end if;

  -- ==================================================================
  -- 5. Tiered refund based on hours until start
  --
  --    > 6 h before start  → 100 % refund
  --    1 h – 6 h           →  50 % refund
  --    < 1 h               →   0 % refund
  -- ==================================================================
  v_hours_until := extract(epoch from (v_booking.start_ts - now())) / 3600.0;

  if v_hours_until > 6 then
    v_refund_pct := 1.0;
  elsif v_hours_until >= 1 then
    v_refund_pct := 0.5;
  else
    v_refund_pct := 0.0;
  end if;

  -- floor() so fractional credits always resolve in favour of the platform
  v_refund := floor(v_booking.credits_charged * v_refund_pct)::int;

  -- ==================================================================
  -- 6. Update booking + refund ledger + audit log  (atomic)
  -- ==================================================================
  update public.bookings
     set status = 'CANCELED'
   where id = p_booking_id;

  -- Only insert a ledger row when there is an actual refund
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

comment on function public.cancel_booking(uuid) is
  'RPC – Cancels a CONFIRMED booking with a tiered refund (100 % / 50 % / 0 %) '
  'based on how far ahead of the start time the cancellation happens.  '
  'Idempotent: calling on an already-canceled booking returns immediately.';


-- ############################################################################
-- 3. admin_grant_credits
--    ADMIN-only function to add credits to any user's balance.
-- ############################################################################

create or replace function public.admin_grant_credits(
  p_user_id uuid,
  p_amount  int,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid;
  v_role       text;
  v_entry_id   uuid;
  v_new_balance int;
begin
  -- ==================================================================
  -- 1. Authenticate & authorise (ADMIN only)
  -- ==================================================================
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role into strict v_role
    from public.profiles
   where id = v_uid;

  if v_role is distinct from 'ADMIN' then
    raise exception 'Only admins can grant credits';
  end if;

  -- ==================================================================
  -- 2. Validate inputs
  -- ==================================================================
  if p_amount <= 0 then
    raise exception 'Amount must be a positive integer';
  end if;

  if p_reason is null or trim(p_reason) = '' then
    raise exception 'A reason is required when granting credits';
  end if;

  -- Target user must exist
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Target user not found';
  end if;

  -- ==================================================================
  -- 3. Insert ledger entry + audit log
  -- ==================================================================
  insert into public.credit_ledger (user_id, delta, reason)
  values (p_user_id, p_amount, trim(p_reason))
  returning id into v_entry_id;

  select coalesce(sum(delta), 0)
    into v_new_balance
    from public.credit_ledger
   where user_id = p_user_id;

  insert into public.audit_log
         (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_uid,
    'credits.granted',
    'profile',
    p_user_id,
    jsonb_build_object(
      'amount',          p_amount,
      'reason',          trim(p_reason),
      'new_balance',     v_new_balance,
      'ledger_entry_id', v_entry_id
    )
  );

  return jsonb_build_object(
    'user_id',     p_user_id,
    'granted',     p_amount,
    'new_balance', v_new_balance
  );
end;
$$;

comment on function public.admin_grant_credits(uuid, int, text) is
  'RPC – ADMIN-only.  Adds credits to a user''s balance and records '
  'the grant in the audit log.';


-- ############################################################################
-- 4. EXECUTE privilege lockdown
--
--    By default Postgres grants EXECUTE to PUBLIC.  We revoke that and
--    grant only to `authenticated` so anon callers can never invoke these.
--    The functions still do their own role checks internally as a second
--    layer of defence.
-- ############################################################################

-- RPC functions (this migration)
revoke execute on function public.create_booking(uuid, timestamptz, timestamptz)  from public;
revoke execute on function public.cancel_booking(uuid)                            from public;
revoke execute on function public.admin_grant_credits(uuid, int, text)            from public;

grant  execute on function public.create_booking(uuid, timestamptz, timestamptz)  to authenticated;
grant  execute on function public.cancel_booking(uuid)                            to authenticated;
grant  execute on function public.admin_grant_credits(uuid, int, text)            to authenticated;

-- Helper functions (from previous migration — tighten now)
revoke execute on function public.is_admin()            from public;
revoke execute on function public.get_my_business_id()  from public;

grant  execute on function public.is_admin()            to authenticated;
grant  execute on function public.get_my_business_id()  to authenticated;

-- Trigger function — never callable directly; only fires via the trigger.
revoke execute on function public.handle_new_user()     from public;
revoke execute on function public.handle_new_user()     from anon;
revoke execute on function public.handle_new_user()     from authenticated;
