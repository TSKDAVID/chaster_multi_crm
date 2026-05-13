-- SLA Tracking + Auto-Escalation: schema, policies, triggers, and cron function.

-- ---------------------------------------------------------------------------
-- 1. SLA columns on support_cases
-- ---------------------------------------------------------------------------

alter table public.support_cases
    add column first_response_due_at timestamptz,
    add column resolution_due_at timestamptz,
    add column first_responded_at timestamptz,
    add column sla_response_breached boolean not null default false,
    add column sla_resolution_breached boolean not null default false,
    add column escalation_level int not null default 0,
    add column escalated_at timestamptz;

create index support_cases_sla_breach_idx
    on public.support_cases (sla_response_breached, sla_resolution_breached)
    where status not in ('resolved');

create index support_cases_escalation_idx
    on public.support_cases (escalation_level)
    where escalation_level > 0;

-- ---------------------------------------------------------------------------
-- 2. sla_policies table
-- ---------------------------------------------------------------------------

create table public.sla_policies (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references public.tenants (id) on delete cascade,
    category text not null,
    priority text not null,
    first_response_minutes int not null default 60,
    resolution_minutes int not null default 1440,
    escalation_1_after_minutes int not null default 120,
    escalation_2_after_minutes int not null default 480,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (tenant_id, category, priority)
);

alter table public.sla_policies enable row level security;

create policy sla_policies_select on public.sla_policies
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
        or tenant_id is null
    );

create policy sla_policies_manage_staff on public.sla_policies
    for all to authenticated
    using (public.is_chaster_staff())
    with check (public.is_chaster_staff());

grant select on public.sla_policies to authenticated;
grant all on table public.sla_policies to service_role;
grant insert, update, delete on public.sla_policies to authenticated;

-- Seed default global policies (tenant_id = NULL)
insert into public.sla_policies (tenant_id, category, priority, first_response_minutes, resolution_minutes, escalation_1_after_minutes, escalation_2_after_minutes) values
    (null, 'billing',    'urgent', 15,  240,  30,   120),
    (null, 'billing',    'high',   30,  480,  60,   240),
    (null, 'billing',    'medium', 60,  1440, 120,  480),
    (null, 'billing',    'low',    120, 2880, 240,  960),
    (null, 'technical',  'urgent', 15,  240,  30,   120),
    (null, 'technical',  'high',   30,  480,  60,   240),
    (null, 'technical',  'medium', 60,  1440, 120,  480),
    (null, 'technical',  'low',    120, 2880, 240,  960),
    (null, 'account',    'urgent', 15,  240,  30,   120),
    (null, 'account',    'high',   30,  480,  60,   240),
    (null, 'account',    'medium', 60,  1440, 120,  480),
    (null, 'account',    'low',    120, 2880, 240,  960),
    (null, 'other',      'urgent', 30,  480,  60,   240),
    (null, 'other',      'high',   60,  960,  120,  480),
    (null, 'other',      'medium', 120, 2880, 240,  960),
    (null, 'other',      'low',    240, 4320, 480,  1440),
    (null, 'ai_kb',      'medium', 120, 2880, 240,  960),
    (null, 'ai_kb',      'low',    240, 4320, 480,  1440),
    (null, 'widget',     'medium', 120, 2880, 240,  960),
    (null, 'widget',     'low',    240, 4320, 480,  1440);

-- ---------------------------------------------------------------------------
-- 3. sla_escalation_log table
-- ---------------------------------------------------------------------------

create table public.sla_escalation_log (
    id uuid primary key default gen_random_uuid(),
    case_id uuid not null references public.support_cases (id) on delete cascade,
    from_level int not null default 0,
    to_level int not null,
    reason text not null,
    created_at timestamptz not null default now()
);

create index sla_escalation_log_case_id_idx
    on public.sla_escalation_log using btree (case_id);

alter table public.sla_escalation_log enable row level security;

create policy sla_escalation_log_select on public.sla_escalation_log
    for select to authenticated
    using (
        public.is_chaster_staff()
        or exists (
            select 1 from public.support_cases sc
            where sc.id = sla_escalation_log.case_id
              and sc.tenant_id = public.get_my_tenant_id()
        )
    );

create policy sla_escalation_log_insert_service on public.sla_escalation_log
    for insert to service_role
    with check (true);

grant select on public.sla_escalation_log to authenticated;
grant all on table public.sla_escalation_log to service_role;

-- ---------------------------------------------------------------------------
-- 4. Trigger: assign SLA deadlines on new case
-- ---------------------------------------------------------------------------

create or replace function public.sla_assign_deadlines()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
    v_policy record;
begin
    -- Look up tenant-specific policy first, then global fallback
    select * into v_policy
    from public.sla_policies
    where category = new.category
      and priority = new.priority
      and (tenant_id = new.tenant_id or tenant_id is null)
    order by tenant_id nulls last
    limit 1;

    if v_policy.id is not null then
        new.first_response_due_at := new.created_at + (v_policy.first_response_minutes || ' minutes')::interval;
        new.resolution_due_at := new.created_at + (v_policy.resolution_minutes || ' minutes')::interval;
    end if;

    return new;
end;
$$;

create trigger sla_assign_deadlines_trigger
    before insert on public.support_cases
    for each row execute function public.sla_assign_deadlines();

-- ---------------------------------------------------------------------------
-- 5. Trigger: track first staff response on case messages
-- ---------------------------------------------------------------------------

create or replace function public.sla_track_first_response()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
    -- Only for non-system messages from staff
    if new.is_system = true or new.sender_id is null then
        return new;
    end if;

    -- Check if sender is staff
    if exists (
        select 1 from public.chaster_team ct where ct.user_id = new.sender_id
    ) then
        -- Set first_responded_at if not already set
        update public.support_cases
        set first_responded_at = now(),
            sla_response_breached = false
        where id = new.case_id
          and first_responded_at is null;
    end if;

    return new;
end;
$$;

create trigger sla_track_first_response_trigger
    after insert on public.support_case_messages
    for each row execute function public.sla_track_first_response();

-- ---------------------------------------------------------------------------
-- 6. Function: SLA breach detection + auto-escalation (called by pg_cron)
-- ---------------------------------------------------------------------------

create or replace function public.sla_check_breaches_and_escalate()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
    v_breached_response int := 0;
    v_breached_resolution int := 0;
    v_escalated int := 0;
    v_case record;
    v_policy record;
    v_breach_duration interval;
    v_new_level int;
begin
    -- 1. Mark response SLA breaches
    update public.support_cases
    set sla_response_breached = true
    where first_response_due_at is not null
      and first_responded_at is null
      and now() > first_response_due_at
      and sla_response_breached = false
      and status not in ('resolved');

    get diagnostics v_breached_response = row_count;

    -- 2. Mark resolution SLA breaches
    update public.support_cases
    set sla_resolution_breached = true
    where resolution_due_at is not null
      and now() > resolution_due_at
      and sla_resolution_breached = false
      and status not in ('resolved');

    get diagnostics v_breached_resolution = row_count;

    -- 3. Auto-escalate based on breach duration
    for v_case in
        select sc.id, sc.tenant_id, sc.category, sc.priority,
               sc.escalation_level, sc.first_response_due_at, sc.resolution_due_at,
               sc.sla_response_breached, sc.sla_resolution_breached
        from public.support_cases sc
        where (sc.sla_response_breached or sc.sla_resolution_breached)
          and sc.status not in ('resolved')
          and sc.escalation_level < 2
    loop
        -- Find the applicable SLA policy
        select * into v_policy
        from public.sla_policies
        where category = v_case.category
          and priority = v_case.priority
          and (tenant_id = v_case.tenant_id or tenant_id is null)
        order by tenant_id nulls last
        limit 1;

        if v_policy.id is null then
            continue;
        end if;

        -- Calculate breach duration (use the earlier breach point)
        if v_case.sla_response_breached and v_case.first_response_due_at is not null then
            v_breach_duration := now() - v_case.first_response_due_at;
        elsif v_case.sla_resolution_breached and v_case.resolution_due_at is not null then
            v_breach_duration := now() - v_case.resolution_due_at;
        else
            continue;
        end if;

        -- Determine escalation level
        v_new_level := v_case.escalation_level;
        if extract(epoch from v_breach_duration) / 60 >= v_policy.escalation_2_after_minutes
            and v_case.escalation_level < 2 then
            v_new_level := 2;
        elsif extract(epoch from v_breach_duration) / 60 >= v_policy.escalation_1_after_minutes
            and v_case.escalation_level < 1 then
            v_new_level := 1;
        end if;

        if v_new_level > v_case.escalation_level then
            update public.support_cases
            set escalation_level = v_new_level,
                escalated_at = now()
            where id = v_case.id;

            insert into public.sla_escalation_log (case_id, from_level, to_level, reason)
            values (
                v_case.id,
                v_case.escalation_level,
                v_new_level,
                format('Auto-escalated: SLA breached for %s minutes',
                    round(extract(epoch from v_breach_duration) / 60))
            );

            -- System message on the case thread
            insert into public.support_case_messages (case_id, sender_id, body, is_system, metadata)
            values (
                v_case.id,
                null,
                format('Case escalated to level %s due to SLA breach.', v_new_level),
                true,
                jsonb_build_object(
                    'event', 'sla_escalation',
                    'from_level', v_case.escalation_level,
                    'to_level', v_new_level
                )
            );

            v_escalated := v_escalated + 1;
        end if;
    end loop;

    return jsonb_build_object(
        'response_breaches_marked', v_breached_response,
        'resolution_breaches_marked', v_breached_resolution,
        'cases_escalated', v_escalated,
        'checked_at', now()
    );
end;
$$;

-- Grant to service_role for pg_cron / Edge Function invocation
grant execute on function public.sla_check_breaches_and_escalate() to service_role;

-- If pg_cron is available, schedule the job (Supabase Pro plan):
-- select cron.schedule(
--     'sla-breach-check',
--     '*/5 * * * *',
--     $$select public.sla_check_breaches_and_escalate()$$
-- );
