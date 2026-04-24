-- HQ vs Workspace RBAC role normalization and compatibility migration.

-- 1) Backfill existing rows to new role names.
update public.chaster_team
set role = case role
  when 'super_admin' then 'hq_owner'
  when 'admin' then 'hq_ops_admin'
  when 'staff' then 'hq_support_agent'
  else role
end;

update public.tenant_members
set role = case role
  when 'super_admin' then 'workspace_owner'
  when 'admin' then 'workspace_admin'
  when 'member' then 'workspace_member'
  else role
end;

alter table public.chaster_team
  alter column role set default 'hq_support_agent';

alter table public.tenant_members
  alter column role set default 'workspace_member';

-- 2) Normalization helpers keep legacy values compatible in SQL checks.
create or replace function public.normalize_hq_role(raw text)
returns text
language sql
immutable
as $$
  select case raw
    when 'hq_owner' then 'hq_owner'
    when 'hq_ops_admin' then 'hq_ops_admin'
    when 'hq_support_lead' then 'hq_support_lead'
    when 'hq_support_agent' then 'hq_support_agent'
    when 'hq_developer' then 'hq_developer'
    when 'hq_analyst' then 'hq_analyst'
    when 'super_admin' then 'hq_owner'
    when 'admin' then 'hq_ops_admin'
    when 'staff' then 'hq_support_agent'
    else null
  end;
$$;

create or replace function public.normalize_workspace_role(raw text)
returns text
language sql
immutable
as $$
  select case raw
    when 'workspace_owner' then 'workspace_owner'
    when 'workspace_admin' then 'workspace_admin'
    when 'workspace_manager' then 'workspace_manager'
    when 'workspace_member' then 'workspace_member'
    when 'workspace_viewer' then 'workspace_viewer'
    when 'super_admin' then 'workspace_owner'
    when 'admin' then 'workspace_admin'
    when 'member' then 'workspace_member'
    else null
  end;
$$;

create or replace function public.is_chaster_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chaster_team ct
    where ct.user_id = auth.uid()
      and public.normalize_hq_role(ct.role) is not null
  );
$$;

create or replace function public.is_chaster_team_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.chaster_team ct
    where ct.user_id = auth.uid()
      and public.normalize_hq_role(ct.role) = 'hq_owner'
  );
$$;

create or replace function public.get_my_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tm.tenant_id
  from public.tenant_members tm
  left join public.tenants t on t.id = tm.tenant_id
  where tm.user_id = auth.uid()
  order by
    case public.normalize_workspace_role(tm.role)
      when 'workspace_owner' then 0
      when 'workspace_admin' then 1
      when 'workspace_manager' then 2
      when 'workspace_member' then 3
      else 4
    end,
    case when t.owner_user_id = auth.uid() then 0 else 1 end,
    tm.joined_at
  limit 1;
$$;

create or replace function public.has_tenant_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with normalized_allowed as (
    select array_agg(distinct public.normalize_workspace_role(r))::text[] as roles
    from unnest(allowed_roles) r
    where public.normalize_workspace_role(r) is not null
  )
  select exists (
    select 1
    from public.tenant_members tm
    cross join normalized_allowed na
    where tm.user_id = auth.uid()
      and tm.tenant_id = public.get_my_tenant_id()
      and public.normalize_workspace_role(tm.role) = any (coalesce(na.roles, array[]::text[]))
  );
$$;

create or replace function public.transfer_tenant_super_admin(p_new_super_admin_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'not authenticated';
  end if;

  v_tenant := public.get_my_tenant_id();
  if v_tenant is null then
    raise exception 'no tenant context';
  end if;

  if not exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = v_tenant
      and tm.user_id = v_caller
      and public.normalize_workspace_role(tm.role) = 'workspace_owner'
  ) then
    raise exception 'only workspace owner can transfer';
  end if;

  if p_new_super_admin_user_id = v_caller then
    raise exception 'choose another user';
  end if;

  if not exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = v_tenant and tm.user_id = p_new_super_admin_user_id
  ) then
    raise exception 'target is not a member of this workspace';
  end if;

  update public.tenant_members
  set role = 'workspace_admin'
  where tenant_id = v_tenant and user_id = v_caller;

  update public.tenant_members
  set role = 'workspace_owner'
  where tenant_id = v_tenant and user_id = p_new_super_admin_user_id;

  update public.tenants set owner_user_id = p_new_super_admin_user_id where id = v_tenant;
  update public.sales set administrator = true where user_id = p_new_super_admin_user_id;
end;
$$;

-- 3) Signup trigger now understands workspace role names.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sales_count int;
  default_tenant_id uuid;
  member_role text;
  prov_tenant uuid;
  prov_role text;
begin
  select count(*) into sales_count from public.sales;

  begin
    prov_tenant := nullif(trim(new.raw_user_meta_data ->> 'provisioned_tenant_id'), '')::uuid;
  exception
    when invalid_text_representation then
      prov_tenant := null;
  end;

  prov_role := coalesce(
    public.normalize_workspace_role(nullif(trim(new.raw_user_meta_data ->> 'provisioned_tenant_role'), '')),
    'workspace_owner'
  );

  insert into public.sales (first_name, last_name, email, user_id, administrator)
  values (
    coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data -> 'custom_claims' ->> 'first_name', 'Pending'),
    coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data -> 'custom_claims' ->> 'last_name', 'Pending'),
    new.email,
    new.id,
    case
      when prov_tenant is not null and prov_role in ('workspace_owner', 'workspace_admin', 'workspace_manager') then true
      when prov_tenant is not null then false
      when sales_count > 0 then false
      else true
    end
  );

  if prov_tenant is not null and exists (select 1 from public.tenants t where t.id = prov_tenant) then
    insert into public.tenant_members (tenant_id, user_id, role)
    values (prov_tenant, new.id, prov_role)
    on conflict (tenant_id, user_id) do update set
      role = (
        case greatest(
          case public.normalize_workspace_role(excluded.role)
            when 'workspace_owner' then 5
            when 'workspace_admin' then 4
            when 'workspace_manager' then 3
            when 'workspace_member' then 2
            else 1
          end,
          case public.normalize_workspace_role(tenant_members.role)
            when 'workspace_owner' then 5
            when 'workspace_admin' then 4
            when 'workspace_manager' then 3
            when 'workspace_member' then 2
            else 1
          end
        )
          when 5 then 'workspace_owner'
          when 4 then 'workspace_admin'
          when 3 then 'workspace_manager'
          when 2 then 'workspace_member'
          else 'workspace_viewer'
        end
      );

    if exists (
      select 1
      from public.tenant_members tm2
      where tm2.tenant_id = prov_tenant
        and tm2.user_id = new.id
        and public.normalize_workspace_role(tm2.role) = 'workspace_owner'
    ) then
      update public.tenants
      set owner_user_id = new.id
      where id = prov_tenant
        and owner_user_id is null;
    end if;

    update public.tenant_invites ti
    set accepted_at = now()
    where ti.tenant_id = prov_tenant
      and lower(trim(ti.email)) = lower(trim(new.email))
      and ti.accepted_at is null
      and ti.cancelled_at is null;
  elsif exists (select 1 from public.tenants t where t.slug = 'default-chaster') then
    select t.id into default_tenant_id
    from public.tenants t
    where t.slug = 'default-chaster'
    limit 1;

    if default_tenant_id is not null then
      member_role := case when sales_count = 0 then 'workspace_owner' else 'workspace_member' end;
      insert into public.tenant_members (tenant_id, user_id, role)
      values (default_tenant_id, new.id, member_role)
      on conflict (tenant_id, user_id) do update set
        role = (
          case greatest(
            case public.normalize_workspace_role(excluded.role)
              when 'workspace_owner' then 5
              when 'workspace_admin' then 4
              when 'workspace_manager' then 3
              when 'workspace_member' then 2
              else 1
            end,
            case public.normalize_workspace_role(tenant_members.role)
              when 'workspace_owner' then 5
              when 'workspace_admin' then 4
              when 'workspace_manager' then 3
              when 'workspace_member' then 2
              else 1
            end
          )
            when 5 then 'workspace_owner'
            when 4 then 'workspace_admin'
            when 3 then 'workspace_manager'
            when 2 then 'workspace_member'
            else 'workspace_viewer'
          end
        );
    end if;
  end if;

  return new;
end;
$$;
