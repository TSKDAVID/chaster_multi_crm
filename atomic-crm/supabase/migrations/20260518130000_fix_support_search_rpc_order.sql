-- Fix search RPCs: aggregate per case so ORDER BY is valid with message joins.

create or replace function public.search_support_cases_portal(
    p_query text,
    p_limit int default 50
)
returns table (case_id uuid, rank real)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_tid uuid;
    v_q text;
begin
    v_tid := public.get_my_tenant_id();
    if v_tid is null then
        raise exception 'no tenant';
    end if;
    if not public.has_tenant_role(array['member', 'admin', 'super_admin']::text[]) then
        raise exception 'forbidden';
    end if;

    v_q := '%' || lower(trim(coalesce(p_query, ''))) || '%';
    if length(trim(coalesce(p_query, ''))) < 2 then
        return;
    end if;

    return query
    select agg.id,
        agg.rank
    from (
        select sc.id,
            max(
                greatest(
                    case when lower(sc.subject) like v_q then 1.0 else 0.0 end,
                    case when lower(sc.case_number) like v_q then 0.9 else 0.0 end,
                    case when lower(coalesce(sc.description, '')) like v_q then 0.7 else 0.0 end,
                    case when lower(coalesce(scm.body, '')) like v_q then 0.6 else 0.0 end
                )
            )::real as rank,
            max(sc.updated_at) as updated_at
        from public.support_cases sc
        left join public.support_case_messages scm
            on scm.case_id = sc.id and scm.is_system = false
        where sc.tenant_id = v_tid
          and (
              lower(sc.subject) like v_q
              or lower(sc.case_number) like v_q
              or lower(coalesce(sc.description, '')) like v_q
              or lower(coalesce(scm.body, '')) like v_q
          )
        group by sc.id
    ) agg
    order by agg.rank desc, agg.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

create or replace function public.search_support_cases_hq(
    p_query text,
    p_limit int default 50
)
returns table (case_id uuid, rank real)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_q text;
begin
    if not public.is_hq_support_role() then
        raise exception 'forbidden';
    end if;

    v_q := '%' || lower(trim(coalesce(p_query, ''))) || '%';
    if length(trim(coalesce(p_query, ''))) < 2 then
        return;
    end if;

    return query
    select agg.id,
        agg.rank
    from (
        select sc.id,
            max(
                greatest(
                    case when lower(sc.subject) like v_q then 1.0 else 0.0 end,
                    case when lower(sc.case_number) like v_q then 0.9 else 0.0 end,
                    case when lower(coalesce(sc.description, '')) like v_q then 0.7 else 0.0 end,
                    case when lower(coalesce(scm.body, '')) like v_q then 0.6 else 0.0 end
                )
            )::real as rank,
            max(sc.updated_at) as updated_at
        from public.support_cases sc
        left join public.support_case_messages scm
            on scm.case_id = sc.id and scm.is_system = false
        where (
              lower(sc.subject) like v_q
              or lower(sc.case_number) like v_q
              or lower(coalesce(sc.description, '')) like v_q
              or lower(coalesce(scm.body, '')) like v_q
          )
        group by sc.id
    ) agg
    order by agg.rank desc, agg.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;
