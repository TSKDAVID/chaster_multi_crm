--
-- Row Level Security
-- This file declares RLS policies for all tables.
--

-- Enable RLS on all tables
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_notes enable row level security;
alter table public.deals enable row level security;
alter table public.deal_notes enable row level security;
alter table public.sales enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.configuration enable row level security;
alter table public.favicons_excluded_domains enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.chaster_team enable row level security;
alter table public.knowledge_base_documents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.tenant_invites enable row level security;

-- Companies (tenant-scoped)
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

-- Contacts
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

-- Contact Notes
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

-- Deals
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

-- Deal Notes
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

-- Sales
create policy "Enable read access for authenticated users" on public.sales for select to authenticated using (true);

-- Tags
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

-- Tasks
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

-- Configuration (admin-only for writes)
create policy "Enable read for authenticated" on public.configuration for select to authenticated using (true);
create policy "Enable insert for admins" on public.configuration for insert to authenticated with check (public.is_admin());
create policy "Enable update for admins" on public.configuration for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Favicons excluded domains
create policy "Enable access for authenticated users only" on public.favicons_excluded_domains to authenticated using (true) with check (true);

-- Chaster: tenants
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

-- tenant_members
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

-- chaster_team (read: any staff; write: HQ super_admin only)
create policy chaster_team_select on public.chaster_team
    for select to authenticated
    using (public.is_chaster_staff());

create policy chaster_team_insert on public.chaster_team
    for insert to authenticated
    with check (public.is_chaster_team_super_admin());

create policy chaster_team_update on public.chaster_team
    for update to authenticated
    using (public.is_chaster_team_super_admin())
    with check (public.is_chaster_team_super_admin());

create policy chaster_team_delete on public.chaster_team
    for delete to authenticated
    using (public.is_chaster_team_super_admin());

-- knowledge_base_documents
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
        and public.has_tenant_role(
            array['member', 'admin', 'super_admin']::text[]
        )
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

-- audit_logs (append-only for clients; no delete policy)
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

-- tenant_settings
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

-- tenant_invites (portal admins; Chaster staff read for support)
create policy tenant_invites_select on public.tenant_invites
    for select to authenticated
    using (
        public.is_chaster_staff()
        or (
            tenant_id = public.get_my_tenant_id()
            and public.has_tenant_role(array['admin', 'super_admin']::text[])
        )
    );

create policy tenant_invites_update on public.tenant_invites
    for update to authenticated
    using (
        tenant_id = public.get_my_tenant_id()
        and public.has_tenant_role(array['admin', 'super_admin']::text[])
    )
    with check (
        tenant_id = public.get_my_tenant_id()
        and public.has_tenant_role(array['admin', 'super_admin']::text[])
    );
