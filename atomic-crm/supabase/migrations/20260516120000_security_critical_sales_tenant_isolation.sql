-- Security Critical: Add tenant_id to sales table + backfill + RLS
-- Also: add edited_at to support_case_messages with auto-set trigger

-- ---------------------------------------------------------------------------
-- 1. sales table: add tenant_id, backfill from tenant_members, add RLS
-- ---------------------------------------------------------------------------

alter table public.sales add column tenant_id uuid references public.tenants (id);

create index sales_tenant_id_idx on public.sales using btree (tenant_id);

-- Backfill: derive tenant_id from the user's primary tenant membership
update public.sales s
set tenant_id = (
    select tm.tenant_id
    from public.tenant_members tm
    where tm.user_id = s.user_id
    order by
        case tm.role
            when 'super_admin' then 0
            when 'admin'       then 1
            when 'manager'     then 2
            when 'member'      then 3
            when 'viewer'      then 4
            else 5
        end,
        tm.joined_at
    limit 1
)
where s.tenant_id is null;

-- Fallback: anyone still NULL gets the default tenant
update public.sales
set tenant_id = (select id from public.tenants where slug = 'default-chaster' limit 1)
where tenant_id is null;

-- Drop the old wide-open SELECT policy
drop policy if exists "Enable read access for authenticated users" on public.sales;

-- New tenant-scoped policies
create policy sales_select on public.sales
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy sales_insert on public.sales
    for insert to authenticated
    with check (
        tenant_id = public.get_my_tenant_id()
        or public.is_chaster_staff()
    );

create policy sales_update on public.sales
    for update to authenticated
    using (
        public.is_chaster_staff()
        or (tenant_id = public.get_my_tenant_id() and user_id = auth.uid())
    )
    with check (
        public.is_chaster_staff()
        or (tenant_id = public.get_my_tenant_id() and user_id = auth.uid())
    );

-- Auto-set tenant_id on new sales rows
create trigger set_sales_tenant_id_trigger
    before insert on public.sales
    for each row execute function public.set_tenant_id_default();

-- Update handle_new_user to populate tenant_id on the sales row it creates.
-- The insert happens before tenant_members exists for the user, so we set it
-- from the provisioned_tenant_id metadata or the default tenant.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    sales_count int;
    target_tenant_id uuid;
    member_role text;
    provisioned_id text;
    provisioned_role text;
begin
    select count(*) into sales_count from public.sales;

    -- Determine target tenant
    provisioned_id := new.raw_user_meta_data ->> 'provisioned_tenant_id';
    provisioned_role := coalesce(
        new.raw_user_meta_data ->> 'provisioned_role',
        case when sales_count = 0 then 'super_admin' else 'member' end
    );

    if provisioned_id is not null then
        select t.id into target_tenant_id
        from public.tenants t
        where t.id::text = provisioned_id
        limit 1;
    end if;

    if target_tenant_id is null then
        select t.id into target_tenant_id
        from public.tenants t
        where t.slug = 'default-chaster'
        limit 1;
    end if;

    member_role := case
        when provisioned_id is not null then provisioned_role
        when sales_count = 0 then 'super_admin'
        else 'member'
    end;

    insert into public.sales (first_name, last_name, email, user_id, administrator, tenant_id)
    values (
        coalesce(
            new.raw_user_meta_data ->> 'first_name',
            new.raw_user_meta_data -> 'custom_claims' ->> 'first_name',
            'Pending'
        ),
        coalesce(
            new.raw_user_meta_data ->> 'last_name',
            new.raw_user_meta_data -> 'custom_claims' ->> 'last_name',
            'Pending'
        ),
        new.email,
        new.id,
        case when sales_count > 0 then false else true end,
        target_tenant_id
    );

    if target_tenant_id is not null then
        insert into public.tenant_members (tenant_id, user_id, role)
        values (target_tenant_id, new.id, member_role)
        on conflict (tenant_id, user_id) do nothing;
    end if;

    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. support_case_messages: add edited_at with auto-set trigger
-- ---------------------------------------------------------------------------

alter table public.support_case_messages
    add column edited_at timestamptz;

create or replace function public.support_case_message_set_edited_at()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
    if old.body is distinct from new.body then
        new.edited_at := now();
    end if;
    return new;
end;
$$;

create trigger support_case_message_edited_at_trigger
    before update on public.support_case_messages
    for each row execute function public.support_case_message_set_edited_at();
