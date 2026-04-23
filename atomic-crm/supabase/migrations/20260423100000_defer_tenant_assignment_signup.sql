-- Allow landing-signup accounts to exist before checkout without auto-joining default tenant.

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
  defer_tenant_assignment boolean;
begin
  select count(*) into sales_count from public.sales;

  begin
    prov_tenant := nullif(trim(new.raw_user_meta_data ->> 'provisioned_tenant_id'), '')::uuid;
  exception
    when invalid_text_representation then
      prov_tenant := null;
  end;

  prov_role := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'provisioned_tenant_role'), ''),
    'super_admin'
  );
  defer_tenant_assignment := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'defer_tenant_assignment'), '')::boolean,
    false
  );

  if prov_role not in ('super_admin', 'admin', 'member') then
    prov_role := 'member';
  end if;

  insert into public.sales (first_name, last_name, email, user_id, administrator)
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
    case
      when prov_tenant is not null and prov_role in ('super_admin', 'admin') then true
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
          case excluded.role when 'super_admin' then 3 when 'admin' then 2 else 1 end,
          case tenant_members.role when 'super_admin' then 3 when 'admin' then 2 else 1 end
        )
          when 3 then 'super_admin'
          when 2 then 'admin'
          else 'member'
        end
      );

    if exists (
      select 1
      from public.tenant_members tm2
      where tm2.tenant_id = prov_tenant
        and tm2.user_id = new.id
        and tm2.role = 'super_admin'
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
  elsif not defer_tenant_assignment and exists (select 1 from public.tenants t where t.slug = 'default-chaster') then
    select t.id
    into default_tenant_id
    from public.tenants t
    where t.slug = 'default-chaster'
    limit 1;

    if default_tenant_id is not null then
      member_role := case when sales_count = 0 then 'super_admin' else 'member' end;
      insert into public.tenant_members (tenant_id, user_id, role)
      values (default_tenant_id, new.id, member_role)
      on conflict (tenant_id, user_id) do update set
        role = (
          case greatest(
            case excluded.role when 'super_admin' then 3 when 'admin' then 2 else 1 end,
            case tenant_members.role when 'super_admin' then 3 when 'admin' then 2 else 1 end
          )
            when 3 then 'super_admin'
            when 2 then 'admin'
            else 'member'
          end
        );
    end if;
  end if;

  return new;
end;
$$;
