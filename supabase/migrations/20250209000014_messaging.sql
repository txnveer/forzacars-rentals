-- ============================================================================
-- ForzaCars Rentals — MVP Messaging System
-- Migration: 20250209000014_messaging
--
-- Creates message_threads and messages tables for user-to-user messaging.
-- ============================================================================

-- ############################################################################
-- 1. message_threads
-- ############################################################################

create table public.message_threads (
  id              uuid primary key default gen_random_uuid(),
  subject         text null,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  business_id     uuid null references public.businesses(id) on delete set null,
  customer_id     uuid null references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

-- Index for sorting threads by recency
create index idx_message_threads_last_message_at
  on public.message_threads (last_message_at desc);

-- ############################################################################
-- 2. messages
-- ############################################################################

create table public.messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.message_threads(id) on delete cascade,
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  business_id  uuid null references public.businesses(id) on delete set null,
  body         text not null,
  created_at   timestamptz not null default now(),
  read_at      timestamptz null
);

-- Index for fetching messages in a thread chronologically
create index idx_messages_thread_created
  on public.messages (thread_id, created_at desc);

-- Index for finding unread messages for a user
create index idx_messages_recipient_unread
  on public.messages (recipient_id, read_at);

-- ############################################################################
-- 3. Trigger to update last_message_at on new message
-- ############################################################################

create or replace function public.update_thread_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.message_threads
  set last_message_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

create trigger on_message_insert_update_thread
  after insert on public.messages
  for each row
  execute function public.update_thread_last_message_at();

-- ############################################################################
-- 4. Enable RLS
-- ############################################################################

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;

-- ############################################################################
-- 5. RLS Policies for message_threads
-- ############################################################################

-- Helper function: check if user is a participant in a thread
create or replace function public.is_thread_participant(thread_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = thread_uuid
      and (
        t.created_by = (select auth.uid())
        or t.customer_id = (select auth.uid())
        or exists (
          select 1 from public.messages m
          where m.thread_id = t.id
            and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
        )
      )
  )
$$;

-- SELECT: user can read threads they participate in
create policy "message_threads: participants can read"
  on public.message_threads for select
  to authenticated
  using (
    created_by = auth.uid()
    or customer_id = auth.uid()
    or exists (
      select 1 from public.messages m
      where m.thread_id = id
        and (m.sender_id = auth.uid() or m.recipient_id = auth.uid())
    )
  );

-- SELECT: admins can read all
create policy "message_threads: admins can read all"
  on public.message_threads for select
  to authenticated
  using (public.is_admin());

-- INSERT: authenticated users can create threads
create policy "message_threads: authenticated can create"
  on public.message_threads for insert
  to authenticated
  with check (created_by = auth.uid());

-- UPDATE: participants can update (for last_message_at trigger, handled by definer)
-- We allow the trigger to update via security definer, no direct user updates needed
create policy "message_threads: admins can update"
  on public.message_threads for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ############################################################################
-- 6. RLS Policies for messages
-- ############################################################################

-- SELECT: user can read messages where they are sender or recipient
create policy "messages: participants can read"
  on public.messages for select
  to authenticated
  using (
    sender_id = auth.uid()
    or recipient_id = auth.uid()
  );

-- SELECT: admins can read all
create policy "messages: admins can read all"
  on public.messages for select
  to authenticated
  using (public.is_admin());

-- INSERT: user can send messages if they are the sender and participate in thread
create policy "messages: participants can send"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_thread_participant(thread_id)
  );

-- UPDATE: recipient can update (to set read_at)
create policy "messages: recipient can update read_at"
  on public.messages for update
  to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- UPDATE: admins can update all
create policy "messages: admins can update all"
  on public.messages for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
