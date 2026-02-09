-- ============================================================================
-- ForzaCars Rentals — RLS Policies for car_models & car_units
-- Migration: 20250209000005_car_inventory_rls
--
-- Also drops & recreates policies on bookings, car_blackouts, and
-- car_availability_rules that previously referenced the "cars" table
-- (now dropped).  Those policies now reference car_units instead.
-- ============================================================================


-- ############################################################################
-- 1. car_models — global catalog, publicly readable
-- ############################################################################

alter table public.car_models enable row level security;

-- Anyone (including anon) can browse the catalog
create policy "car_models: public read"
  on public.car_models for select
  using (true);

-- Only admins can write
create policy "car_models: admins can insert"
  on public.car_models for insert
  to authenticated
  with check (public.is_admin());

create policy "car_models: admins can update"
  on public.car_models for update
  to authenticated
  using  (public.is_admin())
  with check (public.is_admin());

create policy "car_models: admins can delete"
  on public.car_models for delete
  to authenticated
  using (public.is_admin());


-- ############################################################################
-- 2. car_units — business inventory
-- ############################################################################

alter table public.car_units enable row level security;

-- SELECT: anyone can read active units (needed for public availability browse)
create policy "car_units: anyone can read active units"
  on public.car_units for select
  using (active = true);

-- SELECT: business users see all their own units (even inactive)
create policy "car_units: business users can read own units"
  on public.car_units for select
  to authenticated
  using (business_id = public.get_my_business_id());

-- SELECT: admin sees everything
create policy "car_units: admins can read all"
  on public.car_units for select
  to authenticated
  using (public.is_admin());

-- INSERT: business users add units to their own business
create policy "car_units: business users can insert for own business"
  on public.car_units for insert
  to authenticated
  with check (business_id = public.get_my_business_id());

create policy "car_units: admins can insert"
  on public.car_units for insert
  to authenticated
  with check (public.is_admin());

-- UPDATE: business users update own units only
create policy "car_units: business users can update own"
  on public.car_units for update
  to authenticated
  using  (business_id = public.get_my_business_id())
  with check (business_id = public.get_my_business_id());

create policy "car_units: admins can update all"
  on public.car_units for update
  to authenticated
  using  (public.is_admin())
  with check (public.is_admin());

-- DELETE: business users delete own units
create policy "car_units: business users can delete own"
  on public.car_units for delete
  to authenticated
  using (business_id = public.get_my_business_id());

create policy "car_units: admins can delete all"
  on public.car_units for delete
  to authenticated
  using (public.is_admin());


-- ############################################################################
-- 3. Re-create car_availability_rules policies (car_id → car_unit_id)
--
--    The old policies referenced public.cars which is now dropped.
--    We must drop them by name and re-create using car_units.
-- ############################################################################

drop policy if exists "car_availability_rules: authenticated can read"          on public.car_availability_rules;
drop policy if exists "car_availability_rules: business users can insert for own cars" on public.car_availability_rules;
drop policy if exists "car_availability_rules: admins can insert"               on public.car_availability_rules;
drop policy if exists "car_availability_rules: business users can update own"   on public.car_availability_rules;
drop policy if exists "car_availability_rules: admins can update all"           on public.car_availability_rules;
drop policy if exists "car_availability_rules: business users can delete own"   on public.car_availability_rules;
drop policy if exists "car_availability_rules: admins can delete all"           on public.car_availability_rules;

create policy "car_availability_rules: authenticated can read"
  on public.car_availability_rules for select
  to authenticated
  using (true);

create policy "car_availability_rules: business users can insert for own units"
  on public.car_availability_rules for insert
  to authenticated
  with check (
    exists (
      select 1 from public.car_units
      where car_units.id = car_unit_id
        and car_units.business_id = public.get_my_business_id()
    )
  );

create policy "car_availability_rules: admins can insert"
  on public.car_availability_rules for insert
  to authenticated
  with check (public.is_admin());

create policy "car_availability_rules: business users can update own"
  on public.car_availability_rules for update
  to authenticated
  using (
    exists (
      select 1 from public.car_units
      where car_units.id = car_unit_id
        and car_units.business_id = public.get_my_business_id()
    )
  )
  with check (
    exists (
      select 1 from public.car_units
      where car_units.id = car_unit_id
        and car_units.business_id = public.get_my_business_id()
    )
  );

create policy "car_availability_rules: admins can update all"
  on public.car_availability_rules for update
  to authenticated
  using  (public.is_admin())
  with check (public.is_admin());

create policy "car_availability_rules: business users can delete own"
  on public.car_availability_rules for delete
  to authenticated
  using (
    exists (
      select 1 from public.car_units
      where car_units.id = car_unit_id
        and car_units.business_id = public.get_my_business_id()
    )
  );

create policy "car_availability_rules: admins can delete all"
  on public.car_availability_rules for delete
  to authenticated
  using (public.is_admin());


-- ############################################################################
-- 4. Re-create car_blackouts policies (car_id → car_unit_id)
-- ############################################################################

drop policy if exists "car_blackouts: authenticated can read"          on public.car_blackouts;
drop policy if exists "car_blackouts: business users can insert for own cars" on public.car_blackouts;
drop policy if exists "car_blackouts: admins can insert"               on public.car_blackouts;
drop policy if exists "car_blackouts: business users can update own"   on public.car_blackouts;
drop policy if exists "car_blackouts: admins can update all"           on public.car_blackouts;
drop policy if exists "car_blackouts: business users can delete own"   on public.car_blackouts;
drop policy if exists "car_blackouts: admins can delete all"           on public.car_blackouts;

create policy "car_blackouts: authenticated can read"
  on public.car_blackouts for select
  to authenticated
  using (true);

create policy "car_blackouts: business users can insert for own units"
  on public.car_blackouts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.car_units
      where car_units.id = car_unit_id
        and car_units.business_id = public.get_my_business_id()
    )
  );

create policy "car_blackouts: admins can insert"
  on public.car_blackouts for insert
  to authenticated
  with check (public.is_admin());

create policy "car_blackouts: business users can update own"
  on public.car_blackouts for update
  to authenticated
  using (
    exists (
      select 1 from public.car_units
      where car_units.id = car_unit_id
        and car_units.business_id = public.get_my_business_id()
    )
  )
  with check (
    exists (
      select 1 from public.car_units
      where car_units.id = car_unit_id
        and car_units.business_id = public.get_my_business_id()
    )
  );

create policy "car_blackouts: admins can update all"
  on public.car_blackouts for update
  to authenticated
  using  (public.is_admin())
  with check (public.is_admin());

create policy "car_blackouts: business users can delete own"
  on public.car_blackouts for delete
  to authenticated
  using (
    exists (
      select 1 from public.car_units
      where car_units.id = car_unit_id
        and car_units.business_id = public.get_my_business_id()
    )
  );

create policy "car_blackouts: admins can delete all"
  on public.car_blackouts for delete
  to authenticated
  using (public.is_admin());


-- ############################################################################
-- 5. Re-create bookings policies (car_id → car_unit_id)
-- ############################################################################

drop policy if exists "bookings: customers can read own"              on public.bookings;
drop policy if exists "bookings: business users can read for own cars" on public.bookings;
drop policy if exists "bookings: admins can read all"                 on public.bookings;

create policy "bookings: customers can read own"
  on public.bookings for select
  to authenticated
  using (customer_id = auth.uid());

create policy "bookings: business users can read for own units"
  on public.bookings for select
  to authenticated
  using (
    exists (
      select 1 from public.car_units
      where car_units.id = car_unit_id
        and car_units.business_id = public.get_my_business_id()
    )
  );

create policy "bookings: admins can read all"
  on public.bookings for select
  to authenticated
  using (public.is_admin());

-- No INSERT / UPDATE / DELETE policies — mutations via SECURITY DEFINER RPCs.
