-- Case description (Salesforce-style); also seeds first client-visible message for staff-created cases.

alter table public.support_cases
    add column if not exists description text not null default '';

comment on column public.support_cases.description is
    'Case description for context; HQ creation copies this to the first thread message when applicable.';

-- PostgreSQL does not allow renaming parameters with CREATE OR REPLACE; drop first.
drop function if exists public.hq_create_support_case(
    uuid,
    text,
    text,
    text,
    text,
    boolean,
    jsonb
);

drop function if exists public.hq_create_support_prospect_case(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    boolean,
    jsonb,
    text
);

-- ---------------------------------------------------------------------------
-- HQ: tenant case — p_description replaces p_initial_message (same position)
-- ---------------------------------------------------------------------------

create or replace function public.hq_create_support_case(
    p_tenant_id uuid,
    p_subject text,
    p_category text,
    p_description text,
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
    v_desc text;
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

    v_desc := trim(coalesce(p_description, ''));
    if length(v_desc) < 1 then
        raise exception 'description required';
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
        description,
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
        v_desc,
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
        v_desc,
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

-- ---------------------------------------------------------------------------
-- HQ: prospect case
-- ---------------------------------------------------------------------------

create or replace function public.hq_create_support_prospect_case(
    p_organization_name text,
    p_contact_first_name text,
    p_contact_last_name text,
    p_email text,
    p_phone text,
    p_subject text,
    p_category text,
    p_description text,
    p_priority text default 'medium',
    p_assign_to_self boolean default false,
    p_attachments jsonb default '[]'::jsonb,
    p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid uuid;
    v_case_id uuid;
    v_requester_id uuid;
    v_num text;
    v_assignee uuid;
    v_org text;
    v_email text;
    v_phone text;
    v_desc text;
begin
    v_uid := auth.uid();
    if v_uid is null then
        raise exception 'not authenticated';
    end if;
    if not public.is_chaster_staff() then
        raise exception 'forbidden';
    end if;

    v_org := trim(coalesce(p_organization_name, ''));
    if length(v_org) < 1 then
        raise exception 'organization name required';
    end if;

    v_email := nullif(lower(trim(coalesce(p_email, ''))), '');
    v_phone := nullif(trim(coalesce(p_phone, '')), '');
    if v_email is null and v_phone is null then
        raise exception 'email or phone required';
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

    v_desc := trim(coalesce(p_description, ''));
    if length(v_desc) < 1 then
        raise exception 'description required';
    end if;

    v_assignee := case
        when p_assign_to_self then v_uid
        else null
    end;

    insert into public.support_requesters (
        organization_name,
        contact_first_name,
        contact_last_name,
        email,
        phone,
        notes
    )
    values (
        v_org,
        nullif(trim(coalesce(p_contact_first_name, '')), ''),
        nullif(trim(coalesce(p_contact_last_name, '')), ''),
        v_email,
        v_phone,
        case
            when p_notes is not null and length(trim(p_notes)) > 0
            then trim(p_notes)
            else null
        end
    )
    returning id into v_requester_id;

    v_num :=
        'CASE-'
        || lpad(
            nextval('public.support_case_number_seq')::text,
            6,
            '0'
        );

    insert into public.support_cases (
        tenant_id,
        support_requester_id,
        case_number,
        subject,
        description,
        category,
        created_by,
        status,
        assigned_to,
        priority,
        source
    )
    values (
        null,
        v_requester_id,
        v_num,
        trim(p_subject),
        v_desc,
        p_category,
        v_uid,
        'open',
        v_assignee,
        p_priority,
        'prospect'
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
        v_desc,
        false,
        coalesce(p_attachments, '[]'::jsonb)
    );

    return v_case_id;
end;
$$;

grant execute on function public.hq_create_support_prospect_case(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    boolean,
    jsonb,
    text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Portal: tenant creates case — store description from body
-- ---------------------------------------------------------------------------

create or replace function public.create_support_case(
    p_subject text,
    p_category text,
    p_body text,
    p_attachments jsonb default '[]'::jsonb
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
    v_desc text;
begin
    v_uid := auth.uid();
    if v_uid is null then
        raise exception 'not authenticated';
    end if;
    v_tid := public.get_my_tenant_id();
    if v_tid is null then
        raise exception 'no tenant';
    end if;
    if
        not public.has_tenant_role(
            array['member', 'admin', 'super_admin']::text[]
        )
    then
        raise exception 'forbidden';
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
    if length(trim(coalesce(p_subject, ''))) < 1 then
        raise exception 'subject required';
    end if;
    if
        length(trim(coalesce(p_body, ''))) < 1
        and coalesce(jsonb_array_length(p_attachments), 0) < 1
    then
        raise exception 'description or attachment required';
    end if;

    v_desc := trim(coalesce(p_body, ''));

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
        description,
        category,
        created_by,
        status
    )
    values (
        v_tid,
        v_num,
        trim(p_subject),
        v_desc,
        p_category,
        v_uid,
        'open'
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
        v_desc,
        false,
        coalesce(p_attachments, '[]'::jsonb)
    );

    return v_case_id;
end;
$$;
