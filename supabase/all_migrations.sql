-- ============================================================================
-- ForzaCars Rentals — ALL MIGRATIONS COMBINED
-- Run this entire file in Supabase SQL Editor (one go).
-- ============================================================================

-- ====== Migration 1: 20250209000000_core_schema ======

create extension if not exists btree_gist;

create table public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null default 'CUSTOMER'
              check (role in ('CUSTOMER', 'BUSINESS', 'ADMIN')),
  business_id uuid references public.businesses(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.cars (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  name             text not null,
  universe         text not null,
  class            text not null,
  credits_per_hour int  not null check (credits_per_hour > 0),
  active           bool not null default true,
  created_at       timestamptz not null default now()
);
create index idx_cars_business_id on public.cars (business_id);

create table public.car_availability_rules (
  id          uuid primary key default gen_random_uuid(),
  car_id      uuid not null references public.cars(id) on delete cascade,
  day_of_week int  not null check (day_of_week between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  constraint car_availability_rules_time_order check (start_time < end_time)
);
create index idx_car_availability_rules_car_id on public.car_availability_rules (car_id);

create table public.car_blackouts (
  id       uuid primary key default gen_random_uuid(),
  car_id   uuid not null references public.cars(id) on delete cascade,
  start_ts timestamptz not null,
  end_ts   timestamptz not null,
  reason   text,
  constraint car_blackouts_ts_order check (start_ts < end_ts)
);
create index idx_car_blackouts_car_id on public.car_blackouts (car_id);

create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  car_id          uuid not null references public.cars(id)    on delete cascade,
  customer_id     uuid not null references public.profiles(id) on delete cascade,
  start_ts        timestamptz not null,
  end_ts          timestamptz not null,
  status          text not null default 'CONFIRMED'
                  check (status in ('CONFIRMED', 'CANCELED')),
  credits_charged int  not null,
  created_at      timestamptz not null default now(),
  constraint bookings_ts_order check (start_ts < end_ts)
);

alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    car_id with =,
    tstzrange(start_ts, end_ts, '[)') with &&
  ) where (status = 'CONFIRMED');

create index idx_bookings_car_id      on public.bookings (car_id);
create index idx_bookings_customer_id on public.bookings (customer_id);

create table public.credit_ledger (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  delta              int  not null,
  reason             text not null,
  related_booking_id uuid references public.bookings(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index idx_credit_ledger_user_id on public.credit_ledger (user_id);

create table public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index idx_audit_log_actor   on public.audit_log (actor_user_id);
create index idx_audit_log_entity  on public.audit_log (entity_type, entity_id);


-- ====== Migration 2: 20250209000001_rls_policies ======

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'ADMIN') $$;

create or replace function public.get_my_business_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select business_id from public.profiles where id = (select auth.uid()) $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin insert into public.profiles (id, email) values (new.id, new.email); return new; end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles               enable row level security;
alter table public.businesses              enable row level security;
alter table public.cars                    enable row level security;
alter table public.car_availability_rules  enable row level security;
alter table public.car_blackouts           enable row level security;
alter table public.bookings                enable row level security;
alter table public.credit_ledger           enable row level security;
alter table public.audit_log               enable row level security;

-- profiles
create policy "profiles: users can read own profile" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: admins can read all" on public.profiles for select to authenticated using (public.is_admin());
create policy "profiles: users can update own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admins can update all" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- businesses
create policy "businesses: authenticated can read all" on public.businesses for select to authenticated using (true);
create policy "businesses: business users can update own" on public.businesses for update to authenticated using (id = public.get_my_business_id()) with check (id = public.get_my_business_id());
create policy "businesses: admins can update all" on public.businesses for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "businesses: admins can insert" on public.businesses for insert to authenticated with check (public.is_admin());
create policy "businesses: admins can delete" on public.businesses for delete to authenticated using (public.is_admin());

-- cars
create policy "cars: anyone can read active cars" on public.cars for select using (active = true);
create policy "cars: business users can read own cars" on public.cars for select to authenticated using (business_id = public.get_my_business_id());
create policy "cars: admins can read all" on public.cars for select to authenticated using (public.is_admin());
create policy "cars: business users can insert for own business" on public.cars for insert to authenticated with check (business_id = public.get_my_business_id());
create policy "cars: admins can insert" on public.cars for insert to authenticated with check (public.is_admin());
create policy "cars: business users can update own" on public.cars for update to authenticated using (business_id = public.get_my_business_id()) with check (business_id = public.get_my_business_id());
create policy "cars: admins can update all" on public.cars for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "cars: business users can delete own" on public.cars for delete to authenticated using (business_id = public.get_my_business_id());
create policy "cars: admins can delete all" on public.cars for delete to authenticated using (public.is_admin());

-- car_availability_rules
create policy "car_availability_rules: authenticated can read" on public.car_availability_rules for select to authenticated using (true);
create policy "car_availability_rules: business users can insert for own cars" on public.car_availability_rules for insert to authenticated with check (exists (select 1 from public.cars where cars.id = car_id and cars.business_id = public.get_my_business_id()));
create policy "car_availability_rules: admins can insert" on public.car_availability_rules for insert to authenticated with check (public.is_admin());
create policy "car_availability_rules: business users can update own" on public.car_availability_rules for update to authenticated using (exists (select 1 from public.cars where cars.id = car_id and cars.business_id = public.get_my_business_id())) with check (exists (select 1 from public.cars where cars.id = car_id and cars.business_id = public.get_my_business_id()));
create policy "car_availability_rules: admins can update all" on public.car_availability_rules for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "car_availability_rules: business users can delete own" on public.car_availability_rules for delete to authenticated using (exists (select 1 from public.cars where cars.id = car_id and cars.business_id = public.get_my_business_id()));
create policy "car_availability_rules: admins can delete all" on public.car_availability_rules for delete to authenticated using (public.is_admin());

-- car_blackouts
create policy "car_blackouts: authenticated can read" on public.car_blackouts for select to authenticated using (true);
create policy "car_blackouts: business users can insert for own cars" on public.car_blackouts for insert to authenticated with check (exists (select 1 from public.cars where cars.id = car_id and cars.business_id = public.get_my_business_id()));
create policy "car_blackouts: admins can insert" on public.car_blackouts for insert to authenticated with check (public.is_admin());
create policy "car_blackouts: business users can update own" on public.car_blackouts for update to authenticated using (exists (select 1 from public.cars where cars.id = car_id and cars.business_id = public.get_my_business_id())) with check (exists (select 1 from public.cars where cars.id = car_id and cars.business_id = public.get_my_business_id()));
create policy "car_blackouts: admins can update all" on public.car_blackouts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "car_blackouts: business users can delete own" on public.car_blackouts for delete to authenticated using (exists (select 1 from public.cars where cars.id = car_id and cars.business_id = public.get_my_business_id()));
create policy "car_blackouts: admins can delete all" on public.car_blackouts for delete to authenticated using (public.is_admin());

-- bookings (read-only from client)
create policy "bookings: customers can read own" on public.bookings for select to authenticated using (customer_id = auth.uid());
create policy "bookings: business users can read for own cars" on public.bookings for select to authenticated using (exists (select 1 from public.cars where cars.id = car_id and cars.business_id = public.get_my_business_id()));
create policy "bookings: admins can read all" on public.bookings for select to authenticated using (public.is_admin());

-- credit_ledger (read-only from client)
create policy "credit_ledger: users can read own" on public.credit_ledger for select to authenticated using (user_id = auth.uid());
create policy "credit_ledger: admins can read all" on public.credit_ledger for select to authenticated using (public.is_admin());

-- audit_log (admin read-only)
create policy "audit_log: admins can read all" on public.audit_log for select to authenticated using (public.is_admin());


-- ====== Migration 3: 20250209000002_rpc_functions ======

create or replace function public.create_booking(p_car_id uuid, p_start_ts timestamptz, p_end_ts timestamptz)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid; v_role text; v_car record; v_start_utc timestamp; v_end_utc timestamp;
  v_dow int; v_duration_min int; v_credits int; v_balance int; v_booking_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role into strict v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'CUSTOMER' then raise exception 'Only customers can create bookings'; end if;
  if p_end_ts <= p_start_ts then raise exception 'end_ts must be after start_ts'; end if;
  if p_start_ts <= now() then raise exception 'Booking must start in the future'; end if;
  v_start_utc := p_start_ts at time zone 'UTC'; v_end_utc := p_end_ts at time zone 'UTC';
  if extract(second from v_start_utc) <> 0 or extract(minute from v_start_utc)::int % 30 <> 0 then raise exception 'Start time must align to a 30-minute boundary'; end if;
  if extract(second from v_end_utc) <> 0 or extract(minute from v_end_utc)::int % 30 <> 0 then raise exception 'End time must align to a 30-minute boundary'; end if;
  v_duration_min := extract(epoch from (p_end_ts - p_start_ts))::int / 60;
  if v_duration_min < 60 then raise exception 'Minimum booking duration is 60 minutes'; end if;
  if v_duration_min % 30 <> 0 then raise exception 'Duration must be a multiple of 30 minutes'; end if;
  if v_start_utc::date <> v_end_utc::date then raise exception 'Booking must start and end on the same calendar day (UTC)'; end if;
  v_dow := extract(dow from v_start_utc)::int;
  select * into v_car from public.cars where id = p_car_id and active = true;
  if not found then raise exception 'Car not found or is not currently active'; end if;
  if not exists (select 1 from public.car_availability_rules r where r.car_id = p_car_id and r.day_of_week = v_dow and r.start_time <= v_start_utc::time and r.end_time >= v_end_utc::time) then raise exception 'Car is not available during the requested time window'; end if;
  if exists (select 1 from public.car_blackouts b where b.car_id = p_car_id and b.start_ts < p_end_ts and b.end_ts > p_start_ts) then raise exception 'Car is blacked out during the requested time window'; end if;
  v_credits := ceil(v_car.credits_per_hour * (v_duration_min / 60.0))::int;
  select coalesce(sum(delta), 0) into v_balance from public.credit_ledger where user_id = v_uid;
  if v_balance < v_credits then raise exception 'Insufficient credit balance'; end if;
  begin
    insert into public.bookings (car_id, customer_id, start_ts, end_ts, credits_charged) values (p_car_id, v_uid, p_start_ts, p_end_ts, v_credits) returning id into v_booking_id;
    insert into public.credit_ledger (user_id, delta, reason, related_booking_id) values (v_uid, -v_credits, 'Booking charge', v_booking_id);
    insert into public.audit_log (actor_user_id, action, entity_type, entity_id, metadata) values (v_uid, 'booking.created', 'booking', v_booking_id, jsonb_build_object('car_id', p_car_id, 'start_ts', p_start_ts, 'end_ts', p_end_ts, 'credits', v_credits));
  exception when exclusion_violation then raise exception 'This time slot is already booked'; end;
  return jsonb_build_object('booking_id', v_booking_id, 'credits_charged', v_credits, 'balance_after', v_balance - v_credits);
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid; v_role text; v_booking record; v_hours_until numeric; v_refund_pct numeric; v_refund int;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role into strict v_role from public.profiles where id = v_uid;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.customer_id <> v_uid and v_role is distinct from 'ADMIN' then raise exception 'Not authorised to cancel this booking'; end if;
  if v_booking.status = 'CANCELED' then return jsonb_build_object('booking_id', p_booking_id, 'status', 'CANCELED', 'refund', 0, 'message', 'Already canceled'); end if;
  v_hours_until := extract(epoch from (v_booking.start_ts - now())) / 3600.0;
  if v_hours_until > 6 then v_refund_pct := 1.0; elsif v_hours_until >= 1 then v_refund_pct := 0.5; else v_refund_pct := 0.0; end if;
  v_refund := floor(v_booking.credits_charged * v_refund_pct)::int;
  update public.bookings set status = 'CANCELED' where id = p_booking_id;
  if v_refund > 0 then insert into public.credit_ledger (user_id, delta, reason, related_booking_id) values (v_booking.customer_id, v_refund, format('Cancellation refund (%s%%)', (v_refund_pct * 100)::int), p_booking_id); end if;
  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, metadata) values (v_uid, 'booking.canceled', 'booking', p_booking_id, jsonb_build_object('refund_credits', v_refund, 'refund_pct', v_refund_pct, 'hours_until_start', round(v_hours_until, 2), 'canceled_by', case when v_booking.customer_id = v_uid then 'customer' else 'admin' end));
  return jsonb_build_object('booking_id', p_booking_id, 'status', 'CANCELED', 'refund', v_refund, 'refund_pct', v_refund_pct);
end;
$$;

create or replace function public.admin_grant_credits(p_user_id uuid, p_amount int, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid; v_role text; v_entry_id uuid; v_new_balance int;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role into strict v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'ADMIN' then raise exception 'Only admins can grant credits'; end if;
  if p_amount <= 0 then raise exception 'Amount must be a positive integer'; end if;
  if p_reason is null or trim(p_reason) = '' then raise exception 'A reason is required'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'Target user not found'; end if;
  insert into public.credit_ledger (user_id, delta, reason) values (p_user_id, p_amount, trim(p_reason)) returning id into v_entry_id;
  select coalesce(sum(delta), 0) into v_new_balance from public.credit_ledger where user_id = p_user_id;
  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, metadata) values (v_uid, 'credits.granted', 'profile', p_user_id, jsonb_build_object('amount', p_amount, 'reason', trim(p_reason), 'new_balance', v_new_balance, 'ledger_entry_id', v_entry_id));
  return jsonb_build_object('user_id', p_user_id, 'granted', p_amount, 'new_balance', v_new_balance);
end;
$$;

revoke execute on function public.create_booking(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.cancel_booking(uuid) from public;
revoke execute on function public.admin_grant_credits(uuid, int, text) from public;
grant  execute on function public.create_booking(uuid, timestamptz, timestamptz) to authenticated;
grant  execute on function public.cancel_booking(uuid) to authenticated;
grant  execute on function public.admin_grant_credits(uuid, int, text) to authenticated;
revoke execute on function public.is_admin() from public;
revoke execute on function public.get_my_business_id() from public;
grant  execute on function public.is_admin() to authenticated;
grant  execute on function public.get_my_business_id() to authenticated;
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;


-- ====== Migration 4: 20250209000003_cars_catalog ======

create table public.cars_catalog (
  id uuid primary key default gen_random_uuid(),
  year int, manufacturer text, model text,
  wiki_page_title text, wiki_page_url text, image_url text,
  stat_speed int, stat_handling int, stat_acceleration int, stat_launch int, stat_braking int, stat_pi int,
  source text not null default 'forza.fandom',
  source_game text not null default 'Forza Horizon 2',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cars_catalog_source_unique unique (source, source_game, wiki_page_title)
);
create index idx_cars_catalog_manufacturer on public.cars_catalog (manufacturer);
create index idx_cars_catalog_source_game  on public.cars_catalog (source_game);
alter table public.cars_catalog enable row level security;
create policy "cars_catalog: public read" on public.cars_catalog for select using (true);


-- ====== Migration 5: 20250209000004_car_inventory_schema ======

create table public.car_models (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'forza.fandom',
  source_game text not null default 'Forza Horizon 2',
  wiki_page_title text not null,
  wiki_page_url text, year int, manufacturer text, model text,
  display_name text not null, universe text, class text, image_url text,
  stat_speed int, stat_handling int, stat_acceleration int, stat_launch int, stat_braking int, stat_pi int,
  suggested_credits_per_hour int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint car_models_source_unique unique (source, source_game, wiki_page_title)
);
create index idx_car_models_manufacturer_model on public.car_models (manufacturer, model);
create index idx_car_models_source_game on public.car_models (source_game);
create index idx_car_models_stat_pi on public.car_models (stat_pi);

-- Migrate cars_catalog → car_models
insert into public.car_models (source, source_game, wiki_page_title, wiki_page_url, year, manufacturer, model, display_name, image_url, stat_speed, stat_handling, stat_acceleration, stat_launch, stat_braking, stat_pi, created_at, updated_at)
select source, source_game, wiki_page_title, wiki_page_url, year, manufacturer, model, coalesce(nullif(trim(coalesce(manufacturer, '') || ' ' || coalesce(model, '')), ''), wiki_page_title), image_url, stat_speed, stat_handling, stat_acceleration, stat_launch, stat_braking, stat_pi, created_at, updated_at
from public.cars_catalog;

-- VIN generator
create or replace function public.generate_vin() returns text language plpgsql as $$
declare chars constant text := 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789'; result text; i int;
begin loop result := ''; for i in 1..17 loop result := result || substr(chars, floor(random() * 33 + 1)::int, 1); end loop; exit when not exists (select 1 from public.car_units where vin = result); end loop; return result; end; $$;

-- Plate generator
create or replace function public.generate_plate() returns text language plpgsql as $$
declare chars constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; suffix text; i int;
begin loop suffix := ''; for i in 1..6 loop suffix := suffix || substr(chars, floor(random() * 36 + 1)::int, 1); end loop; exit when not exists (select 1 from public.car_units where license_plate = 'FCR-' || suffix); end loop; return 'FCR-' || suffix; end; $$;

-- car_units table
create table public.car_units (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  car_model_id uuid not null references public.car_models(id) on delete restrict,
  display_name text, color text, color_hex text,
  vin text not null unique default public.generate_vin(),
  license_plate text not null unique default public.generate_plate(),
  credits_per_hour int, active bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_car_units_business_id on public.car_units (business_id);
create index idx_car_units_car_model_id on public.car_units (car_model_id);
create index idx_car_units_active on public.car_units (active) where active = true;

-- Migrate legacy cars → car_models + car_units
create temp table _car_migration (old_car_id uuid not null, car_model_id uuid, car_unit_id uuid);

insert into public.car_models (source, source_game, wiki_page_title, display_name, universe, class, suggested_credits_per_hour)
select 'legacy', 'manual', 'legacy:' || c.id::text, c.name, c.universe, c.class, c.credits_per_hour from public.cars c;

insert into _car_migration (old_car_id, car_model_id)
select c.id, cm.id from public.cars c join public.car_models cm on cm.source = 'legacy' and cm.wiki_page_title = 'legacy:' || c.id::text;

insert into public.car_units (business_id, car_model_id, display_name, credits_per_hour, active)
select c.business_id, m.car_model_id, c.name, c.credits_per_hour, c.active from public.cars c join _car_migration m on m.old_car_id = c.id;

update _car_migration m set car_unit_id = cu.id from public.car_units cu where cu.car_model_id = m.car_model_id;

-- *** Drop RLS policies that reference car_id BEFORE dropping the columns ***
-- bookings policies referencing car_id
drop policy if exists "bookings: customers can read own" on public.bookings;
drop policy if exists "bookings: business users can read for own cars" on public.bookings;
drop policy if exists "bookings: admins can read all" on public.bookings;
-- car_blackouts policies referencing car_id
drop policy if exists "car_blackouts: authenticated can read" on public.car_blackouts;
drop policy if exists "car_blackouts: business users can insert for own cars" on public.car_blackouts;
drop policy if exists "car_blackouts: admins can insert" on public.car_blackouts;
drop policy if exists "car_blackouts: business users can update own" on public.car_blackouts;
drop policy if exists "car_blackouts: admins can update all" on public.car_blackouts;
drop policy if exists "car_blackouts: business users can delete own" on public.car_blackouts;
drop policy if exists "car_blackouts: admins can delete all" on public.car_blackouts;
-- car_availability_rules policies referencing car_id
drop policy if exists "car_availability_rules: authenticated can read" on public.car_availability_rules;
drop policy if exists "car_availability_rules: business users can insert for own cars" on public.car_availability_rules;
drop policy if exists "car_availability_rules: admins can insert" on public.car_availability_rules;
drop policy if exists "car_availability_rules: business users can update own" on public.car_availability_rules;
drop policy if exists "car_availability_rules: admins can update all" on public.car_availability_rules;
drop policy if exists "car_availability_rules: business users can delete own" on public.car_availability_rules;
drop policy if exists "car_availability_rules: admins can delete all" on public.car_availability_rules;
-- cars policies (table will be dropped entirely, but drop policies first)
drop policy if exists "cars: anyone can read active cars" on public.cars;
drop policy if exists "cars: business users can read own cars" on public.cars;
drop policy if exists "cars: admins can read all" on public.cars;
drop policy if exists "cars: business users can insert for own business" on public.cars;
drop policy if exists "cars: admins can insert" on public.cars;
drop policy if exists "cars: business users can update own" on public.cars;
drop policy if exists "cars: admins can update all" on public.cars;
drop policy if exists "cars: business users can delete own" on public.cars;
drop policy if exists "cars: admins can delete all" on public.cars;

-- Re-wire bookings
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings add column car_unit_id uuid;
update public.bookings b set car_unit_id = m.car_unit_id from _car_migration m where b.car_id = m.old_car_id;
delete from public.bookings where car_unit_id is null and car_id is not null;
alter table public.bookings alter column car_unit_id set not null;
alter table public.bookings add constraint bookings_car_unit_id_fkey foreign key (car_unit_id) references public.car_units(id) on delete cascade;
drop index if exists public.idx_bookings_car_id;
alter table public.bookings drop column car_id;
alter table public.bookings add constraint bookings_no_overlap exclude using gist (car_unit_id with =, tstzrange(start_ts, end_ts, '[)') with &&) where (status = 'CONFIRMED');
create index idx_bookings_car_unit_id on public.bookings (car_unit_id);

-- Re-wire car_blackouts
alter table public.car_blackouts add column car_unit_id uuid;
update public.car_blackouts bo set car_unit_id = m.car_unit_id from _car_migration m where bo.car_id = m.old_car_id;
delete from public.car_blackouts where car_unit_id is null and car_id is not null;
alter table public.car_blackouts alter column car_unit_id set not null;
alter table public.car_blackouts add constraint car_blackouts_car_unit_id_fkey foreign key (car_unit_id) references public.car_units(id) on delete cascade;
drop index if exists public.idx_car_blackouts_car_id;
alter table public.car_blackouts drop column car_id;
create index idx_car_blackouts_car_unit_id on public.car_blackouts (car_unit_id);

-- Re-wire car_availability_rules
alter table public.car_availability_rules add column car_unit_id uuid;
update public.car_availability_rules ar set car_unit_id = m.car_unit_id from _car_migration m where ar.car_id = m.old_car_id;
delete from public.car_availability_rules where car_unit_id is null and car_id is not null;
alter table public.car_availability_rules alter column car_unit_id set not null;
alter table public.car_availability_rules add constraint car_availability_rules_car_unit_id_fkey foreign key (car_unit_id) references public.car_units(id) on delete cascade;
drop index if exists public.idx_car_availability_rules_car_id;
alter table public.car_availability_rules drop column car_id;
create index idx_car_availability_rules_car_unit_id on public.car_availability_rules (car_unit_id);

-- Drop legacy tables
drop table if exists public.cars_catalog cascade;
drop table if exists public.cars cascade;
drop table if exists _car_migration;


-- ====== Migration 6: 20250209000005_car_inventory_rls ======

alter table public.car_models enable row level security;
create policy "car_models: public read" on public.car_models for select using (true);
create policy "car_models: admins can insert" on public.car_models for insert to authenticated with check (public.is_admin());
create policy "car_models: admins can update" on public.car_models for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "car_models: admins can delete" on public.car_models for delete to authenticated using (public.is_admin());

alter table public.car_units enable row level security;
create policy "car_units: anyone can read active units" on public.car_units for select using (active = true);
create policy "car_units: business users can read own units" on public.car_units for select to authenticated using (business_id = public.get_my_business_id());
create policy "car_units: admins can read all" on public.car_units for select to authenticated using (public.is_admin());
create policy "car_units: business users can insert for own business" on public.car_units for insert to authenticated with check (business_id = public.get_my_business_id());
create policy "car_units: admins can insert" on public.car_units for insert to authenticated with check (public.is_admin());
create policy "car_units: business users can update own" on public.car_units for update to authenticated using (business_id = public.get_my_business_id()) with check (business_id = public.get_my_business_id());
create policy "car_units: admins can update all" on public.car_units for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "car_units: business users can delete own" on public.car_units for delete to authenticated using (business_id = public.get_my_business_id());
create policy "car_units: admins can delete all" on public.car_units for delete to authenticated using (public.is_admin());

-- Re-create policies for car_availability_rules (now references car_units)
drop policy if exists "car_availability_rules: authenticated can read" on public.car_availability_rules;
drop policy if exists "car_availability_rules: business users can insert for own cars" on public.car_availability_rules;
drop policy if exists "car_availability_rules: admins can insert" on public.car_availability_rules;
drop policy if exists "car_availability_rules: business users can update own" on public.car_availability_rules;
drop policy if exists "car_availability_rules: admins can update all" on public.car_availability_rules;
drop policy if exists "car_availability_rules: business users can delete own" on public.car_availability_rules;
drop policy if exists "car_availability_rules: admins can delete all" on public.car_availability_rules;

create policy "car_availability_rules: authenticated can read" on public.car_availability_rules for select to authenticated using (true);
create policy "car_availability_rules: business users can insert for own units" on public.car_availability_rules for insert to authenticated with check (exists (select 1 from public.car_units where car_units.id = car_unit_id and car_units.business_id = public.get_my_business_id()));
create policy "car_availability_rules: admins can insert" on public.car_availability_rules for insert to authenticated with check (public.is_admin());
create policy "car_availability_rules: business users can update own" on public.car_availability_rules for update to authenticated using (exists (select 1 from public.car_units where car_units.id = car_unit_id and car_units.business_id = public.get_my_business_id())) with check (exists (select 1 from public.car_units where car_units.id = car_unit_id and car_units.business_id = public.get_my_business_id()));
create policy "car_availability_rules: admins can update all" on public.car_availability_rules for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "car_availability_rules: business users can delete own" on public.car_availability_rules for delete to authenticated using (exists (select 1 from public.car_units where car_units.id = car_unit_id and car_units.business_id = public.get_my_business_id()));
create policy "car_availability_rules: admins can delete all" on public.car_availability_rules for delete to authenticated using (public.is_admin());

-- Re-create policies for car_blackouts
drop policy if exists "car_blackouts: authenticated can read" on public.car_blackouts;
drop policy if exists "car_blackouts: business users can insert for own cars" on public.car_blackouts;
drop policy if exists "car_blackouts: admins can insert" on public.car_blackouts;
drop policy if exists "car_blackouts: business users can update own" on public.car_blackouts;
drop policy if exists "car_blackouts: admins can update all" on public.car_blackouts;
drop policy if exists "car_blackouts: business users can delete own" on public.car_blackouts;
drop policy if exists "car_blackouts: admins can delete all" on public.car_blackouts;

create policy "car_blackouts: authenticated can read" on public.car_blackouts for select to authenticated using (true);
create policy "car_blackouts: business users can insert for own units" on public.car_blackouts for insert to authenticated with check (exists (select 1 from public.car_units where car_units.id = car_unit_id and car_units.business_id = public.get_my_business_id()));
create policy "car_blackouts: admins can insert" on public.car_blackouts for insert to authenticated with check (public.is_admin());
create policy "car_blackouts: business users can update own" on public.car_blackouts for update to authenticated using (exists (select 1 from public.car_units where car_units.id = car_unit_id and car_units.business_id = public.get_my_business_id())) with check (exists (select 1 from public.car_units where car_units.id = car_unit_id and car_units.business_id = public.get_my_business_id()));
create policy "car_blackouts: admins can update all" on public.car_blackouts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "car_blackouts: business users can delete own" on public.car_blackouts for delete to authenticated using (exists (select 1 from public.car_units where car_units.id = car_unit_id and car_units.business_id = public.get_my_business_id()));
create policy "car_blackouts: admins can delete all" on public.car_blackouts for delete to authenticated using (public.is_admin());

-- Re-create policies for bookings
drop policy if exists "bookings: customers can read own" on public.bookings;
drop policy if exists "bookings: business users can read for own cars" on public.bookings;
drop policy if exists "bookings: admins can read all" on public.bookings;

create policy "bookings: customers can read own" on public.bookings for select to authenticated using (customer_id = auth.uid());
create policy "bookings: business users can read for own units" on public.bookings for select to authenticated using (exists (select 1 from public.car_units where car_units.id = car_unit_id and car_units.business_id = public.get_my_business_id()));
create policy "bookings: admins can read all" on public.bookings for select to authenticated using (public.is_admin());


-- ====== Migration 7: 20250209000006_car_inventory_rpcs ======

-- Must drop the old function first because Postgres does not allow
-- renaming parameters via CREATE OR REPLACE (p_car_id → p_car_unit_id).
drop function if exists public.create_booking(uuid, timestamptz, timestamptz);

create or replace function public.create_booking(p_car_unit_id uuid, p_start_ts timestamptz, p_end_ts timestamptz)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid; v_role text; v_unit record; v_model record; v_start_utc timestamp; v_end_utc timestamp;
  v_dow int; v_duration_min int; v_cph int; v_credits int; v_balance int; v_booking_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role into strict v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'CUSTOMER' then raise exception 'Only customers can create bookings'; end if;
  if p_end_ts <= p_start_ts then raise exception 'end_ts must be after start_ts'; end if;
  if p_start_ts <= now() then raise exception 'Booking must start in the future'; end if;
  v_start_utc := p_start_ts at time zone 'UTC'; v_end_utc := p_end_ts at time zone 'UTC';
  if extract(second from v_start_utc) <> 0 or extract(minute from v_start_utc)::int % 30 <> 0 then raise exception 'Start time must align to a 30-minute boundary'; end if;
  if extract(second from v_end_utc) <> 0 or extract(minute from v_end_utc)::int % 30 <> 0 then raise exception 'End time must align to a 30-minute boundary'; end if;
  v_duration_min := extract(epoch from (p_end_ts - p_start_ts))::int / 60;
  if v_duration_min < 60 then raise exception 'Minimum booking duration is 60 minutes'; end if;
  if v_duration_min % 30 <> 0 then raise exception 'Duration must be a multiple of 30 minutes'; end if;
  if v_start_utc::date <> v_end_utc::date then raise exception 'Booking must start and end on the same calendar day (UTC)'; end if;
  v_dow := extract(dow from v_start_utc)::int;
  select * into v_unit from public.car_units where id = p_car_unit_id and active = true;
  if not found then raise exception 'Car unit not found or is not currently active'; end if;
  select * into v_model from public.car_models where id = v_unit.car_model_id;
  if not exists (select 1 from public.car_availability_rules r where r.car_unit_id = p_car_unit_id and r.day_of_week = v_dow and r.start_time <= v_start_utc::time and r.end_time >= v_end_utc::time) then raise exception 'Car unit is not available during the requested time window'; end if;
  if exists (select 1 from public.car_blackouts b where b.car_unit_id = p_car_unit_id and b.start_ts < p_end_ts and b.end_ts > p_start_ts) then raise exception 'Car unit is blacked out'; end if;
  v_cph := coalesce(v_unit.credits_per_hour, v_model.suggested_credits_per_hour);
  if v_cph is null or v_cph <= 0 then raise exception 'No credits-per-hour rate configured for this car unit'; end if;
  v_credits := ceil(v_cph * (v_duration_min / 60.0))::int;
  select coalesce(sum(delta), 0) into v_balance from public.credit_ledger where user_id = v_uid;
  if v_balance < v_credits then raise exception 'Insufficient credit balance'; end if;
  begin
    insert into public.bookings (car_unit_id, customer_id, start_ts, end_ts, credits_charged) values (p_car_unit_id, v_uid, p_start_ts, p_end_ts, v_credits) returning id into v_booking_id;
    insert into public.credit_ledger (user_id, delta, reason, related_booking_id) values (v_uid, -v_credits, 'Booking charge', v_booking_id);
    insert into public.audit_log (actor_user_id, action, entity_type, entity_id, metadata) values (v_uid, 'booking.created', 'booking', v_booking_id, jsonb_build_object('car_unit_id', p_car_unit_id, 'car_model_id', v_unit.car_model_id, 'start_ts', p_start_ts, 'end_ts', p_end_ts, 'credits', v_credits, 'cph', v_cph));
  exception when exclusion_violation then raise exception 'This time slot is already booked'; end;
  return jsonb_build_object('booking_id', v_booking_id, 'credits_charged', v_credits, 'balance_after', v_balance - v_credits);
end;
$$;

create or replace function public.cancel_booking(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid; v_role text; v_booking record; v_hours_until numeric; v_refund_pct numeric; v_refund int;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role into strict v_role from public.profiles where id = v_uid;
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.customer_id <> v_uid and v_role is distinct from 'ADMIN' then raise exception 'Not authorised'; end if;
  if v_booking.status = 'CANCELED' then return jsonb_build_object('booking_id', p_booking_id, 'status', 'CANCELED', 'refund', 0, 'message', 'Already canceled'); end if;
  v_hours_until := extract(epoch from (v_booking.start_ts - now())) / 3600.0;
  if v_hours_until > 6 then v_refund_pct := 1.0; elsif v_hours_until >= 1 then v_refund_pct := 0.5; else v_refund_pct := 0.0; end if;
  v_refund := floor(v_booking.credits_charged * v_refund_pct)::int;
  update public.bookings set status = 'CANCELED' where id = p_booking_id;
  if v_refund > 0 then insert into public.credit_ledger (user_id, delta, reason, related_booking_id) values (v_booking.customer_id, v_refund, format('Cancellation refund (%s%%)', (v_refund_pct * 100)::int), p_booking_id); end if;
  insert into public.audit_log (actor_user_id, action, entity_type, entity_id, metadata) values (v_uid, 'booking.canceled', 'booking', p_booking_id, jsonb_build_object('refund_credits', v_refund, 'refund_pct', v_refund_pct, 'hours_until_start', round(v_hours_until, 2), 'car_unit_id', v_booking.car_unit_id, 'canceled_by', case when v_booking.customer_id = v_uid then 'customer' else 'admin' end));
  return jsonb_build_object('booking_id', p_booking_id, 'status', 'CANCELED', 'refund', v_refund, 'refund_pct', v_refund_pct);
end;
$$;

revoke execute on function public.create_booking(uuid, timestamptz, timestamptz) from public;
grant  execute on function public.create_booking(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.cancel_booking(uuid) from public;
grant  execute on function public.cancel_booking(uuid) to authenticated;
revoke execute on function public.generate_vin() from public;
revoke execute on function public.generate_plate() from public;
grant  execute on function public.generate_vin() to authenticated;
grant  execute on function public.generate_plate() to authenticated;

-- ============================================================================
-- Migration 8: 20250209000007_normalize_class.sql
-- ============================================================================

-- 1. Derive class from stat_pi (ground truth for scraped data)
UPDATE public.car_models
SET class = CASE
  WHEN stat_pi >= 999 THEN 'X'
  WHEN stat_pi >= 901 THEN 'S2'
  WHEN stat_pi >= 801 THEN 'S1'
  WHEN stat_pi >= 701 THEN 'A'
  WHEN stat_pi >= 601 THEN 'B'
  WHEN stat_pi >= 501 THEN 'C'
  ELSE 'D'
END
WHERE stat_pi IS NOT NULL;

-- 2. Normalise existing string-based class values (legacy / manual rows)
UPDATE public.car_models
SET class = (
  CASE upper(trim(regexp_replace(class, '[\s\-_]+', '', 'g')))
    WHEN 'D'  THEN 'D'
    WHEN 'C'  THEN 'C'
    WHEN 'B'  THEN 'B'
    WHEN 'A'  THEN 'A'
    WHEN 'S1' THEN 'S1'
    WHEN 'S2' THEN 'S2'
    WHEN 'X'  THEN 'X'
    ELSE NULL
  END
)
WHERE stat_pi IS NULL
  AND class IS NOT NULL
  AND class NOT IN ('D', 'C', 'B', 'A', 'S1', 'S2', 'X');

-- 3. Index for fast exact-match filtering
CREATE INDEX IF NOT EXISTS idx_car_models_class
  ON public.car_models (class)
  WHERE class IS NOT NULL;

-- ============================================================================
-- Migration 9: 20250209000008_price_indexes_view.sql
-- ============================================================================

-- 1. Composite indexes for starting-price computation & availability queries

CREATE INDEX IF NOT EXISTS idx_car_units_model_active
  ON public.car_units (car_model_id)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_bookings_unit_confirmed
  ON public.bookings (car_unit_id, start_ts, end_ts)
  WHERE status = 'CONFIRMED';

CREATE INDEX IF NOT EXISTS idx_car_blackouts_unit_time
  ON public.car_blackouts (car_unit_id, start_ts, end_ts);

-- 2. VIEW: car_models_with_price

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

GRANT SELECT ON public.car_models_with_price TO anon, authenticated;

-- ============================================================================
-- Migration 10: 20250209000009_available_now.sql
-- ============================================================================

-- 1. SECURITY DEFINER function: available_unit_count(model_id)

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

-- 2. Extend view with available_unit_count

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

GRANT SELECT ON public.car_models_with_price TO anon, authenticated;

-- ============================================================================
-- Migration 11: 20250209000010_scale_down_pricing.sql
-- ============================================================================

-- Scale existing suggested_credits_per_hour by 0.30, round to nearest 5,
-- clamp to [10, 100].  Future imports use the same [10, 100] band directly.

UPDATE public.car_models
SET
  suggested_credits_per_hour = GREATEST(10, LEAST(100,
    round(suggested_credits_per_hour * 0.30 / 5.0) * 5
  )),
  updated_at = now()
WHERE suggested_credits_per_hour IS NOT NULL;

-- ============================================================================
-- Migration 12: 20250209000011_booking_pricing_caps.sql
-- ============================================================================

-- 1. New pricing-breakdown columns on bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pricing_mode     text,
  ADD COLUMN IF NOT EXISTS hourly_rate_used int,
  ADD COLUMN IF NOT EXISTS day_price_used   int,
  ADD COLUMN IF NOT EXISTS billable_days    int,
  ADD COLUMN IF NOT EXISTS duration_minutes int;

-- 2. Replace create_booking with day-cap / week-cap pricing
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
  v_cph            int;
  v_day_price      int;
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
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT role INTO STRICT v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'CUSTOMER' THEN
    RAISE EXCEPTION 'Only customers can create bookings';
  END IF;

  IF p_end_ts <= p_start_ts THEN RAISE EXCEPTION 'end_ts must be after start_ts'; END IF;
  IF p_start_ts <= now() THEN RAISE EXCEPTION 'Booking must start in the future'; END IF;

  v_start_utc := p_start_ts AT TIME ZONE 'UTC';
  v_end_utc   := p_end_ts   AT TIME ZONE 'UTC';

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

  SELECT * INTO v_unit FROM public.car_units WHERE id = p_car_unit_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Car unit not found or is not currently active'; END IF;

  SELECT * INTO v_model FROM public.car_models WHERE id = v_unit.car_model_id;

  IF EXISTS (
    SELECT 1 FROM public.car_blackouts b
     WHERE b.car_unit_id = p_car_unit_id AND b.start_ts < p_end_ts AND b.end_ts > p_start_ts
  ) THEN
    RAISE EXCEPTION 'Car unit is blacked out during the requested time window';
  END IF;

  v_cph := coalesce(v_unit.credits_per_hour, v_model.suggested_credits_per_hour);
  IF v_cph IS NULL OR v_cph <= 0 THEN
    RAISE EXCEPTION 'No credits-per-hour rate configured for this car unit';
  END IF;

  v_day_price := v_cph * 5;

  IF v_duration_hours <= 5 THEN
    v_credits       := ceil(v_cph * v_duration_hours)::int;
    v_pricing_mode  := 'HOURLY';
    v_billable_days := NULL;
  ELSE
    v_total_days   := ceil(v_duration_hours / 24.0)::int;
    v_weeks        := v_total_days / 7;
    v_remainder    := v_total_days % 7;
    v_rem_billable := LEAST(v_remainder, 5);
    v_billable_days := v_weeks * 5 + v_rem_billable;
    v_credits       := v_billable_days * v_day_price;
    IF v_total_days = 1 THEN v_pricing_mode := 'DAY_CAP';
    ELSE v_pricing_mode := 'WEEK_CAP'; END IF;
  END IF;

  SELECT coalesce(sum(delta), 0) INTO v_balance FROM public.credit_ledger WHERE user_id = v_uid;
  IF v_balance < v_credits THEN
    RAISE EXCEPTION 'Insufficient credit balance (have %, need %)', v_balance, v_credits;
  END IF;

  BEGIN
    INSERT INTO public.bookings
           (car_unit_id, customer_id, start_ts, end_ts, credits_charged,
            pricing_mode, hourly_rate_used, day_price_used, billable_days, duration_minutes)
    VALUES (p_car_unit_id, v_uid, p_start_ts, p_end_ts, v_credits,
            v_pricing_mode, v_cph, v_day_price, v_billable_days, v_duration_min)
    RETURNING id INTO v_booking_id;

    INSERT INTO public.credit_ledger (user_id, delta, reason, related_booking_id)
    VALUES (v_uid, -v_credits, 'Booking charge', v_booking_id);

    INSERT INTO public.audit_log (actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (v_uid, 'booking.created', 'booking', v_booking_id,
      jsonb_build_object(
        'car_unit_id', p_car_unit_id, 'car_model_id', v_unit.car_model_id,
        'start_ts', p_start_ts, 'end_ts', p_end_ts, 'credits', v_credits,
        'cph', v_cph, 'pricing_mode', v_pricing_mode,
        'billable_days', v_billable_days, 'duration_min', v_duration_min
      )
    );
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'This time slot is already booked for the selected car unit';
  END;

  RETURN jsonb_build_object(
    'booking_id', v_booking_id, 'credits_charged', v_credits,
    'balance_after', v_balance - v_credits, 'pricing_mode', v_pricing_mode,
    'hourly_rate', v_cph, 'day_price', v_day_price,
    'billable_days', v_billable_days, 'duration_minutes', v_duration_min
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_booking(uuid, timestamptz, timestamptz) FROM public;
GRANT  EXECUTE ON FUNCTION public.create_booking(uuid, timestamptz, timestamptz) TO authenticated;

-- ============================================================================
-- Migration 13: 20250209000012_car_image_thumb.sql
-- ============================================================================

ALTER TABLE public.car_models
  ADD COLUMN IF NOT EXISTS image_path        text,
  ADD COLUMN IF NOT EXISTS thumb_path        text,
  ADD COLUMN IF NOT EXISTS image_updated_at  timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_car_models_thumb_path
  ON public.car_models (thumb_path)
  WHERE thumb_path IS NOT NULL;

-- ============================================================================
-- DONE — All migrations applied.
-- ============================================================================
