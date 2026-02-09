-- ============================================================================
-- ForzaCars Rentals — Cars Catalog (wiki-sourced reference data)
-- Migration: 20250209000003_cars_catalog
--
-- A separate catalog table for cars imported from external sources
-- (e.g. Forza wiki).  This is reference data — businesses later pick
-- from the catalog to add to their fleet in the `cars` table.
-- ============================================================================

create table public.cars_catalog (
  id                uuid primary key default gen_random_uuid(),

  -- Vehicle identity
  year              int,
  manufacturer      text,
  model             text,

  -- Wiki provenance
  wiki_page_title   text,
  wiki_page_url     text,
  image_url         text,

  -- Performance stats (speed/handling/accel/launch/braking are
  -- stored as the original 0-10 float × 10, giving an integer on
  -- a 0-100 scale.  e.g. wiki value 5.1 → stored as 51).
  stat_speed        int,
  stat_handling     int,
  stat_acceleration int,
  stat_launch       int,
  stat_braking      int,

  -- Performance Index — stored as-is (e.g. 100, 526, 998)
  stat_pi           int,

  -- Source tracking
  source            text not null default 'forza.fandom',
  source_game       text not null default 'Forza Horizon 2',

  -- Timestamps
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Idempotency: re-running the import upserts by this key
  constraint cars_catalog_source_unique
    unique (source, source_game, wiki_page_title)
);

create index idx_cars_catalog_manufacturer on public.cars_catalog (manufacturer);
create index idx_cars_catalog_source_game  on public.cars_catalog (source_game);

-- ============================================================================
-- RLS — publicly readable catalog, writes only via service-role scripts
-- ============================================================================

alter table public.cars_catalog enable row level security;

-- Anyone (including anon) can read the catalog
create policy "cars_catalog: public read"
  on public.cars_catalog for select
  using (true);

-- No INSERT / UPDATE / DELETE policies → only the import script
-- (which uses the service-role key and bypasses RLS) can write.
