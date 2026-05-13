-- Tasks System Overhaul: case/deal linking, delegation, priority, status,
-- recurring tasks, updated RLS.

-- ---------------------------------------------------------------------------
-- 1. New columns on tasks
-- ---------------------------------------------------------------------------

alter table public.tasks
    add column case_id uuid references public.support_cases (id) on delete set null,
    add column deal_id uuid references public.deals (id) on delete set null,
    add column assigned_to uuid references auth.users (id),
    add column delegated_by uuid references auth.users (id),
    add column delegated_at timestamptz,
    add column priority text not null default 'medium'
        check (priority in ('low', 'medium', 'high', 'urgent')),
    add column status text not null default 'pending'
        check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
    add column completed_at timestamptz,
    add column recurring_rule text,
    add column parent_task_id uuid references public.tasks (id) on delete set null;

-- Backfill status from done_date for existing tasks
update public.tasks
set status = 'completed',
    completed_at = done_date::timestamptz
where done_date is not null
  and status = 'pending';

create index tasks_case_id_idx on public.tasks using btree (case_id) where case_id is not null;
create index tasks_deal_id_idx on public.tasks using btree (deal_id) where deal_id is not null;
create index tasks_assigned_to_idx on public.tasks using btree (assigned_to, status, due_date);
create index tasks_status_idx on public.tasks using btree (status) where status <> 'completed';
create index tasks_recurring_idx on public.tasks using btree (parent_task_id) where recurring_rule is not null;

-- ---------------------------------------------------------------------------
-- 2. Update RLS: assigned_to user can see/edit tasks assigned to them
-- ---------------------------------------------------------------------------

-- Drop existing policies (from init_db and multitenancy)
drop policy if exists "Enable read access for authenticated users" on public.tasks;
drop policy if exists "Enable insert for authenticated users only" on public.tasks;
drop policy if exists "Enable update for authenticated users only" on public.tasks;
drop policy if exists "Enable delete for authenticated users only" on public.tasks;
drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;

create policy tasks_select on public.tasks
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
        or assigned_to = auth.uid()
    );

create policy tasks_insert on public.tasks
    for insert to authenticated
    with check (
        tenant_id = public.get_my_tenant_id()
        or public.is_chaster_staff()
    );

create policy tasks_update on public.tasks
    for update to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
        or assigned_to = auth.uid()
    )
    with check (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
        or assigned_to = auth.uid()
    );

create policy tasks_delete on public.tasks
    for delete to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

-- ---------------------------------------------------------------------------
-- 3. Recurring task engine (called by pg_cron daily)
-- ---------------------------------------------------------------------------

create or replace function public.generate_recurring_task_instances()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
    v_template record;
    v_latest_due date;
    v_next_due date;
    v_created int := 0;
    v_freq text;
    v_interval_val int;
begin
    for v_template in
        select t.*
        from public.tasks t
        where t.recurring_rule is not null
          and t.status not in ('cancelled')
          and t.parent_task_id is null  -- only templates, not instances
    loop
        -- Find the latest instance's due_date (or the template's own due_date)
        select coalesce(max(inst.due_date), v_template.due_date)
        into v_latest_due
        from public.tasks inst
        where inst.parent_task_id = v_template.id;

        if v_latest_due is null then
            continue;
        end if;

        -- Parse simple RRULE: FREQ=DAILY, FREQ=WEEKLY, FREQ=MONTHLY
        -- Format: FREQ=<freq>;INTERVAL=<n> (INTERVAL defaults to 1)
        v_freq := upper(split_part(
            (select val from regexp_split_to_table(v_template.recurring_rule, ';') as val
             where val ilike 'FREQ=%' limit 1),
            '=', 2
        ));

        v_interval_val := coalesce(
            (select nullif(split_part(val, '=', 2), '')::int
             from regexp_split_to_table(v_template.recurring_rule, ';') as val
             where val ilike 'INTERVAL=%' limit 1),
            1
        );

        v_next_due := case v_freq
            when 'DAILY'   then v_latest_due + (v_interval_val || ' days')::interval
            when 'WEEKLY'  then v_latest_due + (v_interval_val * 7 || ' days')::interval
            when 'MONTHLY' then v_latest_due + (v_interval_val || ' months')::interval
            else null
        end;

        if v_next_due is null or v_next_due > current_date + interval '7 days' then
            continue;
        end if;

        -- Only create if no instance exists for this due_date
        if not exists (
            select 1 from public.tasks inst
            where inst.parent_task_id = v_template.id
              and inst.due_date = v_next_due::text
        ) then
            insert into public.tasks (
                contact_id, type, text, due_date, sales_id, tenant_id,
                case_id, deal_id, assigned_to, priority, status, parent_task_id
            ) values (
                v_template.contact_id,
                v_template.type,
                v_template.text,
                v_next_due::text,
                v_template.sales_id,
                v_template.tenant_id,
                v_template.case_id,
                v_template.deal_id,
                v_template.assigned_to,
                v_template.priority,
                'pending',
                v_template.id
            );
            v_created := v_created + 1;
        end if;
    end loop;

    return jsonb_build_object(
        'instances_created', v_created,
        'checked_at', now()
    );
end;
$$;

grant execute on function public.generate_recurring_task_instances() to service_role;

-- If pg_cron is available:
-- select cron.schedule(
--     'recurring-tasks',
--     '0 2 * * *',
--     $$select public.generate_recurring_task_instances()$$
-- );
