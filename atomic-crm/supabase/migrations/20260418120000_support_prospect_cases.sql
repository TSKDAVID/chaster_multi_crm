-- Prospect support cases: requesters without a tenant; staff-only until linked to a tenant.

-- ---------------------------------------------------------------------------
-- Requester identity (support-only, not CRM contacts / not tenants)
-- ---------------------------------------------------------------------------

create table public.support_requesters (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    organization_name text not null,
    contact_first_name text,
    contact_last_name text,
    email text,
    phone text,
    notes text,
    source_detail text
);

comment on table public.support_requesters is
    'Pre-customer contact captured for support; not a tenant or classic CRM entity.';

create index support_requesters_email_lower_idx
    on public.support_requesters (lower(trim(email)))
    where email is not null and trim(email) <> '';

alter table public.support_requesters enable row level security;

create policy support_requesters_select_staff on public.support_requesters
    for select to authenticated
    using (public.is_chaster_staff());

create policy support_requesters_insert_staff on public.support_requesters
    for insert to authenticated
    with check (public.is_chaster_staff());

create policy support_requesters_update_staff on public.support_requesters
    for update to authenticated
    using (public.is_chaster_staff())
    with check (public.is_chaster_staff());

grant select, insert, update on public.support_requesters to authenticated;
grant all on table public.support_requesters to service_role;

-- ---------------------------------------------------------------------------
-- support_cases: optional tenant, link to requester
-- ---------------------------------------------------------------------------

alter table public.support_cases
    alter column tenant_id drop not null;

alter table public.support_cases
    add column if not exists support_requester_id uuid
        references public.support_requesters (id) on delete set null;

create index support_cases_requester_idx
    on public.support_cases (support_requester_id)
    where support_requester_id is not null;

create index support_cases_prospect_idx
    on public.support_cases (updated_at desc)
    where tenant_id is null;

alter table public.support_cases
    drop constraint if exists support_cases_source_check;

alter table public.support_cases
    add constraint support_cases_source_check
        check (
            source in (
                'portal',
                'phone',
                'email',
                'hq',
                'other',
                'prospect'
            )
        );

alter table public.support_cases
    add constraint support_cases_tenant_or_requester_chk
        check (
            tenant_id is not null
            or support_requester_id is not null
        );

-- ---------------------------------------------------------------------------
-- Unread helper: ignore null tenant (no portal client on prospect cases)
-- ---------------------------------------------------------------------------

create or replace function public.support_staff_case_has_unread_client_message(
    p_case_id uuid,
    p_staff_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    with lm as (
        select m.sender_id, m.created_at
        from public.support_case_messages m
        where m.case_id = p_case_id
          and m.is_system = false
        order by m.created_at desc
        limit 1
    )
    select coalesce(
        (
            select
                lm.sender_id is not null
                and not public.support_user_is_chaster_staff(lm.sender_id)
                and exists (
                    select 1
                    from public.support_cases c
                    join public.tenant_members tm
                        on tm.tenant_id = c.tenant_id
                       and tm.user_id = lm.sender_id
                    where
                        c.id = p_case_id
                        and c.tenant_id is not null
                )
                and lm.created_at > coalesce(
                    (
                        select s.last_read_at
                        from public.support_case_staff_read_state s
                        where s.case_id = p_case_id
                          and s.user_id = p_staff_user_id
                    ),
                    '-infinity'::timestamptz
                )
            from lm
        ),
        false
    );
$$;

-- ---------------------------------------------------------------------------
-- Storage: staff uploads for prospect path prospect/{case_id}/...
-- ---------------------------------------------------------------------------

drop policy if exists "Support attachments select" on storage.objects;
drop policy if exists "Support attachments insert" on storage.objects;

create policy "Support attachments select"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'support-attachments'
        and (
            public.is_chaster_staff()
            or (
                (storage.foldername(name))[1] = public.get_my_tenant_id()::text
                and exists (
                    select 1
                    from public.support_cases sc
                    where
                        sc.id::text = (storage.foldername(name))[2]
                        and sc.tenant_id = public.get_my_tenant_id()
                )
            )
        )
    );

create policy "Support attachments insert"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'support-attachments'
        and (
            (
                public.is_chaster_staff()
                and exists (
                    select 1
                    from public.support_cases sc
                    where
                        sc.id::text = (storage.foldername(name))[2]
                        and sc.tenant_id::text = (storage.foldername(name))[1]
                )
            )
            or (
                public.is_chaster_staff()
                and (storage.foldername(name))[1] = 'prospect'
                and exists (
                    select 1
                    from public.support_cases sc
                    where
                        sc.id::text = (storage.foldername(name))[2]
                        and sc.tenant_id is null
                )
            )
            or (
                public.has_tenant_role(
                    array['member', 'admin', 'super_admin']::text[]
                )
                and (storage.foldername(name))[1] = public.get_my_tenant_id()::text
                and exists (
                    select 1
                    from public.support_cases sc
                    where
                        sc.id::text = (storage.foldername(name))[2]
                        and sc.tenant_id = public.get_my_tenant_id()
                )
            )
        )
    );

-- ---------------------------------------------------------------------------
-- RPC: create prospect case (no tenant)
-- ---------------------------------------------------------------------------

create or replace function public.hq_create_support_prospect_case(
    p_organization_name text,
    p_contact_first_name text,
    p_contact_last_name text,
    p_email text,
    p_phone text,
    p_subject text,
    p_category text,
    p_initial_message text,
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
    if length(trim(coalesce(p_initial_message, ''))) < 1 then
        raise exception 'initial message required';
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
        trim(p_initial_message),
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
-- RPC: link prospect case to an existing tenant (after hq_provision_tenant)
-- ---------------------------------------------------------------------------

create or replace function public.hq_link_support_case_to_tenant(
    p_case_id uuid,
    p_tenant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;
    if not public.is_chaster_staff() then
        raise exception 'forbidden';
    end if;
    if not exists (select 1 from public.tenants t where t.id = p_tenant_id) then
        raise exception 'invalid tenant';
    end if;

    update public.support_cases c
    set tenant_id = p_tenant_id
    where
        c.id = p_case_id
        and c.tenant_id is null;

    if not found then
        raise exception 'case not found or already linked';
    end if;
end;
$$;

grant execute on function public.hq_link_support_case_to_tenant(uuid, uuid)
    to authenticated;
