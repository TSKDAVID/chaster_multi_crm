-- Allow HQ staff and portal users to reopen resolved / pending_client cases.

create or replace function public.reopen_support_case(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tid uuid;
    v_updated boolean := false;
begin
    if auth.uid() is null then
        raise exception 'forbidden';
    end if;

    if not public.support_case_visible_to_me(p_case_id) then
        raise exception 'forbidden';
    end if;

    if public.is_chaster_staff() then
        update public.support_cases c
        set
            status = 'open',
            resolved_at = null,
            closure_reason = null,
            closure_note = null
        where
            c.id = p_case_id
            and c.status in ('resolved', 'pending_client');
        v_updated := found;
    else
        v_tid := public.get_my_tenant_id();
        if v_tid is null then
            raise exception 'forbidden';
        end if;
        if
            not public.has_tenant_role(
                array['member', 'admin', 'super_admin']::text[]
            )
        then
            raise exception 'forbidden';
        end if;
        update public.support_cases c
        set
            status = 'open',
            resolved_at = null,
            closure_reason = null,
            closure_note = null
        where
            c.id = p_case_id
            and c.tenant_id = v_tid
            and c.status in ('resolved', 'pending_client');
        v_updated := found;
    end if;

    if not v_updated then
        raise exception 'cannot reopen';
    end if;
end;
$$;
