-- HQ internal team DMs: staff_dm (Chaster team only, no tenant_id).

-- ---------------------------------------------------------------------------
-- conversations: allow type staff_dm and null tenant_id
-- ---------------------------------------------------------------------------

alter table public.conversations drop constraint if exists conversations_type_check;

alter table public.conversations add constraint conversations_type_check
    check (type in ('team_dm', 'team_group', 'hq_client', 'staff_dm'));

alter table public.conversations drop constraint if exists conversations_non_hq_has_tenant;

alter table public.conversations add constraint conversations_non_hq_has_tenant check (
    type in ('hq_client', 'staff_dm')
    or tenant_id is not null
);

alter table public.conversations drop constraint if exists conversations_team_dm_participants;

alter table public.conversations add constraint conversations_team_dm_participants check (
    type not in ('team_dm', 'staff_dm')
    or (
        participant_a is not null
        and participant_b is not null
        and participant_a < participant_b
    )
);

create unique index if not exists conversations_staff_dm_participants_uniq
    on public.conversations (participant_a, participant_b)
    where type = 'staff_dm';

-- ---------------------------------------------------------------------------
-- RPC: staff ↔ staff DM (both must be in chaster_team)
-- ---------------------------------------------------------------------------

create or replace function public.get_or_create_staff_dm(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me uuid := auth.uid();
    v_a uuid;
    v_b uuid;
    v_cid uuid;
    v_ins int;
begin
    if v_me is null then
        raise exception 'not authenticated';
    end if;
    if p_other_user_id is null then
        raise exception 'invalid arguments';
    end if;
    if v_me = p_other_user_id then
        raise exception 'cannot dm yourself';
    end if;

    if not public.is_chaster_staff() then
        raise exception 'forbidden';
    end if;

    if not exists (
        select 1 from public.chaster_team ct where ct.user_id = p_other_user_id
    ) then
        raise exception 'user is not chaster staff';
    end if;

    if v_me < p_other_user_id then
        v_a := v_me;
        v_b := p_other_user_id;
    else
        v_a := p_other_user_id;
        v_b := v_me;
    end if;

    insert into public.conversations (tenant_id, type, created_by, participant_a, participant_b)
    values (null, 'staff_dm', v_me, v_a, v_b)
    on conflict (participant_a, participant_b) where (type = 'staff_dm')
    do nothing;

    get diagnostics v_ins = row_count;

    select c.id
    into v_cid
    from public.conversations c
    where c.type = 'staff_dm'
      and c.participant_a = v_a
      and c.participant_b = v_b;

    if v_cid is null then
        raise exception 'staff dm row missing';
    end if;

    insert into public.conversation_members (conversation_id, user_id)
    values (v_cid, v_me)
    on conflict (conversation_id, user_id) do nothing;
    insert into public.conversation_members (conversation_id, user_id)
    values (v_cid, p_other_user_id)
    on conflict (conversation_id, user_id) do nothing;

    if v_ins > 0 then
        insert into public.audit_logs (
            tenant_id,
            actor_user_id,
            action,
            target_user_id,
            metadata
        )
        values (
            null,
            v_me,
            'staff_internal_dm_started',
            p_other_user_id,
            jsonb_build_object('conversation_id', v_cid)
        );
    end if;

    return v_cid;
end;
$$;

grant execute on function public.get_or_create_staff_dm(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS helpers: include staff_dm
-- ---------------------------------------------------------------------------

create or replace function public.messaging_conversation_visible_to_me(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.conversations conv
        where conv.id = p_conversation_id
          and (
              (
                  exists (
                      select 1
                      from public.conversation_members m
                      where m.conversation_id = conv.id
                        and m.user_id = auth.uid()
                  )
                  and (
                      conv.type = 'hq_client'
                      or (
                          conv.tenant_id is not null
                          and conv.tenant_id = public.get_my_tenant_id()
                      )
                  )
              )
              or (
                  conv.type = 'hq_client'
                  and public.is_chaster_staff()
              )
              or (
                  conv.type = 'hq_client'
                  and public.is_super_admin_of_tenant(conv.target_tenant_id)
              )
              or (
                  conv.type = 'staff_dm'
                  and public.is_chaster_staff()
                  and exists (
                      select 1
                      from public.conversation_members m2
                      where m2.conversation_id = conv.id
                        and m2.user_id = auth.uid()
                  )
              )
          )
    );
$$;

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
    for insert to authenticated
    with check (
        sender_id = auth.uid()
        and length(trim(body)) > 0
        and public.messaging_is_member_of_conversation(conversation_id)
        and exists (
            select 1
            from public.conversations c
            where c.id = messages.conversation_id
              and (
                  (
                      c.type = 'hq_client'
                      or (
                          c.tenant_id is not null
                          and c.tenant_id = public.get_my_tenant_id()
                      )
                      or (
                          c.type = 'staff_dm'
                          and public.is_chaster_staff()
                      )
                  )
                  and (
                      (c.type <> 'hq_client' and c.type <> 'staff_dm')
                      or public.is_chaster_staff()
                      or public.is_super_admin_of_tenant(c.target_tenant_id)
                  )
              )
        )
    );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
    for update to authenticated
    using (
        public.messaging_is_member_of_conversation(conversation_id)
        and (
            sender_id = auth.uid()
            or (
                exists (
                    select 1
                    from public.conversations c
                    where c.id = messages.conversation_id
                      and c.type in ('team_dm', 'team_group')
                      and c.tenant_id = public.get_my_tenant_id()
                )
                and public.has_tenant_role(array['admin', 'super_admin']::text[])
            )
            or (
                exists (
                    select 1
                    from public.conversations c
                    where c.id = messages.conversation_id
                      and c.type = 'hq_client'
                )
                and public.is_chaster_staff()
            )
            or (
                exists (
                    select 1
                    from public.conversations c
                    where c.id = messages.conversation_id
                      and c.type = 'staff_dm'
                )
                and public.is_chaster_staff()
            )
        )
    )
    with check (
        public.messaging_is_member_of_conversation(conversation_id)
    );
