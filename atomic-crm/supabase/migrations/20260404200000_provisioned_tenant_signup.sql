-- Signups from checkout / Chaster invites carry user_metadata.provisioned_tenant_id (uuid string)
-- so new users join the correct tenant instead of only default-chaster.

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
        nullif(trim(new.raw_user_meta_data ->> 'provisioned_tenant_role'), ''),
        'super_admin'
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
        on conflict (tenant_id, user_id) do nothing;

        if prov_role = 'super_admin' then
            update public.tenants
            set owner_user_id = new.id
            where id = prov_tenant
              and owner_user_id is null;
        end if;
    elsif exists (select 1 from public.tenants t where t.slug = 'default-chaster') then
        select t.id
        into default_tenant_id
        from public.tenants t
        where t.slug = 'default-chaster'
        limit 1;

        if default_tenant_id is not null then
            member_role := case when sales_count = 0 then 'super_admin' else 'member' end;
            insert into public.tenant_members (tenant_id, user_id, role)
            values (default_tenant_id, new.id, member_role)
            on conflict (tenant_id, user_id) do nothing;
        end if;
    end if;

    return new;
end;
$$;
