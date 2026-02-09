-- ============================================================================
-- ForzaCars Rentals — Core Schema
-- Migration: 20250209000000_core_schema
-- ============================================================================

-- Required for the exclusion constraint on bookings.
-- btree_gist adds GiST index support for scalar types (=) so they can be
-- combined with range operators (&&) in a single exclusion constraint.
create extension if not exists btree_gist;

-- ============================================================================
-- 1. businesses
-- ============================================================================
create table public.businesses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 2. profiles
--    One row per auth.users entry; the FK cascades deletes from Supabase Auth.
-- ============================================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null default 'CUSTOMER'
              check (role in ('CUSTOMER', 'BUSINESS', 'ADMIN')),
  business_id uuid references public.businesses(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 3. cars
-- ============================================================================
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

-- ============================================================================
-- 4. car_availability_rules
--    Recurring weekly windows during which a car can be booked.
-- ============================================================================
create table public.car_availability_rules (
  id          uuid primary key default gen_random_uuid(),
  car_id      uuid not null references public.cars(id) on delete cascade,
  day_of_week int  not null check (day_of_week between 0 and 6),
  start_time  time not null,
  end_time    time not null,

  constraint car_availability_rules_time_order
    check (start_time < end_time)
);

create index idx_car_availability_rules_car_id
  on public.car_availability_rules (car_id);

-- ============================================================================
-- 5. car_blackouts
--    Ad-hoc date/time ranges where a car is unavailable (maintenance, etc.).
-- ============================================================================
create table public.car_blackouts (
  id       uuid primary key default gen_random_uuid(),
  car_id   uuid not null references public.cars(id) on delete cascade,
  start_ts timestamptz not null,
  end_ts   timestamptz not null,
  reason   text,

  constraint car_blackouts_ts_order
    check (start_ts < end_ts)
);

create index idx_car_blackouts_car_id on public.car_blackouts (car_id);

-- ============================================================================
-- 6. bookings
-- ============================================================================
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

  constraint bookings_ts_order
    check (start_ts < end_ts)
);

-- ---------------------------------------------------------------------------
-- Exclusion constraint — prevents overlapping CONFIRMED bookings for the same car.
--
-- How it works:
--   • (car_id WITH =)
--       Two rows conflict only when they reference the *same* car.
--   • (tstzrange(start_ts, end_ts, '[)') WITH &&)
--       Two rows conflict only when their time ranges overlap.
--       '[)' = start-inclusive, end-exclusive, so back-to-back bookings
--       (one ends at 14:00 and the next starts at 14:00) do NOT conflict.
--   • WHERE (status = 'CONFIRMED')
--       Canceled bookings are ignored; they never block new reservations.
--
-- Requires the btree_gist extension (enabled above) because the constraint
-- mixes equality (btree) and range overlap (GiST) operators.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    car_id with =,
    tstzrange(start_ts, end_ts, '[)') with &&
  ) where (status = 'CONFIRMED');

create index idx_bookings_car_id      on public.bookings (car_id);
create index idx_bookings_customer_id on public.bookings (customer_id);

-- ============================================================================
-- 7. credit_ledger
--    Append-only ledger tracking credit debits and credits per user.
-- ============================================================================
create table public.credit_ledger (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  delta              int  not null,
  reason             text not null,
  related_booking_id uuid references public.bookings(id) on delete set null,
  created_at         timestamptz not null default now()
);

create index idx_credit_ledger_user_id on public.credit_ledger (user_id);

-- ============================================================================
-- 8. audit_log
--    Generic append-only log for admin-visible activity.
-- ============================================================================
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
