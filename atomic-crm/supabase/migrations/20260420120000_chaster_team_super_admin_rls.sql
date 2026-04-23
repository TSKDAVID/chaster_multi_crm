-- Chaster HQ platform team: only super admins may add/remove/change chaster_team rows.
-- All staff may read the roster. Prevents demoting/removing the last super_admin.

create or replace function public.is_chaster_team_super_admin()
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
          and ct.role = 'super_admin'
    );
$$;

grant execute on function public.is_chaster_team_super_admin() to authenticated;
grant execute on function public.is_chaster_team_super_admin() to service_role;

create or replace function public.chaster_team_guard_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    others int;
begin
    if tg_op = 'DELETE' then
        if OLD.role = 'super_admin' then
            select count(*)::int into others
            from public.chaster_team
            where
                role = 'super_admin'
                and user_id <> OLD.user_id;
            if others < 1 then
                raise exception 'cannot remove the last Chaster HQ super admin';
            end if;
        end if;
        return OLD;
    elsif tg_op = 'UPDATE' then
        if OLD.role = 'super_admin' and coalesce(NEW.role, '') <> 'super_admin' then
            select count(*)::int into others
            from public.chaster_team
            where
                role = 'super_admin'
                and user_id <> OLD.user_id;
            if others < 1 then
                raise exception 'cannot demote the last Chaster HQ super admin';
            end if;
        end if;
        return NEW;
    end if;
    return null;
end;
$$;

drop trigger if exists chaster_team_guard_last_super_admin_row on public.chaster_team;

create trigger chaster_team_guard_last_super_admin_row
    before delete or update on public.chaster_team
    for each row
    execute function public.chaster_team_guard_last_super_admin();

drop policy if exists chaster_team_all on public.chaster_team;

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
