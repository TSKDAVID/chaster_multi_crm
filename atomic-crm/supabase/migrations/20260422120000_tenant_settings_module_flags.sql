alter table public.tenant_settings
    add column if not exists crm_module_enabled boolean not null default true,
    add column if not exists widget_module_enabled boolean not null default true;
