-- HQ support console: case priority/source and staff-initiated case creation.

alter table public.support_cases
    add column if not exists priority text not null default 'medium'
        check (
            priority in ('low', 'medium', 'high', 'urgent')
        );

alter table public.support_cases
    add column if not exists source text not null default 'portal'
        check (
            source in ('portal', 'phone', 'email', 'hq', 'other')
        );

create index if not exists support_cases_status_idx
    on public.support_cases (status);

create index if not exists support_cases_assigned_to_idx
    on public.support_cases (assigned_to)
    where assigned_to is not null;

-- ---------------------------------------------------------------------------
-- RPC: Chaster staff creates a case for a tenant (first message is client-visible)
-- ---------------------------------------------------------------------------

create or replace function public.hq_create_support_case(
    p_tenant_id uuid,
    p_subject text,
    p_category text,
    p_initial_message text,
    p_priority text default 'medium',
    p_assign_to_self boolean default false,
    p_attachments jsonb default '[]'::jsonb
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
    if v_uid is null then
        raise exception 'not authenticated';
    end if;
    if not public.is_chaster_staff() then
        raise exception 'forbidden';
    end if;
    if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
        raise exception 'invalid tenant';
    end if;
    if
        p_category is null
        or p_category
        not in (
            'billing',
            'technical',
            'account',
            'ai_kb',
            'widget',
            'other'
        )
    then
        raise exception 'invalid category';
    end if;
    if
        p_priority is null
        or p_priority not in ('low', 'medium', 'high', 'urgent')
    then
        raise exception 'invalid priority';
    end if;
    if length(trim(coalesce(p_subject, ''))) < 1 then
        raise exception 'subject required';
    end if;
    if length(trim(coalesce(p_initial_message, ''))) < 1 then
        raise exception 'initial message required';
    end if;

    v_assignee := case
        when p_assign_to_self then v_uid
        else null
    end;

    v_num :=
        'CASE-'
        || lpad(
            nextval('public.support_case_number_seq')::text,
            6,
            '0'
        );

    insert into public.support_cases (
        tenant_id,
        case_number,
        subject,
        category,
        created_by,
        status,
        assigned_to,
        priority,
        source
    )
    values (
        p_tenant_id,
        v_num,
        trim(p_subject),
        p_category,
        v_uid,
        'open',
        v_assignee,
        p_priority,
        'hq'
    )
    returning id into v_case_id;

    insert into public.support_case_messages (
        case_id,
        sender_id,
        body,
        is_system,
        attachments
    )
    values (
        v_case_id,
        v_uid,
        trim(p_initial_message),
        false,
        coalesce(p_attachments, '[]'::jsonb)
    );

    return v_case_id;
end;
$$;

grant execute on function public.hq_create_support_case(
    uuid,
    text,
    text,
    text,
    text,
    boolean,
    jsonb
) to authenticated;
