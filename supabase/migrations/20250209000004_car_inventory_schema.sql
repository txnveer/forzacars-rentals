-- ============================================================================
-- ForzaCars Rentals — Two-Layer Car Inventory Model
-- Migration: 20250209000004_car_inventory_schema
--
-- Separates the global catalog (car_models) from business inventory instances
-- (car_units).  Bookings, blackouts, and availability rules now attach to
-- specific car_units, not to abstract models.
--
-- Phases:
--   1. Create car_models (global catalog)
--   2. Migrate cars_catalog data into car_models
--   3. Create VIN & license-plate generator functions
--   4. Create car_units (business inventory)
--   5. Migrate existing "cars" rows → car_models + car_units
--   6. Re-wire bookings / car_blackouts / car_availability_rules
--   7. Drop legacy tables (cars, cars_catalog)
-- ============================================================================


-- ############################################################################
-- 1. car_models — global, read-only catalog of vehicle models
-- ############################################################################

create table public.car_models (
  id                        uuid primary key default gen_random_uuid(),
  source                    text not null default 'forza.fandom',
  source_game               text not null default 'Forza Horizon 2',
  wiki_page_title           text not null,
  wiki_page_url             text,
  year                      int,
  manufacturer              text,
  model                     text,
  display_name              text not null,   -- human-readable label
  universe                  text,
  class                     text,
  image_url                 text,
  stat_speed                int,
  stat_handling             int,
  stat_acceleration         int,
  stat_launch               int,
  stat_braking              int,
  stat_pi                   int,
  suggested_credits_per_hour int,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Idempotent upsert key for scraped data
  constraint car_models_source_unique
    unique (source, source_game, wiki_page_title)
);

create index idx_car_models_manufacturer_model on public.car_models (manufacturer, model);
create index idx_car_models_source_game        on public.car_models (source_game);
create index idx_car_models_stat_pi            on public.car_models (stat_pi);

comment on table public.car_models is
  'Global catalog of vehicle models.  Populated by scraper scripts or '
  'manually by admins.  Business fleet instances live in car_units.';


-- ############################################################################
-- 2. Migrate cars_catalog → car_models
-- ############################################################################

insert into public.car_models (
  source, source_game, wiki_page_title, wiki_page_url,
  year, manufacturer, model,
  display_name,
  image_url,
  stat_speed, stat_handling, stat_acceleration, stat_launch, stat_braking, stat_pi,
  created_at, updated_at
)
select
  source, source_game, wiki_page_title, wiki_page_url,
  year, manufacturer, model,
  -- display_name: "Manufacturer Model" with fallback to wiki_page_title
  coalesce(
    nullif(trim(coalesce(manufacturer, '') || ' ' || coalesce(model, '')), ''),
    wiki_page_title
  ),
  image_url,
  stat_speed, stat_handling, stat_acceleration, stat_launch, stat_braking, stat_pi,
  created_at, updated_at
from public.cars_catalog;


-- ############################################################################
-- 3. VIN & license-plate generators
--
--    Both functions loop until they produce a value that does not collide
--    with an existing row in car_units.  The UNIQUE constraint is a safety
--    net; the loop prevents wasteful constraint-violation retries.
-- ############################################################################

-- VIN: 17 characters, uppercase letters + digits, excluding I/O/Q (per
-- real VIN spec chars used in positions 10-17).
-- Character pool: ABCDEFGHJKLMNPRSTUVWXYZ0123456789 (33 chars)
-- Collision probability: 33^17 ≈ 1.6 × 10^25 — effectively zero.

create or replace function public.generate_vin()
returns text
language plpgsql
as $$
declare
  chars  constant text := 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  result text;
  i      int;
begin
  loop
    result := '';
    for i in 1..17 loop
      result := result || substr(chars, floor(random() * 33 + 1)::int, 1);
    end loop;
    -- Exit when no collision (table may not have rows yet — that's fine)
    exit when not exists (select 1 from public.car_units where vin = result);
  end loop;
  return result;
end;
$$;

comment on function public.generate_vin() is
  'Generates a 17-character VIN-like string (A-Z excl. I/O/Q + 0-9). '
  'Loops until unique within car_units to prevent constraint violations.';


-- Plate: FCR-XXXXXX  (6 uppercase alphanumerics)

create or replace function public.generate_plate()
returns text
language plpgsql
as $$
declare
  chars  constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  suffix text;
  i      int;
begin
  loop
    suffix := '';
    for i in 1..6 loop
      suffix := suffix || substr(chars, floor(random() * 36 + 1)::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.car_units where license_plate = 'FCR-' || suffix
    );
  end loop;
  return 'FCR-' || suffix;
end;
$$;

comment on function public.generate_plate() is
  'Generates a license plate like FCR-XXXXXX (6 alphanumerics). '
  'Loops until unique within car_units.';


-- ############################################################################
-- 4. car_units — business inventory instances
-- ############################################################################

create table public.car_units (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  car_model_id    uuid not null references public.car_models(id) on delete restrict,
  display_name    text,                        -- optional override; fallback to car_models.display_name
  color           text,
  color_hex       text,
  vin             text not null unique default public.generate_vin(),
  license_plate   text not null unique default public.generate_plate(),
  credits_per_hour int,                        -- override; null → use car_models.suggested_credits_per_hour
  active          bool not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_car_units_business_id  on public.car_units (business_id);
create index idx_car_units_car_model_id on public.car_units (car_model_id);
create index idx_car_units_active       on public.car_units (active) where active = true;

comment on table public.car_units is
  'Physical rentable car instances owned by a business.  Each unit '
  'references a car_model (the global catalog entry) and can override '
  'display_name and credits_per_hour.  Bookings, blackouts, and '
  'availability rules attach to car_units, not car_models.';


-- ############################################################################
-- 5. Migrate existing "cars" rows → car_models + car_units
--
--    Each legacy car gets a car_model entry (source = 'legacy') so the FK
--    to car_models is satisfied.  Then a matching car_unit is created.
--    A temp table tracks the old_car_id → new car_unit_id mapping so we
--    can re-wire bookings, blackouts, and availability rules.
-- ############################################################################

-- 5a. Create a temporary mapping table
create temp table _car_migration (
  old_car_id   uuid not null,
  car_model_id uuid,
  car_unit_id  uuid
);

-- 5b. Insert a car_model per legacy car
insert into public.car_models (source, source_game, wiki_page_title, display_name, universe, class, suggested_credits_per_hour)
select
  'legacy',
  'manual',
  'legacy:' || c.id::text,          -- guaranteed unique per car
  c.name,
  c.universe,
  c.class,
  c.credits_per_hour
from public.cars c;

-- Record the mapping old_car_id → car_model_id
insert into _car_migration (old_car_id, car_model_id)
select c.id, cm.id
from public.cars c
join public.car_models cm
  on cm.source = 'legacy'
 and cm.wiki_page_title = 'legacy:' || c.id::text;

-- 5c. Insert a car_unit per legacy car
insert into public.car_units (business_id, car_model_id, display_name, credits_per_hour, active)
select c.business_id, m.car_model_id, c.name, c.credits_per_hour, c.active
from public.cars c
join _car_migration m on m.old_car_id = c.id;

-- Record car_unit_id into the mapping
update _car_migration m
   set car_unit_id = cu.id
  from public.car_units cu
 where cu.car_model_id = m.car_model_id;


-- ############################################################################
-- 6. Re-wire referencing tables: car_id → car_unit_id
-- ############################################################################

-- ------ 6a. bookings ------

-- Drop the old exclusion constraint (references car_id)
alter table public.bookings drop constraint if exists bookings_no_overlap;

-- Add new column
alter table public.bookings add column car_unit_id uuid;

-- Populate from migration mapping
update public.bookings b
   set car_unit_id = m.car_unit_id
  from _car_migration m
 where b.car_id = m.old_car_id;

-- Make NOT NULL (safe: if there are orphan bookings with no mapping, they get
-- a NULL car_unit_id.  In practice the mapping covers every existing car.)
-- For safety, delete any bookings that couldn't be mapped (shouldn't happen).
delete from public.bookings where car_unit_id is null and car_id is not null;

alter table public.bookings alter column car_unit_id set not null;
alter table public.bookings
  add constraint bookings_car_unit_id_fkey
  foreign key (car_unit_id) references public.car_units(id) on delete cascade;

-- Drop old column and its index/FK
drop index if exists public.idx_bookings_car_id;
alter table public.bookings drop column car_id;

-- Re-create the overlap exclusion constraint on car_unit_id
-- Prevents two CONFIRMED bookings for the same physical unit from overlapping.
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    car_unit_id with =,
    tstzrange(start_ts, end_ts, '[)') with &&
  ) where (status = 'CONFIRMED');

create index idx_bookings_car_unit_id on public.bookings (car_unit_id);

comment on constraint bookings_no_overlap on public.bookings is
  'GiST exclusion: prevents overlapping CONFIRMED bookings for the same '
  'physical car_unit.  Uses [) range so back-to-back slots don''t conflict.';


-- ------ 6b. car_blackouts ------

alter table public.car_blackouts add column car_unit_id uuid;

update public.car_blackouts bo
   set car_unit_id = m.car_unit_id
  from _car_migration m
 where bo.car_id = m.old_car_id;

delete from public.car_blackouts where car_unit_id is null and car_id is not null;

alter table public.car_blackouts alter column car_unit_id set not null;
alter table public.car_blackouts
  add constraint car_blackouts_car_unit_id_fkey
  foreign key (car_unit_id) references public.car_units(id) on delete cascade;

drop index if exists public.idx_car_blackouts_car_id;
alter table public.car_blackouts drop column car_id;

create index idx_car_blackouts_car_unit_id on public.car_blackouts (car_unit_id);


-- ------ 6c. car_availability_rules ------

alter table public.car_availability_rules add column car_unit_id uuid;

update public.car_availability_rules ar
   set car_unit_id = m.car_unit_id
  from _car_migration m
 where ar.car_id = m.old_car_id;

delete from public.car_availability_rules where car_unit_id is null and car_id is not null;

alter table public.car_availability_rules alter column car_unit_id set not null;
alter table public.car_availability_rules
  add constraint car_availability_rules_car_unit_id_fkey
  foreign key (car_unit_id) references public.car_units(id) on delete cascade;

drop index if exists public.idx_car_availability_rules_car_id;
alter table public.car_availability_rules drop column car_id;

create index idx_car_availability_rules_car_unit_id
  on public.car_availability_rules (car_unit_id);


-- ############################################################################
-- 7. Drop legacy tables
-- ############################################################################

-- cars_catalog is fully migrated to car_models
drop table if exists public.cars_catalog cascade;

-- cars is fully migrated to car_models + car_units
drop table if exists public.cars cascade;

-- Temp table auto-drops at end of session but be explicit
drop table if exists _car_migration;
