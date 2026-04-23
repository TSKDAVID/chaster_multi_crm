-- HQ: tenant directory row + dashboard stats (Chaster staff only).

alter table public.tenants
    add column if not exists primary_contact_email text;

comment on column public.tenants.primary_contact_email is
    'Email used for the primary admin invite (HQ / provisioning); not synced from auth.users.';

-- ---------------------------------------------------------------------------
create or replace function public.hq_get_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_chaster_staff() then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    return jsonb_build_object(
        'total_tenants',
        (select count(*)::bigint from public.tenants),
        'total_team_members',
        (select count(*)::bigint from public.tenant_members),
        'distinct_users',
        (select count(distinct user_id)::bigint from public.tenant_members),
        'kb_documents_ready',
        (
            select count(*)::bigint
            from public.knowledge_base_documents
            where status = 'ready'
        ),
        'new_tenants_7d',
        (
            select count(*)::bigint
            from public.tenants
            where created_at >= (now() - interval '7 days')
        )
    );
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.hq_get_tenant_directory()
returns table (
    id uuid,
    company_name text,
    slug text,
    status text,
    subscription_tier text,
    trial_ends_at timestamptz,
    owner_user_id uuid,
    primary_contact_email text,
    created_at timestamptz,
    member_count bigint,
    kb_ready_count bigint,
    last_activity_at timestamptz,
    ai_customized boolean,
    health_score integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not public.is_chaster_staff() then
        raise exception 'forbidden' using errcode = '42501';
    end if;

    return query
    select
        t.id,
        t.company_name,
        t.slug,
        t.status,
        t.subscription_tier,
        t.trial_ends_at,
        t.owner_user_id,
        t.primary_contact_email,
        t.created_at,
        (
            select count(*)::bigint
            from public.tenant_members tm
            where tm.tenant_id = t.id
        ) as member_count,
        (
            select count(*)::bigint
            from public.knowledge_base_documents k
            where k.tenant_id = t.id
              and k.status = 'ready'
        ) as kb_ready_count,
        greatest(
            t.created_at,
            coalesce(
                (
                    select max(tm.joined_at)
                    from public.tenant_members tm
                    where tm.tenant_id = t.id
                ),
                t.created_at
            ),
            coalesce(
                (
                    select max(al.created_at)
                    from public.audit_logs al
                    where al.tenant_id = t.id
                ),
                t.created_at
            )
        ) as last_activity_at,
        exists (
            select 1
            from public.tenant_settings ts
            where ts.tenant_id = t.id
              and (
                  ts.ai_tone is distinct from 'professional'
                  or ts.escalation_threshold is distinct from 0.6::double precision
                  or coalesce(ts.widget_primary_color, '') not in ('', '#6366f1')
                  or coalesce(ts.widget_welcome_message, '') is distinct from
                     'Hi! How can I help you today?'
              )
        ) as ai_customized,
        least(
            100,
            (case
                when t.status = 'active' then 30
                when t.status = 'trial' then 20
                else 0
            end)
            + (
                case
                    when
                        (
                            select count(*)
                            from public.knowledge_base_documents k
                            where k.tenant_id = t.id
                              and k.status = 'ready'
                        )
                        >= 1
                    then 20
                    else 0
                end
            )
            + (
                case
                    when
                        (
                            select count(*)
                            from public.tenant_members tm
                            where tm.tenant_id = t.id
                        )
                        > 1
                    then 15
                    else 0
                end
            )
            + (
                case
                    when exists (
                        select 1
                        from public.tenant_settings ts
                        where ts.tenant_id = t.id
                          and (
                              ts.ai_tone is distinct from 'professional'
                              or ts.escalation_threshold is distinct from 0.6::double precision
                              or coalesce(ts.widget_primary_color, '') not in ('', '#6366f1')
                              or coalesce(ts.widget_welcome_message, '') is distinct from
                                 'Hi! How can I help you today?'
                          )
                    )
                    then 15
                    else 0
                end
            )
            + (
                case
                    when
                        greatest(
                            t.created_at,
                            coalesce(
                                (
                                    select max(tm.joined_at)
                                    from public.tenant_members tm
                                    where tm.tenant_id = t.id
                                ),
                                t.created_at
                            ),
                            coalesce(
                                (
                                    select max(al.created_at)
                                    from public.audit_logs al
                                    where al.tenant_id = t.id
                                ),
                                t.created_at
                            )
                        )
                        >= (now() - interval '7 days')
                    then 20
                    else 0
                end
            )
        )::integer as health_score
    from public.tenants t
    order by t.company_name asc;
end;
$$;

grant execute on function public.hq_get_dashboard_stats() to authenticated;
grant execute on function public.hq_get_tenant_directory() to authenticated;
