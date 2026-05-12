-- Internal Chaster HQ subdivisions (e.g. Customer Support, Success) — not customer tenants.
-- Membership is limited to users who appear in public.chaster_team.

create table public.hq_organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    description text,
    purpose text,
    accent_color text not null default '#6366f1',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid references auth.users (id)
);

comment on table public.hq_organizations is
  'Internal HQ divisions for staffing and routing — separate from customer tenants.';

create table public.hq_organization_members (
    hq_organization_id uuid not null references public.hq_organizations (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    role text not null default 'member'
        check (role in ('lead', 'admin', 'member')),
    note text,
    added_at timestamptz not null default now(),
    added_by uuid references auth.users (id),
    primary key (hq_organization_id, user_id)
);

create index hq_organization_members_user_id_idx
    on public.hq_organization_members using btree (user_id);

create or replace function public.hq_org_member_must_be_platform_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if not exists (
        select 1 from public.chaster_team ct where ct.user_id = new.user_id
    ) then
        raise exception 'HQ organization members must be on the Chaster platform team (chaster_team)';
    end if;
    return new;
end;
$$;

drop trigger if exists hq_org_member_staff_guard on public.hq_organization_members;

create trigger hq_org_member_staff_guard
    before insert or update on public.hq_organization_members
    for each row
    execute function public.hq_org_member_must_be_platform_staff();

create or replace function public.hq_can_manage_internal_orgs()
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
          and public.normalize_hq_role(ct.role) in (
              'hq_owner',
              'hq_ops_admin',
              'hq_support_lead'
          )
    );
$$;

create or replace function public.touch_hq_organization_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists hq_organizations_touch_updated on public.hq_organizations;

create trigger hq_organizations_touch_updated
    before update on public.hq_organizations
    for each row
    execute function public.touch_hq_organization_updated_at();

alter table public.hq_organizations enable row level security;
alter table public.hq_organization_members enable row level security;

create policy hq_organizations_select on public.hq_organizations
    for select to authenticated
    using (public.is_chaster_staff());

create policy hq_organizations_insert on public.hq_organizations
    for insert to authenticated
    with check (public.hq_can_manage_internal_orgs());

create policy hq_organizations_update on public.hq_organizations
    for update to authenticated
    using (public.hq_can_manage_internal_orgs())
    with check (public.hq_can_manage_internal_orgs());

create policy hq_organizations_delete on public.hq_organizations
    for delete to authenticated
    using (public.hq_can_manage_internal_orgs());

create policy hq_organization_members_select on public.hq_organization_members
    for select to authenticated
    using (public.is_chaster_staff());

create policy hq_organization_members_insert on public.hq_organization_members
    for insert to authenticated
    with check (public.hq_can_manage_internal_orgs());

create policy hq_organization_members_update on public.hq_organization_members
    for update to authenticated
    using (public.hq_can_manage_internal_orgs())
    with check (public.hq_can_manage_internal_orgs());

create policy hq_organization_members_delete on public.hq_organization_members
    for delete to authenticated
    using (public.hq_can_manage_internal_orgs());

grant select, insert, update, delete on public.hq_organizations to authenticated;
grant select, insert, update, delete on public.hq_organization_members to authenticated;
grant all on public.hq_organizations to service_role;
grant all on public.hq_organization_members to service_role;
