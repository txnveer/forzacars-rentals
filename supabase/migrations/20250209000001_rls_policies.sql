-- ============================================================================
-- ForzaCars Rentals — Row-Level Security & Auth Trigger
-- Migration: 20250209000001_rls_policies
--
-- Principles:
--   • Deny-by-default — every table has RLS enabled so no row is accessible
--     until an explicit policy grants access.
--   • Server-side enforcement — policies never rely on client-side filtering.
--   • Mutations via RPC — bookings, credit_ledger, and audit_log are
--     read-only from the client; writes go through server-side RPCs that
--     run as SECURITY DEFINER.
-- ============================================================================


-- ############################################################################
-- 0. Helper functions (SECURITY DEFINER — bypass RLS, safe search_path)
-- ############################################################################

-- Returns TRUE when the JWT belongs to an ADMIN user.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'ADMIN'
  )
$$;

-- Returns the caller's business_id (NULL for customers / admins without one).
create or replace function public.get_my_business_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select business_id
  from public.profiles
  where id = (select auth.uid())
$$;


-- ############################################################################
-- 1. Auth trigger — auto-create a profiles row on sign-up
-- ############################################################################

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();


-- ############################################################################
-- 2. Enable RLS on every table
-- ############################################################################

alter table public.profiles               enable row level security;
alter table public.businesses              enable row level security;
alter table public.cars                    enable row level security;
alter table public.car_availability_rules  enable row level security;
alter table public.car_blackouts           enable row level security;
alter table public.bookings                enable row level security;
alter table public.credit_ledger           enable row level security;
alter table public.audit_log               enable row level security;


-- ############################################################################
-- 3. profiles
--    • Users can read & update their own row.
--    • Admins can read & update any row.
--    • No client INSERT (trigger handles it) or DELETE.
-- ############################################################################

-- SELECT
create policy "profiles: users can read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles: admins can read all"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- UPDATE
create policy "profiles: users can update own profile"
  on public.profiles for update
  to authenticated
  using  (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles: admins can update all"
  on public.profiles for update
  to authenticated
  using  (public.is_admin())
  with check (public.is_admin());


-- ############################################################################
-- 4. businesses
--    • Any authenticated user can read (needed for car listings UI).
--    • Business users can update their own business.
--    • Admins have full CRUD.
-- ############################################################################

-- SELECT
create policy "businesses: authenticated can read all"
  on public.businesses for select
  to authenticated
  using (true);

-- UPDATE
create policy "businesses: business users can update own"
  on public.businesses for update
  to authenticated
  using  (id = public.get_my_business_id())
  with check (id = public.get_my_business_id());

create policy "businesses: admins can update all"
  on public.businesses for update
  to authenticated
  using  (public.is_admin())
  with check (public.is_admin());

-- INSERT / DELETE — admin only
create policy "businesses: admins can insert"
  on public.businesses for insert
  to authenticated
  with check (public.is_admin());

create policy "businesses: admins can delete"
  on public.businesses for delete
  to authenticated
  using (public.is_admin());


-- ############################################################################
-- 5. cars
--    • Public read of active cars (anon + authenticated).
--    • Business users: full CRUD on cars in their business.
--    • Admins: full CRUD.
-- ############################################################################

-- SELECT (public — includes anon)
create policy "cars: anyone can read active cars"
  on public.cars for select
  using (active = true);

-- SELECT (business users see their own cars even if inactive)
create policy "cars: business users can read own cars"
  on public.cars for select
  to authenticated
  using (business_id = public.get_my_business_id());

-- SELECT (admins see everything)
create policy "cars: admins can read all"
  on public.cars for select
  to authenticated
  using (public.is_admin());

-- INSERT
create policy "cars: business users can insert for own business"
  on public.cars for insert
  to authenticated
  with check (business_id = public.get_my_business_id());

create policy "cars: admins can insert"
  on public.cars for insert
  to authenticated
  with check (public.is_admin());

-- UPDATE
create policy "cars: business users can update own"
  on public.cars for update
  to authenticated
  using  (business_id = public.get_my_business_id())
  with check (business_id = public.get_my_business_id());

create policy "cars: admins can update all"
  on public.cars for update
  to authenticated
  using  (public.is_admin())
  with check (public.is_admin());

-- DELETE
create policy "cars: business users can delete own"
  on public.cars for delete
  to authenticated
  using (business_id = public.get_my_business_id());

create policy "cars: admins can delete all"
  on public.cars for delete
  to authenticated
  using (public.is_admin());


-- ############################################################################
-- 6. car_availability_rules
--    • Authenticated users can read (availability UI).
--    • Business users: CRUD on rules for cars they own.
--    • Admins: full CRUD.
-- ############################################################################

-- SELECT
create policy "car_availability_rules: authenticated can read"
  on public.car_availability_rules for select
  to authenticated
  using (true);

-- Helper sub-expression: "the car belongs to my business"
-- Used inline below to keep each policy self-contained.

-- INSERT
create policy "car_availability_rules: business users can insert for own cars"
  on public.car_availability_rules for insert
  to authenticated
  with check (
    exists (
      select 1 from public.cars
      where cars.id = car_id
        and cars.business_id = public.get_my_business_id()
    )
  );

create policy "car_availability_rules: admins can insert"
  on public.car_availability_rules for insert
  to authenticated
  with check (public.is_admin());

-- UPDATE
create policy "car_availability_rules: business users can update own"
  on public.car_availability_rules for update
  to authenticated
  using (
    exists (
      select 1 from public.cars
      where cars.id = car_id
        and cars.business_id = public.get_my_business_id()
    )
  )
  with check (
    exists (
      select 1 from public.cars
      where cars.id = car_id
        and cars.business_id = public.get_my_business_id()
    )
  );

create policy "car_availability_rules: admins can update all"
  on public.car_availability_rules for update
  to authenticated
  using  (public.is_admin())
  with check (public.is_admin());

-- DELETE
create policy "car_availability_rules: business users can delete own"
  on public.car_availability_rules for delete
  to authenticated
  using (
    exists (
      select 1 from public.cars
      where cars.id = car_id
        and cars.business_id = public.get_my_business_id()
    )
  );

create policy "car_availability_rules: admins can delete all"
  on public.car_availability_rules for delete
  to authenticated
  using (public.is_admin());


-- ############################################################################
-- 7. car_blackouts  (same pattern as availability rules)
-- ############################################################################

-- SELECT
create policy "car_blackouts: authenticated can read"
  on public.car_blackouts for select
  to authenticated
  using (true);

-- INSERT
create policy "car_blackouts: business users can insert for own cars"
  on public.car_blackouts for insert
  to authenticated
  with check (
    exists (
      select 1 from public.cars
      where cars.id = car_id
        and cars.business_id = public.get_my_business_id()
    )
  );

create policy "car_blackouts: admins can insert"
  on public.car_blackouts for insert
  to authenticated
  with check (public.is_admin());

-- UPDATE
create policy "car_blackouts: business users can update own"
  on public.car_blackouts for update
  to authenticated
  using (
    exists (
      select 1 from public.cars
      where cars.id = car_id
        and cars.business_id = public.get_my_business_id()
    )
  )
  with check (
    exists (
      select 1 from public.cars
      where cars.id = car_id
        and cars.business_id = public.get_my_business_id()
    )
  );

create policy "car_blackouts: admins can update all"
  on public.car_blackouts for update
  to authenticated
  using  (public.is_admin())
  with check (public.is_admin());

-- DELETE
create policy "car_blackouts: business users can delete own"
  on public.car_blackouts for delete
  to authenticated
  using (
    exists (
      select 1 from public.cars
      where cars.id = car_id
        and cars.business_id = public.get_my_business_id()
    )
  );

create policy "car_blackouts: admins can delete all"
  on public.car_blackouts for delete
  to authenticated
  using (public.is_admin());


-- ############################################################################
-- 8. bookings  (read-only from client — mutations via server RPCs)
-- ############################################################################

-- SELECT: customer sees own bookings
create policy "bookings: customers can read own"
  on public.bookings for select
  to authenticated
  using (customer_id = auth.uid());

-- SELECT: business user sees bookings for cars in their business
create policy "bookings: business users can read for own cars"
  on public.bookings for select
  to authenticated
  using (
    exists (
      select 1 from public.cars
      where cars.id = car_id
        and cars.business_id = public.get_my_business_id()
    )
  );

-- SELECT: admin sees all
create policy "bookings: admins can read all"
  on public.bookings for select
  to authenticated
  using (public.is_admin());

-- No INSERT / UPDATE / DELETE policies → mutations blocked from the client.
-- Bookings are created and managed through SECURITY DEFINER RPCs.


-- ############################################################################
-- 9. credit_ledger  (read-only from client)
-- ############################################################################

-- SELECT: user sees own ledger
create policy "credit_ledger: users can read own"
  on public.credit_ledger for select
  to authenticated
  using (user_id = auth.uid());

-- SELECT: admin sees all
create policy "credit_ledger: admins can read all"
  on public.credit_ledger for select
  to authenticated
  using (public.is_admin());

-- No INSERT / UPDATE / DELETE policies → client writes blocked.
-- Ledger entries are appended by SECURITY DEFINER RPCs only.


-- ############################################################################
-- 10. audit_log  (admin read-only from client)
-- ############################################################################

-- SELECT: admin only
create policy "audit_log: admins can read all"
  on public.audit_log for select
  to authenticated
  using (public.is_admin());

-- No INSERT / UPDATE / DELETE policies → writes handled server-side only.
