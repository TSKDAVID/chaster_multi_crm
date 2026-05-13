-- Email-to-Case: smart threading, duplicate detection, merge/unmerge support.

-- ---------------------------------------------------------------------------
-- 1. Email columns on support_cases
-- ---------------------------------------------------------------------------

alter table public.support_cases
    add column source_email text,
    add column email_thread_id text,
    add column possible_duplicate_of uuid references public.support_cases (id) on delete set null,
    add column duplicate_confidence float,
    add column merged_into_case_id uuid references public.support_cases (id) on delete set null,
    add column merged_at timestamptz,
    add column merged_by uuid references auth.users (id);

create index support_cases_email_thread_idx
    on public.support_cases using btree (email_thread_id)
    where email_thread_id is not null;

create index support_cases_source_email_idx
    on public.support_cases using btree (source_email)
    where source_email is not null;

create index support_cases_possible_dup_idx
    on public.support_cases (possible_duplicate_of)
    where possible_duplicate_of is not null and merged_into_case_id is null;

-- ---------------------------------------------------------------------------
-- 2. Email columns on support_case_messages
-- ---------------------------------------------------------------------------

alter table public.support_case_messages
    add column email_message_id text,
    add column original_case_id uuid references public.support_cases (id) on delete set null;

create index support_case_messages_email_msg_idx
    on public.support_case_messages using btree (email_message_id)
    where email_message_id is not null;

-- ---------------------------------------------------------------------------
-- 3. email_subject_aliases table
-- ---------------------------------------------------------------------------

create table public.email_subject_aliases (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null references public.support_cases (id) on delete cascade,
    subject_normalized text not null,
    sender_email text not null,
    created_at timestamptz not null default now(),
    unique (subject_normalized, sender_email)
);

create index email_subject_aliases_lookup_idx
    on public.email_subject_aliases using btree (subject_normalized, sender_email);

alter table public.email_subject_aliases enable row level security;

create policy email_subject_aliases_select on public.email_subject_aliases
    for select to authenticated
    using (public.is_chaster_staff());

create policy email_subject_aliases_manage on public.email_subject_aliases
    for all to service_role
    using (true)
    with check (true);

grant select on public.email_subject_aliases to authenticated;
grant all on table public.email_subject_aliases to service_role;

-- ---------------------------------------------------------------------------
-- 4. case_merge_log table
-- ---------------------------------------------------------------------------

create table public.case_merge_log (
    id uuid primary key default gen_random_uuid(),
    source_case_id uuid not null references public.support_cases (id) on delete cascade,
    target_case_id uuid not null references public.support_cases (id) on delete cascade,
    action text not null check (action in ('auto_merge', 'manual_merge', 'unmerge')),
    performed_by uuid references auth.users (id),
    reason text,
    messages_moved jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create index case_merge_log_source_idx on public.case_merge_log using btree (source_case_id);
create index case_merge_log_target_idx on public.case_merge_log using btree (target_case_id);

alter table public.case_merge_log enable row level security;

create policy case_merge_log_select on public.case_merge_log
    for select to authenticated
    using (
        public.is_chaster_staff()
        or exists (
            select 1 from public.support_cases sc
            where (sc.id = case_merge_log.source_case_id or sc.id = case_merge_log.target_case_id)
              and sc.tenant_id = public.get_my_tenant_id()
        )
    );

create policy case_merge_log_insert_staff on public.case_merge_log
    for insert to authenticated
    with check (public.is_chaster_staff());

grant select, insert on public.case_merge_log to authenticated;
grant all on table public.case_merge_log to service_role;

-- ---------------------------------------------------------------------------
-- 5. Auto-merge setting in tenant_settings
-- ---------------------------------------------------------------------------

alter table public.tenant_settings
    add column email_auto_merge_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- 6. Email subject normalization function
-- ---------------------------------------------------------------------------

create or replace function public.normalize_email_subject(p_subject text)
returns text
language sql
immutable
as $$
    select lower(trim(regexp_replace(
        coalesce(p_subject, ''),
        '^\s*(re|fwd|fw)\s*:\s*',
        '',
        'gi'
    )));
$$;

-- ---------------------------------------------------------------------------
-- 7. Merge cases RPC
-- ---------------------------------------------------------------------------

create or replace function public.merge_support_cases(
    p_source_case_id uuid,
    p_target_case_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
    v_uid uuid;
    v_source record;
    v_target record;
    v_moved_ids uuid[];
    v_subject_norm text;
begin
    v_uid := auth.uid();
    if v_uid is null then raise exception 'not authenticated'; end if;
    if not public.is_chaster_staff() then raise exception 'forbidden'; end if;

    select * into v_source from public.support_cases where id = p_source_case_id;
    select * into v_target from public.support_cases where id = p_target_case_id;

    if v_source.id is null then raise exception 'source case not found'; end if;
    if v_target.id is null then raise exception 'target case not found'; end if;
    if v_source.id = v_target.id then raise exception 'cannot merge case into itself'; end if;
    if v_source.merged_into_case_id is not null then raise exception 'source already merged'; end if;

    -- Collect message IDs being moved
    select array_agg(id) into v_moved_ids
    from public.support_case_messages
    where case_id = p_source_case_id;

    -- Move messages, recording original_case_id for undo
    update public.support_case_messages
    set case_id = p_target_case_id,
        original_case_id = coalesce(original_case_id, p_source_case_id)
    where case_id = p_source_case_id;

    -- Register subject alias so future replies route to target
    v_subject_norm := public.normalize_email_subject(v_source.subject);
    if v_source.source_email is not null and v_subject_norm <> '' then
        insert into public.email_subject_aliases (case_id, subject_normalized, sender_email)
        values (p_target_case_id, v_subject_norm, lower(v_source.source_email))
        on conflict (subject_normalized, sender_email) do update set case_id = p_target_case_id;
    end if;

    -- Mark source as merged
    update public.support_cases
    set merged_into_case_id = p_target_case_id,
        merged_at = now(),
        merged_by = v_uid,
        status = 'resolved',
        possible_duplicate_of = null,
        duplicate_confidence = null
    where id = p_source_case_id;

    -- System message on target
    insert into public.support_case_messages (case_id, sender_id, body, is_system, metadata)
    values (
        p_target_case_id, null,
        format('Case %s was merged into this case.', v_source.case_number),
        true,
        jsonb_build_object('event', 'case_merged', 'source_case_id', p_source_case_id, 'actor', v_uid)
    );

    -- Log
    insert into public.case_merge_log (source_case_id, target_case_id, action, performed_by, reason, messages_moved)
    values (
        p_source_case_id, p_target_case_id, 'manual_merge', v_uid,
        format('Merged by staff: %s messages moved', coalesce(array_length(v_moved_ids, 1), 0)),
        to_jsonb(coalesce(v_moved_ids, array[]::uuid[]))
    );

    return p_target_case_id;
end;
$$;

grant execute on function public.merge_support_cases(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Unmerge / undo RPC
-- ---------------------------------------------------------------------------

create or replace function public.unmerge_support_case(p_source_case_id uuid)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
    v_uid uuid;
    v_source record;
    v_log record;
    v_moved_ids uuid[];
begin
    v_uid := auth.uid();
    if v_uid is null then raise exception 'not authenticated'; end if;
    if not public.is_chaster_staff() then raise exception 'forbidden'; end if;

    select * into v_source from public.support_cases where id = p_source_case_id;
    if v_source.id is null then raise exception 'case not found'; end if;
    if v_source.merged_into_case_id is null then raise exception 'case is not merged'; end if;

    -- Find the most recent merge log for this source
    select * into v_log
    from public.case_merge_log
    where source_case_id = p_source_case_id
      and action in ('auto_merge', 'manual_merge')
    order by created_at desc
    limit 1;

    -- Move messages back to original case
    update public.support_case_messages
    set case_id = p_source_case_id
    where original_case_id = p_source_case_id
      and case_id = v_source.merged_into_case_id;

    -- Remove subject aliases pointing to the target for this source's email
    if v_source.source_email is not null then
        delete from public.email_subject_aliases
        where case_id = v_source.merged_into_case_id
          and sender_email = lower(v_source.source_email)
          and subject_normalized = public.normalize_email_subject(v_source.subject);
    end if;

    -- Clear merge status and reopen
    update public.support_cases
    set merged_into_case_id = null,
        merged_at = null,
        merged_by = null,
        status = 'open'
    where id = p_source_case_id;

    -- System message
    insert into public.support_case_messages (case_id, sender_id, body, is_system, metadata)
    values (
        p_source_case_id, null,
        'This case was unmerged and reopened.',
        true,
        jsonb_build_object('event', 'case_unmerged', 'actor', v_uid)
    );

    -- Log
    insert into public.case_merge_log (source_case_id, target_case_id, action, performed_by, reason)
    values (
        p_source_case_id,
        v_source.merged_into_case_id,
        'unmerge',
        v_uid,
        'Merge reversed by staff'
    );

    return p_source_case_id;
end;
$$;

grant execute on function public.unmerge_support_case(uuid) to authenticated;
