--
-- Storage
-- This file declares storage bucket policies.
--

create policy "Attachments 1mt4rzk_0" on storage.objects for select to authenticated using (bucket_id = 'attachments');
create policy "Attachments 1mt4rzk_1" on storage.objects for insert to authenticated with check (bucket_id = 'attachments');
create policy "Attachments 1mt4rzk_3" on storage.objects for delete to authenticated using (bucket_id = 'attachments');

-- Chaster knowledge base (object path: {tenant_uuid}/...)
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
        and public.has_tenant_role(
            array['member', 'admin', 'super_admin']::text[]
        )
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
