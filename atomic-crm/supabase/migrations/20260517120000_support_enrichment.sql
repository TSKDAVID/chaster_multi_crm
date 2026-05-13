-- Support Enrichment: tags, follow-up date, related case, source selection,
-- assignee picker, internal notes at creation, description field.

-- ---------------------------------------------------------------------------
-- 1. New columns on support_cases
-- ---------------------------------------------------------------------------

alter table public.support_cases
    add column if not exists tags text[] not null default '{}',
    add column if not exists follow_up_at timestamptz,
    add column if not exists related_case_id uuid references public.support_cases (id) on delete set null;

create index if not exists support_cases_tags_idx
    on public.support_cases using gin (tags);

create index if not exists support_cases_follow_up_idx
    on public.support_cases (follow_up_at)
    where follow_up_at is not null and status not in ('resolved');

create index if not exists support_cases_related_idx
    on public.support_cases (related_case_id)
    where related_case_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Recreate hq_create_support_case with enriched parameters
-- ---------------------------------------------------------------------------

drop function if exists public.hq_create_support_case(uuid, text, text, text, text, boolean, jsonb);

create or replace function public.hq_create_support_case(
    p_tenant_id uuid,
    p_subject text,
    p_category text,
    p_initial_message text,
    p_priority text default 'medium',
    p_assign_to_self boolean default false,
    p_attachments jsonb default '[]'::jsonb,
    p_source text default 'hq',
    p_tags text[] default '{}',
    p_follow_up_at timestamptz default null,
    p_internal_note text default null,
    p_support_requester_id uuid default null,
    p_related_case_id uuid default null,
    p_description text default '',
    p_assign_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid;
    v_case_id uuid;
    v_num text;
    v_assignee uuid;
begin
    v_uid := auth.uid();
    if v_uid is null then raise exception 'not authenticated'; end if;
    if not public.is_chaster_staff() then raise exception 'forbidden'; end if;
    if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
        raise exception 'invalid tenant';
    end if;

    if p_category is null or p_category not in (
        'billing', 'technical', 'account', 'ai_kb', 'widget', 'other'
    ) then raise exception 'invalid category'; end if;

    if p_priority is null or p_priority not in ('low', 'medium', 'high', 'urgent') then
        raise exception 'invalid priority';
    end if;

    if length(trim(coalesce(p_subject, ''))) < 1 then
        raise exception 'subject required';
    end if;

    if length(trim(coalesce(p_initial_message, ''))) < 1 then
        raise exception 'initial message required';
    end if;

    -- Determine assignee: explicit pick > self > nobody
    v_assignee := case
        when p_assign_to is not null then p_assign_to
        when p_assign_to_self then v_uid
        else null
    end;

    v_num := 'CASE-' || lpad(nextval('public.support_case_number_seq')::text, 6, '0');

    insert into public.support_cases (
        tenant_id, case_number, subject, description, category, created_by,
        status, assigned_to, priority, source, tags, follow_up_at,
        support_requester_id, related_case_id
    ) values (
        p_tenant_id, v_num, trim(p_subject), trim(coalesce(p_description, '')),
        p_category, v_uid, 'open', v_assignee, p_priority,
        coalesce(p_source, 'hq'), coalesce(p_tags, '{}'),
        p_follow_up_at, p_support_requester_id, p_related_case_id
    )
    returning id into v_case_id;

    -- Initial message
    insert into public.support_case_messages (
        case_id, sender_id, body, is_system, attachments
    ) values (
        v_case_id, v_uid, trim(p_initial_message), false,
        coalesce(p_attachments, '[]'::jsonb)
    );

    -- Optional internal note
    if length(trim(coalesce(p_internal_note, ''))) > 0 then
        insert into public.support_case_internal_notes (
            case_id, author_id, body
        ) values (
            v_case_id, v_uid, trim(p_internal_note)
        );
    end if;

    return v_case_id;
end;
$$;

grant execute on function public.hq_create_support_case(
    uuid, text, text, text, text, boolean, jsonb,
    text, text[], timestamptz, text, uuid, uuid, text, uuid
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Recreate portal create_support_case with priority + tags
-- ---------------------------------------------------------------------------

drop function if exists public.create_support_case(text, text, text, jsonb);

create or replace function public.create_support_case(
    p_subject text,
    p_category text,
    p_body text,
    p_attachments jsonb default '[]'::jsonb,
    p_priority text default 'medium',
    p_tags text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tid uuid;
    v_uid uuid;
    v_case_id uuid;
    v_num text;
begin
    v_uid := auth.uid();
    if v_uid is null then raise exception 'not authenticated'; end if;
    v_tid := public.get_my_tenant_id();
    if v_tid is null then raise exception 'no tenant'; end if;
    if not public.has_tenant_role(array['member', 'admin', 'super_admin']::text[]) then
        raise exception 'forbidden';
    end if;

    perform public.check_support_case_rate_limit(v_uid);

    if p_category is null or p_category not in (
        'billing', 'technical', 'account', 'ai_kb', 'widget', 'other'
    ) then raise exception 'invalid category'; end if;

    if p_priority is null or p_priority not in ('low', 'medium', 'high', 'urgent') then
        p_priority := 'medium';
    end if;

    if length(trim(coalesce(p_subject, ''))) < 1 then
        raise exception 'subject required';
    end if;
    if length(trim(coalesce(p_body, ''))) < 1
        and coalesce(jsonb_array_length(p_attachments), 0) < 1
    then
        raise exception 'description or attachment required';
    end if;

    v_num := 'CASE-' || lpad(nextval('public.support_case_number_seq')::text, 6, '0');

    insert into public.support_cases (
        tenant_id, case_number, subject, category, status, priority,
        source, created_by, tags
    ) values (
        v_tid, v_num, trim(p_subject), p_category, 'open',
        p_priority, 'portal', v_uid, coalesce(p_tags, '{}')
    )
    returning id into v_case_id;

    if length(trim(coalesce(p_body, ''))) > 0 or coalesce(jsonb_array_length(p_attachments), 0) > 0 then
        insert into public.support_case_messages (
            case_id, sender_id, body, is_system, attachments
        ) values (
            v_case_id, v_uid, coalesce(trim(p_body), ''), false, p_attachments
        );
    end if;

    insert into public.support_case_messages (
        case_id, sender_id, body, is_system, metadata
    ) values (
        v_case_id, null, 'Case created by portal user.', true,
        jsonb_build_object('event', 'case_created', 'actor', v_uid)
    );

    return v_case_id;
end;
$$;

grant execute on function public.create_support_case(text, text, text, jsonb, text, text[]) to authenticated;
