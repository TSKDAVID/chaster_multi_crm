-- Client support portal: FAQs, cases, messages, internal notes, read state, storage, RLS, RPCs, realtime.

-- ---------------------------------------------------------------------------
-- Sequence & tables
-- ---------------------------------------------------------------------------

create sequence if not exists public.support_case_number_seq;

create table public.support_faq_entries (
    id uuid primary key default gen_random_uuid(),
    question text not null,
    answer text not null,
    sort_order integer not null default 0,
    archived_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index support_faq_entries_active_sort_idx
    on public.support_faq_entries (sort_order)
    where archived_at is null;

create table public.support_cases (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    case_number text not null unique,
    subject text not null,
    category text not null
        check (
            category in (
                'billing',
                'technical',
                'account',
                'ai_kb',
                'widget',
                'other'
            )
        ),
    status text not null default 'open'
        check (status in ('open', 'in_progress', 'pending_client', 'resolved')),
    created_by uuid references auth.users (id),
    assigned_to uuid references auth.users (id),
    resolved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index support_cases_tenant_updated_idx
    on public.support_cases (tenant_id, updated_at desc);

create table public.support_case_messages (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null references public.support_cases (id) on delete cascade,
    sender_id uuid references auth.users (id),
    body text not null default '',
    is_system boolean not null default false,
    metadata jsonb not null default '{}'::jsonb,
    attachments jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create index support_case_messages_case_created_idx
    on public.support_case_messages (case_id, created_at);

create table public.support_case_internal_notes (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null references public.support_cases (id) on delete cascade,
    author_id uuid not null references auth.users (id),
    body text not null,
    created_at timestamptz not null default now()
);

create index support_case_internal_notes_case_idx
    on public.support_case_internal_notes (case_id, created_at);

create table public.support_case_read_state (
    case_id uuid not null references public.support_cases (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    last_read_at timestamptz not null default now(),
    primary key (case_id, user_id)
);

create index support_case_read_state_user_idx
    on public.support_case_read_state (user_id);

create table public.support_case_staff_read_state (
    case_id uuid not null references public.support_cases (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    last_read_at timestamptz not null default now(),
    primary key (case_id, user_id)
);

create index support_case_staff_read_state_user_idx
    on public.support_case_staff_read_state (user_id);

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

create or replace function public.is_chaster_hq_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.chaster_team ct
        where ct.user_id = auth.uid()
          and ct.role in ('admin', 'super_admin')
    );
$$;

create or replace function public.support_case_visible_to_me(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.support_cases c
        where c.id = p_case_id
          and (
              (
                  c.tenant_id = public.get_my_tenant_id()
                  and public.has_tenant_role(
                      array['member', 'admin', 'super_admin']::text[]
                  )
              )
              or public.is_chaster_staff()
          )
    );
$$;

create or replace function public.support_user_is_chaster_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.chaster_team ct
        where ct.user_id = p_user_id
    );
$$;

create or replace function public.support_client_or_staff_may_post_message(p_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.support_cases c
        where c.id = p_case_id
          and (
              public.is_chaster_staff()
              or (
                  c.tenant_id = public.get_my_tenant_id()
                  and public.has_tenant_role(
                      array['member', 'admin', 'super_admin']::text[]
                  )
                  and c.status <> 'resolved'
              )
          )
    );
$$;

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
                    where c.id = p_case_id
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
-- Triggers: case updated_at, system messages on status/assign, bump case on new message
-- ---------------------------------------------------------------------------

create or replace function public.support_cases_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger support_cases_before_update_updated_at
    before update on public.support_cases
    for each row
    execute function public.support_cases_set_updated_at();

create or replace function public.support_cases_emit_change_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'UPDATE' then
        if new.status is distinct from old.status then
            insert into public.support_case_messages (
                case_id,
                sender_id,
                body,
                is_system,
                metadata
            )
            values (
                new.id,
                null,
                '',
                true,
                jsonb_build_object(
                    'kind',
                    'status_changed',
                    'from_status',
                    old.status,
                    'to_status',
                    new.status,
                    'actor_id',
                    auth.uid()
                )
            );
        end if;
        if new.assigned_to is distinct from old.assigned_to then
            insert into public.support_case_messages (
                case_id,
                sender_id,
                body,
                is_system,
                metadata
            )
            values (
                new.id,
                null,
                '',
                true,
                jsonb_build_object(
                    'kind',
                    'assignment_changed',
                    'from_assignee',
                    old.assigned_to,
                    'to_assignee',
                    new.assigned_to,
                    'actor_id',
                    auth.uid()
                )
            );
        end if;
    end if;
    return new;
end;
$$;

create trigger support_cases_after_update_messages
    after update on public.support_cases
    for each row
    execute function public.support_cases_emit_change_messages();

create or replace function public.support_case_messages_touch_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.support_cases
    set updated_at = now()
    where id = new.case_id;
    return new;
end;
$$;

create trigger support_case_messages_after_insert_touch
    after insert on public.support_case_messages
    for each row
    execute function public.support_case_messages_touch_case();

-- ---------------------------------------------------------------------------
-- RPCs
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
        status
    )
    values (
        v_tid,
        v_num,
        trim(p_subject),
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
        trim(coalesce(p_body, '')),
        false,
        coalesce(p_attachments, '[]'::jsonb)
    );

    return v_case_id;
end;
$$;

create or replace function public.reopen_support_case(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tid uuid;
begin
    v_tid := public.get_my_tenant_id();
    if auth.uid() is null or v_tid is null then
        raise exception 'forbidden';
    end if;
    if
        not public.has_tenant_role(
            array['member', 'admin', 'super_admin']::text[]
        )
    then
        raise exception 'forbidden';
    end if;
    update public.support_cases c
    set
        status = 'open',
        resolved_at = null
    where
        c.id = p_case_id
        and c.tenant_id = v_tid
        and c.status = 'resolved';
    if not found then
        raise exception 'cannot reopen';
    end if;
end;
$$;

create or replace function public.mark_support_case_read_portal(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'not authenticated';
    end if;
    if
        not exists (
            select 1
            from public.support_cases c
            where
                c.id = p_case_id
                and c.tenant_id = public.get_my_tenant_id()
                and public.has_tenant_role(
                    array['member', 'admin', 'super_admin']::text[]
                )
        )
    then
        raise exception 'forbidden';
    end if;
    insert into public.support_case_read_state (
        case_id,
        user_id,
        last_read_at
    )
    values (p_case_id, auth.uid(), now())
    on conflict (case_id, user_id) do update
    set last_read_at = excluded.last_read_at;
end;
$$;

create or replace function public.mark_support_case_read_staff(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_chaster_staff() then
        raise exception 'forbidden';
    end if;
    insert into public.support_case_staff_read_state (
        case_id,
        user_id,
        last_read_at
    )
    values (p_case_id, auth.uid(), now())
    on conflict (case_id, user_id) do update
    set last_read_at = excluded.last_read_at;
end;
$$;

create or replace function public.support_portal_unread_case_count()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
    select count(*)::integer
    from public.support_cases c
    where
        c.tenant_id = public.get_my_tenant_id()
        and public.has_tenant_role(
            array['member', 'admin', 'super_admin']::text[]
        )
        and exists (
            select 1
            from public.support_case_messages m
            where
                m.case_id = c.id
                and m.is_system = false
                and m.sender_id is not null
                and public.support_user_is_chaster_staff(m.sender_id)
                and m.created_at > coalesce(
                    (
                        select rs.last_read_at
                        from public.support_case_read_state rs
                        where
                            rs.case_id = c.id
                            and rs.user_id = auth.uid()
                    ),
                    '-infinity'::timestamptz
                )
        );
$$;

create or replace function public.support_staff_unread_case_count()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
    select case
        when not public.is_chaster_staff() then 0
        else (
            select count(*)::integer
            from public.support_cases c
            where public.support_staff_case_has_unread_client_message(
                c.id,
                auth.uid()
            )
        )
    end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.support_faq_entries enable row level security;
alter table public.support_cases enable row level security;
alter table public.support_case_messages enable row level security;
alter table public.support_case_internal_notes enable row level security;
alter table public.support_case_read_state enable row level security;
alter table public.support_case_staff_read_state enable row level security;

-- FAQs
create policy support_faq_select on public.support_faq_entries
    for select to authenticated
    using (
        archived_at is null
        or public.is_chaster_staff()
    );

create policy support_faq_insert on public.support_faq_entries
    for insert to authenticated
    with check (public.is_chaster_hq_admin());

create policy support_faq_update on public.support_faq_entries
    for update to authenticated
    using (public.is_chaster_hq_admin())
    with check (public.is_chaster_hq_admin());

create policy support_faq_delete on public.support_faq_entries
    for delete to authenticated
    using (public.is_chaster_hq_admin());

-- Cases (no direct INSERT/UPDATE for clients; staff UPDATE allowed)
create policy support_cases_select on public.support_cases
    for select to authenticated
    using (public.support_case_visible_to_me(id));

create policy support_cases_update_staff on public.support_cases
    for update to authenticated
    using (public.is_chaster_staff())
    with check (public.is_chaster_staff());

-- Messages
create policy support_case_messages_select on public.support_case_messages
    for select to authenticated
    using (public.support_case_visible_to_me(case_id));

create policy support_case_messages_insert on public.support_case_messages
    for insert to authenticated
    with check (
        is_system = false
        and sender_id = auth.uid()
        and (
            length(trim(body)) > 0
            or coalesce(jsonb_array_length(attachments), 0) > 0
        )
        and public.support_client_or_staff_may_post_message(case_id)
    );

create policy support_case_messages_update_own on public.support_case_messages
    for update to authenticated
    using (
        sender_id = auth.uid()
        and is_system = false
        and public.support_case_visible_to_me(case_id)
    )
    with check (
        sender_id = auth.uid()
        and is_system = false
        and public.support_case_visible_to_me(case_id)
    );

-- Internal notes (HQ only)
create policy support_case_internal_notes_all on public.support_case_internal_notes
    for all to authenticated
    using (public.is_chaster_staff())
    with check (public.is_chaster_staff());

-- Portal read state
create policy support_case_read_state_select on public.support_case_read_state
    for select to authenticated
    using (user_id = auth.uid());

create policy support_case_read_state_insert on public.support_case_read_state
    for insert to authenticated
    with check (
        user_id = auth.uid()
        and public.support_case_visible_to_me(case_id)
    );

create policy support_case_read_state_update on public.support_case_read_state
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- Staff read state
create policy support_case_staff_read_state_select on public.support_case_staff_read_state
    for select to authenticated
    using (
        user_id = auth.uid()
        and public.is_chaster_staff()
    );

create policy support_case_staff_read_state_insert on public.support_case_staff_read_state
    for insert to authenticated
    with check (
        user_id = auth.uid()
        and public.is_chaster_staff()
    );

create policy support_case_staff_read_state_update on public.support_case_staff_read_state
    for update to authenticated
    using (
        user_id = auth.uid()
        and public.is_chaster_staff()
    )
    with check (
        user_id = auth.uid()
        and public.is_chaster_staff()
    );

-- ---------------------------------------------------------------------------
-- Storage: support-attachments bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
select 'support-attachments', 'support-attachments', false
where
    not exists (
        select 1
        from storage.buckets
        where id = 'support-attachments'
    );

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
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.support_faq_entries to authenticated;
grant select, update on public.support_cases to authenticated;
grant select, insert, update on public.support_case_messages to authenticated;
grant select, insert, update, delete on public.support_case_internal_notes to authenticated;
grant select, insert, update on public.support_case_read_state to authenticated;
grant select, insert, update on public.support_case_staff_read_state to authenticated;

grant all on table public.support_faq_entries to service_role;
grant all on table public.support_cases to service_role;
grant all on table public.support_case_messages to service_role;
grant all on table public.support_case_internal_notes to service_role;
grant all on table public.support_case_read_state to service_role;
grant all on table public.support_case_staff_read_state to service_role;

grant usage on sequence public.support_case_number_seq to service_role;

grant execute on function public.is_chaster_hq_admin() to authenticated;
grant execute on function public.support_case_visible_to_me(uuid) to authenticated;
grant execute on function public.support_user_is_chaster_staff(uuid) to authenticated;
grant execute on function public.support_client_or_staff_may_post_message(uuid) to authenticated;
grant execute on function public.support_staff_case_has_unread_client_message(uuid, uuid) to authenticated;

grant execute on function public.create_support_case(text, text, text, jsonb) to authenticated;
grant execute on function public.reopen_support_case(uuid) to authenticated;
grant execute on function public.mark_support_case_read_portal(uuid) to authenticated;
grant execute on function public.mark_support_case_read_staff(uuid) to authenticated;
grant execute on function public.support_portal_unread_case_count() to authenticated;
grant execute on function public.support_staff_unread_case_count() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.support_case_messages;
alter publication supabase_realtime add table public.support_cases;
