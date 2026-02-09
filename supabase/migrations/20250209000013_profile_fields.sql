-- ============================================================================
-- ForzaCars Rentals — Profile Fields Extension
-- Migration: 20250209000013_profile_fields
--
-- Adds user profile fields: display_name, phone, bio, avatar_path, updated_at
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add new columns to profiles table
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists display_name text null,
  add column if not exists phone text null,
  add column if not exists bio text null,
  add column if not exists avatar_path text null,
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- 2. Trigger to auto-update updated_at on row modification
-- ---------------------------------------------------------------------------

create or replace function public.handle_profiles_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Drop trigger if exists (idempotent re-runs)
drop trigger if exists on_profiles_updated on public.profiles;

create trigger on_profiles_updated
  before update on public.profiles
  for each row
  execute function public.handle_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS policies are already in place from 20250209000001_rls_policies.sql:
--    - "profiles: users can read own profile"       (SELECT, id = auth.uid())
--    - "profiles: users can update own profile"     (UPDATE, id = auth.uid())
--    - "profiles: admins can read all"              (SELECT, is_admin())
--    - "profiles: admins can update all"            (UPDATE, is_admin())
--
-- No changes needed — these policies apply to the new columns automatically.
-- ---------------------------------------------------------------------------
