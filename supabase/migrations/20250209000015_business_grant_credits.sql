-- ============================================================================
-- ForzaCars Rentals — Business Credit Granting
-- Migration: 20250209000015_business_grant_credits
--
-- Allows BUSINESS users to grant credits to customers within their threads.
-- ============================================================================

-- ############################################################################
-- 1. business_grant_credits RPC
--    Called by BUSINESS users to grant credits to customers.
-- ############################################################################

create or replace function public.business_grant_credits(
  p_user_id   uuid,
  p_amount    int,
  p_reason    text,
  p_thread_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid;
  v_role          text;
  v_business_id   uuid;
  v_entry_id      uuid;
  v_new_balance   int;
  v_thread        record;
  v_msg_id        uuid;
begin
  -- ==================================================================
  -- 1. Authenticate & authorise (BUSINESS only)
  -- ==================================================================
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select role, business_id
    into strict v_role, v_business_id
    from public.profiles
   where id = v_uid;

  if v_role is distinct from 'BUSINESS' then
    raise exception 'Only business users can use this function';
  end if;

  if v_business_id is null then
    raise exception 'Business user must be associated with a business';
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

  -- Thread must exist
  select * into v_thread
    from public.message_threads
   where id = p_thread_id;

  if not found then
    raise exception 'Thread not found';
  end if;

  -- ==================================================================
  -- 3. Verify caller is participant in the thread
  --    Business can grant credits if:
  --    a) They created the thread, OR
  --    b) Thread's business_id matches their business_id, OR
  --    c) They have sent/received messages in this thread
  -- ==================================================================
  if v_thread.created_by <> v_uid
     and (v_thread.business_id is null or v_thread.business_id <> v_business_id)
     and not exists (
       select 1 from public.messages m
        where m.thread_id = p_thread_id
          and (m.sender_id = v_uid or m.recipient_id = v_uid)
     )
  then
    raise exception 'Not authorized to grant credits in this thread';
  end if;

  -- ==================================================================
  -- 4. Insert ledger entry + audit log
  -- ==================================================================
  insert into public.credit_ledger (user_id, delta, reason)
  values (
    p_user_id,
    p_amount,
    format('%s (thread: %s)', trim(p_reason), p_thread_id)
  )
  returning id into v_entry_id;

  select coalesce(sum(delta), 0)
    into v_new_balance
    from public.credit_ledger
   where user_id = p_user_id;

  insert into public.audit_log
         (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_uid,
    'credits.business_granted',
    'profile',
    p_user_id,
    jsonb_build_object(
      'amount',          p_amount,
      'reason',          trim(p_reason),
      'new_balance',     v_new_balance,
      'thread_id',       p_thread_id,
      'business_id',     v_business_id,
      'ledger_entry_id', v_entry_id
    )
  );

  -- ==================================================================
  -- 5. Post automatic confirmation message in thread
  -- ==================================================================
  insert into public.messages
         (thread_id, sender_id, recipient_id, body)
  values (
    p_thread_id,
    v_uid,
    p_user_id,
    format('Granted %s credits. Reason: %s', p_amount, trim(p_reason))
  )
  returning id into v_msg_id;

  -- Update thread last_message_at
  update public.message_threads
     set last_message_at = now()
   where id = p_thread_id;

  return jsonb_build_object(
    'user_id',     p_user_id,
    'granted',     p_amount,
    'new_balance', v_new_balance,
    'message_id',  v_msg_id
  );
end;
$$;

comment on function public.business_grant_credits(uuid, int, text, uuid) is
  'RPC – BUSINESS-only. Grants credits to a user within a message thread context. '
  'Posts an automatic confirmation message in the thread.';

-- ############################################################################
-- 2. EXECUTE privilege lockdown
-- ############################################################################

revoke execute on function public.business_grant_credits(uuid, int, text, uuid) from public;
grant  execute on function public.business_grant_credits(uuid, int, text, uuid) to authenticated;
