-- Support agent productivity: snippets, CSAT, search RPCs, mutual assignment + round-robin.

-- ---------------------------------------------------------------------------
-- 1. Tenant settings: round-robin
-- ---------------------------------------------------------------------------

alter table public.tenant_settings
    add column if not exists support_round_robin_enabled boolean not null default true,
    add column if not exists support_round_robin_pool text not null default 'chaster_support'
        check (support_round_robin_pool in ('tenant_team', 'chaster_support'));

-- ---------------------------------------------------------------------------
-- 2. CSAT on support_cases
-- ---------------------------------------------------------------------------

alter table public.support_cases
    add column if not exists satisfaction_rating smallint
        check (satisfaction_rating is null or (satisfaction_rating >= 1 and satisfaction_rating <= 5)),
    add column if not exists satisfaction_comment text,
    add column if not exists satisfaction_submitted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Reply snippets
-- ---------------------------------------------------------------------------

create table if not exists public.support_reply_snippets (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    shortcut text,
    body text not null,
    scope text not null check (scope in ('hq_global', 'tenant')),
    tenant_id uuid references public.tenants (id) on delete cascade,
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint support_reply_snippets_tenant_scope check (
        (scope = 'hq_global' and tenant_id is null)
        or (scope = 'tenant' and tenant_id is not null)
    )
);

create unique index if not exists support_reply_snippets_hq_shortcut_idx
    on public.support_reply_snippets (lower(shortcut))
    where scope = 'hq_global' and shortcut is not null and length(trim(shortcut)) > 0;

create unique index if not exists support_reply_snippets_tenant_shortcut_idx
    on public.support_reply_snippets (tenant_id, lower(shortcut))
    where scope = 'tenant' and shortcut is not null and length(trim(shortcut)) > 0;

create index if not exists support_reply_snippets_tenant_idx
    on public.support_reply_snippets (tenant_id)
    where scope = 'tenant';

alter table public.support_reply_snippets enable row level security;

create policy support_reply_snippets_select on public.support_reply_snippets
    for select to authenticated
    using (
        (scope = 'hq_global' and public.is_hq_support_role())
        or (
            scope = 'tenant'
            and tenant_id = public.get_my_tenant_id()
            and public.has_tenant_role(array['member', 'admin', 'super_admin']::text[])
        )
        or (
            scope = 'tenant'
            and public.is_hq_support_role()
            and exists (
                select 1 from public.support_cases sc
                where sc.tenant_id = support_reply_snippets.tenant_id
            )
        )
    );

create policy support_reply_snippets_insert on public.support_reply_snippets
    for insert to authenticated
    with check (
        (scope = 'hq_global' and public.is_hq_support_role()
            and public.normalize_hq_role((
                select role from public.chaster_team where user_id = auth.uid() limit 1
            )) in ('hq_owner', 'hq_ops_admin', 'hq_support_lead'))
        or (
            scope = 'tenant'
            and tenant_id = public.get_my_tenant_id()
            and public.has_tenant_role(array['admin', 'super_admin']::text[])
        )
    );

create policy support_reply_snippets_update on public.support_reply_snippets
    for update to authenticated
    using (
        (scope = 'hq_global' and public.is_hq_support_role()
            and public.normalize_hq_role((
                select role from public.chaster_team where user_id = auth.uid() limit 1
            )) in ('hq_owner', 'hq_ops_admin', 'hq_support_lead'))
        or (
            scope = 'tenant'
            and tenant_id = public.get_my_tenant_id()
            and public.has_tenant_role(array['admin', 'super_admin']::text[])
        )
    )
    with check (
        (scope = 'hq_global' and tenant_id is null)
        or (scope = 'tenant' and tenant_id = public.get_my_tenant_id())
    );

create policy support_reply_snippets_delete on public.support_reply_snippets
    for delete to authenticated
    using (
        (scope = 'hq_global' and public.is_hq_support_role()
            and public.normalize_hq_role((
                select role from public.chaster_team where user_id = auth.uid() limit 1
            )) in ('hq_owner', 'hq_ops_admin', 'hq_support_lead'))
        or (
            scope = 'tenant'
            and tenant_id = public.get_my_tenant_id()
            and public.has_tenant_role(array['admin', 'super_admin']::text[])
        )
    );

grant select, insert, update, delete on public.support_reply_snippets to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Round-robin assignee picker
-- ---------------------------------------------------------------------------

create or replace function public.pick_support_assignee(
    p_tenant_id uuid,
    p_pool text default 'chaster_support'
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_pick uuid;
begin
    if p_pool = 'tenant_team' then
        select tm.user_id into v_pick
        from public.tenant_members tm
        left join lateral (
            select count(*)::int as open_cnt
            from public.support_cases sc
            where sc.assigned_to = tm.user_id
              and sc.status <> 'resolved'
        ) oc on true
        where tm.tenant_id = p_tenant_id
          and tm.role in ('member', 'admin', 'super_admin')
        order by coalesce(oc.open_cnt, 0), tm.user_id
        limit 1;
    else
        select ct.user_id into v_pick
        from public.chaster_team ct
        left join lateral (
            select count(*)::int as open_cnt
            from public.support_cases sc
            where sc.assigned_to = ct.user_id
              and sc.status <> 'resolved'
        ) oc on true
        where public.normalize_hq_role(ct.role) in (
            'hq_owner', 'hq_ops_admin', 'hq_support_lead', 'hq_support_agent'
        )
        order by coalesce(oc.open_cnt, 0), ct.user_id
        limit 1;
    end if;
    return v_pick;
end;
$$;

grant execute on function public.pick_support_assignee(uuid, text) to authenticated;

create or replace function public.resolve_support_case_assignee(
    p_creator uuid,
    p_assign_to uuid,
    p_leave_unassigned boolean,
    p_tenant_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_settings record;
    v_assignee uuid;
begin
    if p_leave_unassigned then
        select ts.support_round_robin_enabled, ts.support_round_robin_pool
        into v_settings
        from public.tenant_settings ts
        where ts.tenant_id = p_tenant_id;

        if coalesce(v_settings.support_round_robin_enabled, false) then
            return public.pick_support_assignee(
                p_tenant_id,
                coalesce(v_settings.support_round_robin_pool, 'chaster_support')
            );
        end if;
        return null;
    end if;

    if p_assign_to is not null then
        return p_assign_to;
    end if;

    return p_creator;
end;
$$;

grant execute on function public.resolve_support_case_assignee(uuid, uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. CSAT submit RPC
-- ---------------------------------------------------------------------------

create or replace function public.submit_support_case_csat(
    p_case_id uuid,
    p_rating smallint,
    p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_case public.support_cases%rowtype;
begin
    if p_rating is null or p_rating < 1 or p_rating > 5 then
        raise exception 'invalid rating';
    end if;

    select * into v_case from public.support_cases where id = p_case_id;
    if not found then
        raise exception 'case not found';
    end if;

    if v_case.status <> 'resolved' then
        raise exception 'case must be resolved';
    end if;

    if v_case.satisfaction_submitted_at is not null then
        raise exception 'csat already submitted';
    end if;

    if public.is_hq_support_role() then
        null;
    elsif v_case.tenant_id = public.get_my_tenant_id()
        and public.has_tenant_role(array['member', 'admin', 'super_admin']::text[]) then
        null;
    else
        raise exception 'forbidden';
    end if;

    update public.support_cases
    set
        satisfaction_rating = p_rating,
        satisfaction_comment = nullif(trim(coalesce(p_comment, '')), ''),
        satisfaction_submitted_at = now()
    where id = p_case_id;
end;
$$;

grant execute on function public.submit_support_case_csat(uuid, smallint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Search RPCs
-- ---------------------------------------------------------------------------

create or replace function public.search_support_cases_portal(
    p_query text,
    p_limit int default 50
)
returns table (case_id uuid, rank real)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_tid uuid;
    v_q text;
begin
    v_tid := public.get_my_tenant_id();
    if v_tid is null then
        raise exception 'no tenant';
    end if;
    if not public.has_tenant_role(array['member', 'admin', 'super_admin']::text[]) then
        raise exception 'forbidden';
    end if;

    v_q := '%' || lower(trim(coalesce(p_query, ''))) || '%';
    if length(trim(coalesce(p_query, ''))) < 2 then
        return;
    end if;

    return query
    select distinct sc.id,
        greatest(
            case when lower(sc.subject) like v_q then 1.0 else 0.0 end,
            case when lower(sc.case_number) like v_q then 0.9 else 0.0 end,
            case when lower(coalesce(sc.description, '')) like v_q then 0.7 else 0.0 end
        )::real as rank
    from public.support_cases sc
    left join public.support_case_messages scm
        on scm.case_id = sc.id and scm.is_system = false
    where sc.tenant_id = v_tid
      and (
          lower(sc.subject) like v_q
          or lower(sc.case_number) like v_q
          or lower(coalesce(sc.description, '')) like v_q
          or lower(coalesce(scm.body, '')) like v_q
      )
    order by rank desc, sc.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

grant execute on function public.search_support_cases_portal(text, int) to authenticated;

create or replace function public.search_support_cases_hq(
    p_query text,
    p_limit int default 50
)
returns table (case_id uuid, rank real)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_q text;
begin
    if not public.is_hq_support_role() then
        raise exception 'forbidden';
    end if;

    v_q := '%' || lower(trim(coalesce(p_query, ''))) || '%';
    if length(trim(coalesce(p_query, ''))) < 2 then
        return;
    end if;

    return query
    select distinct sc.id,
        greatest(
            case when lower(sc.subject) like v_q then 1.0 else 0.0 end,
            case when lower(sc.case_number) like v_q then 0.9 else 0.0 end,
            case when lower(coalesce(sc.description, '')) like v_q then 0.7 else 0.0 end
        )::real as rank
    from public.support_cases sc
    left join public.support_case_messages scm
        on scm.case_id = sc.id and scm.is_system = false
    where (
          lower(sc.subject) like v_q
          or lower(sc.case_number) like v_q
          or lower(coalesce(sc.description, '')) like v_q
          or lower(coalesce(scm.body, '')) like v_q
      )
    order by rank desc, sc.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

grant execute on function public.search_support_cases_hq(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Recreate create_support_case (portal) with mutual assignee
-- ---------------------------------------------------------------------------

drop function if exists public.create_support_case(text, text, text, jsonb, text, text[]);

create or replace function public.create_support_case(
    p_subject text,
    p_category text,
    p_body text,
    p_attachments jsonb default '[]'::jsonb,
    p_priority text default 'medium',
    p_tags text[] default '{}',
    p_assign_to uuid default null,
    p_leave_unassigned boolean default false
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
    v_assignee uuid;
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

    v_assignee := public.resolve_support_case_assignee(
        v_uid, p_assign_to, coalesce(p_leave_unassigned, false), v_tid
    );

    v_num := 'CASE-' || lpad(nextval('public.support_case_number_seq')::text, 6, '0');

    insert into public.support_cases (
        tenant_id, case_number, subject, category, status, priority,
        source, created_by, tags, assigned_to
    ) values (
        v_tid, v_num, trim(p_subject), p_category, 'open',
        p_priority, 'portal', v_uid, coalesce(p_tags, '{}'), v_assignee
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

grant execute on function public.create_support_case(
    text, text, text, jsonb, text, text[], uuid, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Recreate hq_create_support_case with mutual assignee
-- ---------------------------------------------------------------------------

drop function if exists public.hq_create_support_case(
    uuid, text, text, text, text, boolean, jsonb,
    text, text[], timestamptz, text, uuid, uuid, text, uuid
);

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
    p_assign_to uuid default null,
    p_leave_unassigned boolean default false
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
    if not public.is_hq_support_role() then raise exception 'forbidden'; end if;
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

    if coalesce(p_leave_unassigned, false) then
        v_assignee := public.resolve_support_case_assignee(v_uid, null, true, p_tenant_id);
    elsif p_assign_to is not null then
        v_assignee := p_assign_to;
    elsif coalesce(p_assign_to_self, false) then
        v_assignee := v_uid;
    else
        v_assignee := v_uid;
    end if;

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

    insert into public.support_case_messages (
        case_id, sender_id, body, is_system, attachments
    ) values (
        v_case_id, v_uid, trim(p_initial_message), false,
        coalesce(p_attachments, '[]'::jsonb)
    );

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
    text, text[], timestamptz, text, uuid, uuid, text, uuid, boolean
) to authenticated;
