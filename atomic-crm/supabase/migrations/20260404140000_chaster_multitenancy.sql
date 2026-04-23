-- Chaster: multi-tenant tables, tenant_id on CRM data, helper functions, and tenant-aware RLS.

-- ---------------------------------------------------------------------------
-- Core Chaster tables
-- ---------------------------------------------------------------------------

create table public.tenants (
    id uuid primary key default gen_random_uuid(),
    company_name text not null,
    slug text not null unique,
    status text not null default 'trial',
    subscription_tier text not null default 'starter',
    trial_ends_at timestamptz,
    created_at timestamptz not null default now(),
    owner_user_id uuid references auth.users (id),
    notes text
);

create table public.tenant_members (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    role text not null default 'member',
    invited_by uuid references auth.users (id),
    joined_at timestamptz not null default now(),
    unique (tenant_id, user_id)
);

create index tenant_members_user_id_idx on public.tenant_members using btree (user_id);
create index tenant_members_tenant_id_idx on public.tenant_members using btree (tenant_id);

create table public.chaster_team (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users (id) on delete cascade,
    role text not null default 'staff',
    added_at timestamptz not null default now()
);

create table public.knowledge_base_documents (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null references public.tenants (id) on delete cascade,
    file_name text not null,
    file_type text not null,
    storage_path text not null,
    status text not null default 'processing',
    uploaded_by uuid references auth.users (id),
    uploaded_at timestamptz not null default now(),
    file_size_bytes bigint
);

create index knowledge_base_documents_tenant_id_idx
    on public.knowledge_base_documents using btree (tenant_id);

create table public.audit_logs (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references public.tenants (id) on delete set null,
    actor_user_id uuid references auth.users (id),
    action text not null,
    target_user_id uuid references auth.users (id),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index audit_logs_tenant_id_idx on public.audit_logs using btree (tenant_id);
create index audit_logs_created_at_idx on public.audit_logs using btree (created_at desc);

create table public.tenant_settings (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid not null unique references public.tenants (id) on delete cascade,
    ai_tone text not null default 'professional',
    escalation_threshold double precision not null default 0.6,
    business_hours_start time not null default '09:00',
    business_hours_end time not null default '17:00',
    timezone text not null default 'UTC',
    widget_primary_color text not null default '#6366f1',
    widget_welcome_message text not null default 'Hi! How can I help you today?',
    widget_position text not null default 'bottom-right'
);

-- ---------------------------------------------------------------------------
-- CRM tables: tenant scope
-- ---------------------------------------------------------------------------

alter table public.companies add column tenant_id uuid references public.tenants (id);
alter table public.contacts add column tenant_id uuid references public.tenants (id);
alter table public.deals add column tenant_id uuid references public.tenants (id);
alter table public.tasks add column tenant_id uuid references public.tenants (id);
alter table public.contact_notes add column tenant_id uuid references public.tenants (id);
alter table public.deal_notes add column tenant_id uuid references public.tenants (id);
alter table public.tags add column tenant_id uuid references public.tenants (id);

create index companies_tenant_id_idx on public.companies using btree (tenant_id);
create index contacts_tenant_id_idx on public.contacts using btree (tenant_id);
create index deals_tenant_id_idx on public.deals using btree (tenant_id);
create index tasks_tenant_id_idx on public.tasks using btree (tenant_id);
create index contact_notes_tenant_id_idx on public.contact_notes using btree (tenant_id);
create index deal_notes_tenant_id_idx on public.deal_notes using btree (tenant_id);
create index tags_tenant_id_idx on public.tags using btree (tenant_id);

-- Default tenant + backfill (existing single-tenant CRM data)
insert into public.tenants (company_name, slug, status, subscription_tier)
values ('Default organization', 'default-chaster', 'active', 'enterprise');

update public.companies
set tenant_id = (select id from public.tenants where slug = 'default-chaster' limit 1)
where tenant_id is null;

update public.contacts
set tenant_id = (select id from public.tenants where slug = 'default-chaster' limit 1)
where tenant_id is null;

update public.deals
set tenant_id = (select id from public.tenants where slug = 'default-chaster' limit 1)
where tenant_id is null;

update public.tasks
set tenant_id = (select id from public.tenants where slug = 'default-chaster' limit 1)
where tenant_id is null;

update public.contact_notes cn
set tenant_id = coalesce(
        (select c.tenant_id from public.contacts c where c.id = cn.contact_id limit 1),
        (select id from public.tenants where slug = 'default-chaster' limit 1)
    )
where cn.tenant_id is null;

update public.deal_notes dn
set tenant_id = coalesce(
        (select d.tenant_id from public.deals d where d.id = dn.deal_id limit 1),
        (select id from public.tenants where slug = 'default-chaster' limit 1)
    )
where dn.tenant_id is null;

update public.tags
set tenant_id = (select id from public.tenants where slug = 'default-chaster' limit 1)
where tenant_id is null;

insert into public.tenant_members (tenant_id, user_id, role)
select
    (select id from public.tenants where slug = 'default-chaster' limit 1),
    s.user_id,
    case
        when s.user_id = (
            select s2.user_id
            from public.sales s2
            where s2.administrator = true
            order by s2.id
            limit 1
        ) then 'super_admin'
        when s.administrator then 'admin'
        else 'member'
    end
from public.sales s
on conflict (tenant_id, user_id) do nothing;

insert into public.tenant_settings (tenant_id)
select t.id
from public.tenants t
where t.slug = 'default-chaster'
  and not exists (
        select 1 from public.tenant_settings ts where ts.tenant_id = t.id
    );

alter table public.companies alter column tenant_id set not null;
alter table public.contacts alter column tenant_id set not null;
alter table public.deals alter column tenant_id set not null;
alter table public.tasks alter column tenant_id set not null;
alter table public.contact_notes alter column tenant_id set not null;
alter table public.deal_notes alter column tenant_id set not null;
alter table public.tags alter column tenant_id set not null;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

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
    where tm.user_id = auth.uid()
    order by tm.joined_at
    limit 1;
$$;

create or replace function public.has_tenant_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = public.get_my_tenant_id()
          and tm.role = any (allowed_roles)
    );
$$;

create or replace function public.is_tenant_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select public.has_tenant_role(array['super_admin']::text[]);
$$;

create or replace function public.set_tenant_id_default()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
    if new.tenant_id is null then
        new.tenant_id := public.get_my_tenant_id();
    end if;
    return new;
end;
$$;

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
begin
    select count(*) into sales_count from public.sales;

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
        case when sales_count > 0 then false else true end
    );

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

    return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers: auto tenant_id on insert
-- ---------------------------------------------------------------------------

create trigger set_company_tenant_id_trigger
    before insert on public.companies
    for each row execute function public.set_tenant_id_default();

create trigger set_contact_tenant_id_trigger
    before insert on public.contacts
    for each row execute function public.set_tenant_id_default();

create trigger set_deal_tenant_id_trigger
    before insert on public.deals
    for each row execute function public.set_tenant_id_default();

create trigger set_task_tenant_id_trigger
    before insert on public.tasks
    for each row execute function public.set_tenant_id_default();

create trigger set_contact_notes_tenant_id_trigger
    before insert on public.contact_notes
    for each row execute function public.set_tenant_id_default();

create trigger set_deal_notes_tenant_id_trigger
    before insert on public.deal_notes
    for each row execute function public.set_tenant_id_default();

create trigger set_tags_tenant_id_trigger
    before insert on public.tags
    for each row execute function public.set_tenant_id_default();

-- ---------------------------------------------------------------------------
-- RLS: Chaster tables
-- ---------------------------------------------------------------------------

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.chaster_team enable row level security;
alter table public.knowledge_base_documents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.tenant_settings enable row level security;

create policy tenants_select on public.tenants
    for select to authenticated
    using (public.is_chaster_staff() or id = public.get_my_tenant_id());

create policy tenants_insert on public.tenants
    for insert to authenticated
    with check (public.is_chaster_staff());

create policy tenants_update on public.tenants
    for update to authenticated
    using (public.is_chaster_staff())
    with check (public.is_chaster_staff());

create policy tenants_delete on public.tenants
    for delete to authenticated
    using (public.is_chaster_staff());

create policy tenant_members_select on public.tenant_members
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy tenant_members_insert on public.tenant_members
    for insert to authenticated
    with check (
        public.is_chaster_staff()
        or (
            exists (
                select 1
                from public.tenant_members tm
                where tm.tenant_id = tenant_id
                  and tm.user_id = auth.uid()
                  and tm.role = 'super_admin'
            )
        )
    );

create policy tenant_members_update on public.tenant_members
    for update to authenticated
    using (
        public.is_chaster_staff()
        or (
            exists (
                select 1
                from public.tenant_members tm
                where tm.tenant_id = tenant_id
                  and tm.user_id = auth.uid()
                  and tm.role = 'super_admin'
            )
        )
    )
    with check (
        public.is_chaster_staff()
        or (
            exists (
                select 1
                from public.tenant_members tm
                where tm.tenant_id = tenant_id
                  and tm.user_id = auth.uid()
                  and tm.role = 'super_admin'
            )
        )
    );

create policy tenant_members_delete on public.tenant_members
    for delete to authenticated
    using (
        public.is_chaster_staff()
        or (
            exists (
                select 1
                from public.tenant_members tm
                where tm.tenant_id = tenant_id
                  and tm.user_id = auth.uid()
                  and tm.role = 'super_admin'
            )
        )
    );

create policy chaster_team_all on public.chaster_team
    for all to authenticated
    using (public.is_chaster_staff())
    with check (public.is_chaster_staff());

create policy kb_select on public.knowledge_base_documents
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy kb_insert on public.knowledge_base_documents
    for insert to authenticated
    with check (
        tenant_id = public.get_my_tenant_id()
        and public.has_tenant_role(array['admin', 'super_admin']::text[])
    );

create policy kb_update on public.knowledge_base_documents
    for update to authenticated
    using (
        tenant_id = public.get_my_tenant_id()
        and public.has_tenant_role(array['admin', 'super_admin']::text[])
    )
    with check (
        tenant_id = public.get_my_tenant_id()
        and public.has_tenant_role(array['admin', 'super_admin']::text[])
    );

create policy kb_delete on public.knowledge_base_documents
    for delete to authenticated
    using (
        tenant_id = public.get_my_tenant_id()
        and public.has_tenant_role(array['admin', 'super_admin']::text[])
    );

create policy audit_select on public.audit_logs
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
        or tenant_id is null
    );

create policy audit_insert on public.audit_logs
    for insert to authenticated
    with check (
        actor_user_id = auth.uid()
        and (
            tenant_id is null
            or tenant_id = public.get_my_tenant_id()
            or public.is_chaster_staff()
        )
    );

create policy tenant_settings_select on public.tenant_settings
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy tenant_settings_update on public.tenant_settings
    for update to authenticated
    using (
        public.is_chaster_staff()
        or (
            tenant_id = public.get_my_tenant_id()
            and public.has_tenant_role(array['admin', 'super_admin']::text[])
        )
    )
    with check (
        public.is_chaster_staff()
        or (
            tenant_id = public.get_my_tenant_id()
            and public.has_tenant_role(array['admin', 'super_admin']::text[])
        )
    );

create policy tenant_settings_insert on public.tenant_settings
    for insert to authenticated
    with check (public.is_chaster_staff());

-- ---------------------------------------------------------------------------
-- RLS: CRM tables (tenant isolation)
-- ---------------------------------------------------------------------------

drop policy if exists "Enable read access for authenticated users" on public.companies;
drop policy if exists "Enable insert for authenticated users only" on public.companies;
drop policy if exists "Enable update for authenticated users only" on public.companies;
drop policy if exists "Company Delete Policy" on public.companies;

create policy companies_select on public.companies
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy companies_insert on public.companies
    for insert to authenticated
    with check (tenant_id = public.get_my_tenant_id());

create policy companies_update on public.companies
    for update to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    )
    with check (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy companies_delete on public.companies
    for delete to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

drop policy if exists "Enable read access for authenticated users" on public.contacts;
drop policy if exists "Enable insert for authenticated users only" on public.contacts;
drop policy if exists "Enable update for authenticated users only" on public.contacts;
drop policy if exists "Contact Delete Policy" on public.contacts;

create policy contacts_select on public.contacts
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy contacts_insert on public.contacts
    for insert to authenticated
    with check (tenant_id = public.get_my_tenant_id());

create policy contacts_update on public.contacts
    for update to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    )
    with check (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy contacts_delete on public.contacts
    for delete to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

drop policy if exists "Enable read access for authenticated users" on public.contact_notes;
drop policy if exists "Enable insert for authenticated users only" on public.contact_notes;
drop policy if exists "Contact Notes Update policy" on public.contact_notes;
drop policy if exists "Contact Notes Delete Policy" on public.contact_notes;

create policy contact_notes_select on public.contact_notes
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy contact_notes_insert on public.contact_notes
    for insert to authenticated
    with check (tenant_id = public.get_my_tenant_id());

create policy contact_notes_update on public.contact_notes
    for update to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    )
    with check (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy contact_notes_delete on public.contact_notes
    for delete to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

drop policy if exists "Enable read access for authenticated users" on public.deals;
drop policy if exists "Enable insert for authenticated users only" on public.deals;
drop policy if exists "Enable update for authenticated users only" on public.deals;
drop policy if exists "Deals Delete Policy" on public.deals;

create policy deals_select on public.deals
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy deals_insert on public.deals
    for insert to authenticated
    with check (tenant_id = public.get_my_tenant_id());

create policy deals_update on public.deals
    for update to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    )
    with check (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy deals_delete on public.deals
    for delete to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

drop policy if exists "Enable read access for authenticated users" on public.deal_notes;
drop policy if exists "Enable insert for authenticated users only" on public.deal_notes;
drop policy if exists "Deal Notes Update Policy" on public.deal_notes;
drop policy if exists "Deal Notes Delete Policy" on public.deal_notes;

create policy deal_notes_select on public.deal_notes
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy deal_notes_insert on public.deal_notes
    for insert to authenticated
    with check (tenant_id = public.get_my_tenant_id());

create policy deal_notes_update on public.deal_notes
    for update to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    )
    with check (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy deal_notes_delete on public.deal_notes
    for delete to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

drop policy if exists "Enable read access for authenticated users" on public.tags;
drop policy if exists "Enable insert for authenticated users only" on public.tags;
drop policy if exists "Enable update for authenticated users only" on public.tags;
drop policy if exists "Enable delete for authenticated users only" on public.tags;

create policy tags_select on public.tags
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy tags_insert on public.tags
    for insert to authenticated
    with check (tenant_id = public.get_my_tenant_id());

create policy tags_update on public.tags
    for update to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    )
    with check (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy tags_delete on public.tags
    for delete to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

drop policy if exists "Enable read access for authenticated users" on public.tasks;
drop policy if exists "Enable insert for authenticated users only" on public.tasks;
drop policy if exists "Task Update Policy" on public.tasks;
drop policy if exists "Task Delete Policy" on public.tasks;

create policy tasks_select on public.tasks
    for select to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy tasks_insert on public.tasks
    for insert to authenticated
    with check (tenant_id = public.get_my_tenant_id());

create policy tasks_update on public.tasks
    for update to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    )
    with check (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

create policy tasks_delete on public.tasks
    for delete to authenticated
    using (
        public.is_chaster_staff()
        or tenant_id = public.get_my_tenant_id()
    );

-- ---------------------------------------------------------------------------
-- Storage: knowledge-base bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
select 'knowledge-base', 'knowledge-base', false
where not exists (select 1 from storage.buckets where id = 'knowledge-base');

create policy "Knowledge base select"
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'knowledge-base'
        and (
            public.is_chaster_staff()
            or (storage.foldername(name))[1] = public.get_my_tenant_id()::text
        )
    );

create policy "Knowledge base insert"
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'knowledge-base'
        and public.has_tenant_role(array['admin', 'super_admin']::text[])
        and (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    );

create policy "Knowledge base update"
    on storage.objects
    for update
    to authenticated
    using (
        bucket_id = 'knowledge-base'
        and public.has_tenant_role(array['admin', 'super_admin']::text[])
        and (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    )
    with check (
        bucket_id = 'knowledge-base'
        and public.has_tenant_role(array['admin', 'super_admin']::text[])
        and (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    );

create policy "Knowledge base delete"
    on storage.objects
    for delete
    to authenticated
    using (
        bucket_id = 'knowledge-base'
        and public.has_tenant_role(array['admin', 'super_admin']::text[])
        and (storage.foldername(name))[1] = public.get_my_tenant_id()::text
    );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.tenants to authenticated;
grant select, insert, update, delete on public.tenant_members to authenticated;
grant select, insert, update, delete on public.chaster_team to authenticated;
grant select, insert, update, delete on public.knowledge_base_documents to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, update on public.tenant_settings to authenticated;

grant all on table public.tenants to service_role;
grant all on table public.tenant_members to service_role;
grant all on table public.chaster_team to service_role;
grant all on table public.knowledge_base_documents to service_role;
grant all on table public.audit_logs to service_role;
grant all on table public.tenant_settings to service_role;

grant execute on function public.is_chaster_staff() to authenticated;
grant execute on function public.get_my_tenant_id() to authenticated;
grant execute on function public.has_tenant_role(text[]) to authenticated;
grant execute on function public.is_tenant_super_admin() to authenticated;
grant execute on function public.set_tenant_id_default() to authenticated;

-- ---------------------------------------------------------------------------
-- Views (drop + create: PG cannot reorder columns with CREATE OR REPLACE VIEW)
-- ---------------------------------------------------------------------------

drop view if exists public.contacts_summary cascade;
drop view if exists public.companies_summary cascade;

create view public.companies_summary with (security_invoker = on) as
select
    c.id,
    c.created_at,
    c.name,
    c.sector,
    c.size,
    c.linkedin_url,
    c.website,
    c.phone_number,
    c.address,
    c.zipcode,
    c.city,
    c.state_abbr,
    c.sales_id,
    c.tenant_id,
    c.context_links,
    c.country,
    c.description,
    c.revenue,
    c.tax_identifier,
    c.logo,
    count(distinct d.id) as nb_deals,
    count(distinct co.id) as nb_contacts
from public.companies c
    left join public.deals d on c.id = d.company_id
    left join public.contacts co on c.id = co.company_id
group by c.id;

create view public.contacts_summary with (security_invoker = on) as
select
    co.id,
    co.first_name,
    co.last_name,
    co.gender,
    co.title,
    co.background,
    co.avatar,
    co.first_seen,
    co.last_seen,
    co.has_newsletter,
    co.status,
    co.tags,
    co.company_id,
    co.sales_id,
    co.tenant_id,
    co.linkedin_url,
    co.email_jsonb,
    co.phone_jsonb,
    (jsonb_path_query_array(co.email_jsonb, '$[*]."email"'))::text as email_fts,
    (jsonb_path_query_array(co.phone_jsonb, '$[*]."number"'))::text as phone_fts,
    c.name as company_name,
    count(distinct t.id) filter (where t.done_date is null) as nb_tasks
from public.contacts co
    left join public.tasks t on co.id = t.contact_id
    left join public.companies c on co.company_id = c.id
group by co.id, c.name;

grant all on table public.companies_summary to anon;
grant all on table public.companies_summary to authenticated;
grant all on table public.companies_summary to service_role;

grant all on table public.contacts_summary to anon;
grant all on table public.contacts_summary to authenticated;
grant all on table public.contacts_summary to service_role;
