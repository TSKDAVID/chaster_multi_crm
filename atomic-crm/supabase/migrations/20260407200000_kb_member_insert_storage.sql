-- Client org members may add KB files/FAQs; only admins+ remove (DB + Storage unchanged for delete/update).

drop policy if exists kb_insert on public.knowledge_base_documents;

create policy kb_insert on public.knowledge_base_documents
  for insert to authenticated
  with check (
    tenant_id = public.get_my_tenant_id()
    and public.has_tenant_role(
      array['member', 'admin', 'super_admin']::text[]
    )
  );

drop policy if exists "Knowledge base insert" on storage.objects;

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
