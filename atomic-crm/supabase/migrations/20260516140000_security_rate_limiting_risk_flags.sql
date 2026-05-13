-- Security Medium: Rate limiting + risky user flagging, support_requesters DELETE,
-- support_faq_entries tenant scoping.

-- ---------------------------------------------------------------------------
-- 1. user_risk_flags table
-- ---------------------------------------------------------------------------

create table public.user_risk_flags (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    tenant_id uuid references public.tenants (id) on delete set null,
    flag_type text not null,
    severity text not null default 'warning'
        check (severity in ('warning', 'high', 'critical')),
    details jsonb not null default '{}'::jsonb,
    acknowledged_by uuid references auth.users (id),
    acknowledged_at timestamptz,
    created_at timestamptz not null default now()
);

create index user_risk_flags_user_id_idx on public.user_risk_flags using btree (user_id);
create index user_risk_flags_severity_idx on public.user_risk_flags using btree (severity);
create index user_risk_flags_unacknowledged_idx
    on public.user_risk_flags (created_at desc)
    where acknowledged_at is null;

alter table public.user_risk_flags enable row level security;

create policy user_risk_flags_select_staff on public.user_risk_flags
    for select to authenticated
    using (public.is_chaster_staff());

create policy user_risk_flags_insert_service on public.user_risk_flags
    for insert to service_role
    with check (true);

create policy user_risk_flags_insert_definer on public.user_risk_flags
    for insert to authenticated
    with check (public.is_chaster_staff());

create policy user_risk_flags_update_staff on public.user_risk_flags
    for update to authenticated
    using (public.is_chaster_staff())
    with check (public.is_chaster_staff());

grant select, insert, update on public.user_risk_flags to authenticated;
grant all on table public.user_risk_flags to service_role;

-- ---------------------------------------------------------------------------
-- 2. Rate-limit check for case creation (called inside create_support_case)
-- ---------------------------------------------------------------------------

create or replace function public.check_support_case_rate_limit(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
    v_count_1h int;
    v_flags_7d int;
    v_tenant_id uuid;
begin
    -- Count cases created by this user in the last hour
    select count(*) into v_count_1h
    from public.support_cases sc
    where sc.created_by = p_user_id
      and sc.created_at > now() - interval '1 hour';

    v_tenant_id := public.get_my_tenant_id();

    -- 3+ cases in 1 hour: warning flag
    if v_count_1h >= 3 and v_count_1h < 5 then
        insert into public.user_risk_flags (user_id, tenant_id, flag_type, severity, details)
        values (
            p_user_id,
            v_tenant_id,
            'excessive_case_creation',
            'warning',
            jsonb_build_object(
                'cases_in_last_hour', v_count_1h,
                'threshold', 3,
                'window_minutes', 60,
                'checked_at', now()
            )
        );
    end if;

    -- 5+ cases in 1 hour: hard block + high flag
    if v_count_1h >= 5 then
        insert into public.user_risk_flags (user_id, tenant_id, flag_type, severity, details)
        values (
            p_user_id,
            v_tenant_id,
            'excessive_case_creation',
            'high',
            jsonb_build_object(
                'cases_in_last_hour', v_count_1h,
                'threshold', 5,
                'window_minutes', 60,
                'action', 'blocked',
                'checked_at', now()
            )
        );

        raise exception 'Rate limit exceeded: maximum 5 cases per hour. Please wait before creating more cases.';
    end if;

    -- Repeat offender: 3+ flags in 7 days -> critical
    select count(*) into v_flags_7d
    from public.user_risk_flags rf
    where rf.user_id = p_user_id
      and rf.flag_type = 'excessive_case_creation'
      and rf.created_at > now() - interval '7 days';

    if v_flags_7d >= 3 then
        -- Upgrade latest flag to critical if not already
        update public.user_risk_flags
        set severity = 'critical',
            details = details || jsonb_build_object(
                'escalation_reason', 'repeat_offender',
                'flags_in_7_days', v_flags_7d,
                'escalated_at', now()
            )
        where id = (
            select id from public.user_risk_flags
            where user_id = p_user_id
              and flag_type = 'excessive_case_creation'
            order by created_at desc
            limit 1
        )
        and severity <> 'critical';
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rate-limit check for message posting
-- ---------------------------------------------------------------------------

create or replace function public.check_message_rate_limit(p_user_id uuid, p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
    v_count_5m int;
    v_tenant_id uuid;
begin
    select count(*) into v_count_5m
    from public.support_case_messages scm
    where scm.sender_id = p_user_id
      and scm.case_id = p_case_id
      and scm.created_at > now() - interval '5 minutes';

    if v_count_5m >= 30 then
        v_tenant_id := (
            select sc.tenant_id
            from public.support_cases sc
            where sc.id = p_case_id
            limit 1
        );

        insert into public.user_risk_flags (user_id, tenant_id, flag_type, severity, details)
        values (
            p_user_id,
            v_tenant_id,
            'excessive_messaging',
            'warning',
            jsonb_build_object(
                'messages_in_last_5_min', v_count_5m,
                'case_id', p_case_id,
                'threshold', 30,
                'checked_at', now()
            )
        );

        raise exception 'Rate limit exceeded: too many messages in a short period. Please slow down.';
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Inject rate-limit into create_support_case RPC
-- ---------------------------------------------------------------------------
-- We recreate the function with the rate-limit call added at the top.

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
    if not public.has_tenant_role(array['member', 'admin', 'super_admin']::text[]) then
        raise exception 'forbidden';
    end if;

    -- Rate limit check (raises exception if exceeded)
    perform public.check_support_case_rate_limit(v_uid);

    if p_category is null
        or p_category not in ('billing', 'technical', 'account', 'ai_kb', 'widget', 'other')
    then
        raise exception 'invalid category';
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
        tenant_id, case_number, subject, category, status, priority, source, created_by
    ) values (
        v_tid, v_num, trim(p_subject), p_category, 'open', 'medium', 'portal', v_uid
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
        v_case_id,
        null,
        'Case created by portal user.',
        true,
        jsonb_build_object('event', 'case_created', 'actor', v_uid)
    );

    return v_case_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. support_requesters: add DELETE policy for staff
-- ---------------------------------------------------------------------------

create policy support_requesters_delete_staff on public.support_requesters
    for delete to authenticated
    using (public.is_chaster_staff());

grant delete on public.support_requesters to authenticated;

-- ---------------------------------------------------------------------------
-- 6. support_faq_entries: add tenant scoping
-- ---------------------------------------------------------------------------

alter table public.support_faq_entries
    add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;

create index if not exists support_faq_entries_tenant_id_idx
    on public.support_faq_entries using btree (tenant_id);

-- Existing FAQs become global (tenant_id = NULL)
-- Update RLS to show global + own-tenant FAQs

drop policy if exists support_faq_entries_select on public.support_faq_entries;
drop policy if exists support_faq_select on public.support_faq_entries;

create policy support_faq_entries_select on public.support_faq_entries
    for select to authenticated
    using (
        tenant_id is null
        or tenant_id = public.get_my_tenant_id()
        or public.is_chaster_staff()
    );
