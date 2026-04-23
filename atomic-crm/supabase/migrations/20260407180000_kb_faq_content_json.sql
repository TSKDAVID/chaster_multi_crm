-- FAQ rows store Q&A in `content_json`; no Storage object required.
alter table public.knowledge_base_documents
  alter column storage_path drop not null;

alter table public.knowledge_base_documents
  add column if not exists content_json jsonb null;

comment on column public.knowledge_base_documents.content_json is
  'For file_type = faq: {"question":"...","answer":"..."}. Files still use storage_path.';
