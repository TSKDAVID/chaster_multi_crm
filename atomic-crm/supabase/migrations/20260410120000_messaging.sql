-- Chaster messaging: team DMs / groups / HQ↔client threads, RLS, RPCs, list trigger, realtime.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.conversations (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references public.tenants (id) on delete cascade,
    type text not null check (type in ('team_dm', 'team_group', 'hq_client')),
    created_at timestamptz not null default now(),
    created_by uuid references auth.users (id),
    participant_a uuid references auth.users (id),
    participant_b uuid references auth.users (id),
    name text,
    target_tenant_id uuid references public.tenants (id) on delete cascade,
    last_message_at timestamptz,
    last_message_preview text,
    last_message_sender_id uuid references auth.users (id),
    constraint conversations_hq_has_target check (
        type <> 'hq_client' or target_tenant_id is not null
    ),
    constraint conversations_non_hq_has_tenant check (
        type = 'hq_client' or tenant_id is not null
    ),
    constraint conversations_team_dm_participants check (
        type <> 'team_dm'
        or (
            participant_a is not null
            and participant_b is not null
            and participant_a < participant_b
        )
    )
);

create unique index conversations_team_dm_participants_uniq
    on public.conversations (tenant_id, participant_a, participant_b)
    where type = 'team_dm';

create unique index conversations_hq_client_target_uniq
    on public.conversations (target_tenant_id)
    where type = 'hq_client';

create index conversations_tenant_id_idx on public.conversations (tenant_id);
create index conversations_target_tenant_id_idx on public.conversations (target_tenant_id);

create table public.conversation_members (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    joined_at timestamptz not null default now(),
    last_read_at timestamptz,
    unique (conversation_id, user_id)
);

create index conversation_members_user_id_idx on public.conversation_members (user_id);
create index conversation_members_conversation_id_idx on public.conversation_members (conversation_id);

create table public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations (id) on delete cascade,
    sender_id uuid references auth.users (id),
    body text not null,
    created_at timestamptz not null default now(),
    edited_at timestamptz,
    is_deleted boolean not null default false,
    reply_to_id uuid references public.messages (id) on delete set null
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);

create or replace function public.messaging_messages_preserve_sender()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.sender_id is distinct from old.sender_id then
        new.sender_id := old.sender_id;
    end if;
    return new;
end;
$$;

create trigger messaging_messages_before_update
    before update on public.messages
    for each row
    execute function public.messaging_messages_preserve_sender();

-- ---------------------------------------------------------------------------
-- Trigger: keep conversation list fields in sync (INSERT only for v1)
-- ---------------------------------------------------------------------------

create or replace function public.messaging_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.conversations
    set
        last_message_at = new.created_at,
        last_message_preview = case
            when new.is_deleted then 'This message was deleted.'
            else left(trim(regexp_replace(new.body, '\s+', ' ', 'g')), 80)
        end,
        last_message_sender_id = new.sender_id
    where id = new.conversation_id;
    return new;
end;
$$;

create trigger messaging_messages_after_insert
    after insert on public.messages
    for each row
    execute function public.messaging_on_new_message();

-- ---------------------------------------------------------------------------
-- RPC: unread counts (member's conversations only; excludes own messages)
-- ---------------------------------------------------------------------------

create or replace function public.messaging_unread_counts()
returns table (conversation_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
    select
        cm.conversation_id,
        count(m.id)::bigint
    from public.conversation_members cm
    join public.messages m on m.conversation_id = cm.conversation_id
    where cm.user_id = auth.uid()
      and m.created_at > coalesce(cm.last_read_at, 'epoch'::timestamptz)
      and m.sender_id is distinct from auth.uid()
      and not m.is_deleted
    group by cm.conversation_id;
$$;

-- ---------------------------------------------------------------------------
-- RPC: get_or_create team DM (atomic via partial unique + ON CONFLICT)
-- ---------------------------------------------------------------------------

create or replace function public.get_or_create_dm(p_other_user_id uuid, p_tenant_id uuid)
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
    if p_other_user_id is null or p_tenant_id is null then
        raise exception 'invalid arguments';
    end if;
    if v_me = p_other_user_id then
        raise exception 'cannot dm yourself';
    end if;

    if not exists (
        select 1
        from public.tenant_members tm1
        inner join public.tenant_members tm2
            on tm1.tenant_id = tm2.tenant_id
        where tm1.user_id = v_me
          and tm2.user_id = p_other_user_id
          and tm1.tenant_id = p_tenant_id
    ) then
        raise exception 'forbidden';
    end if;

    if v_me < p_other_user_id then
        v_a := v_me;
        v_b := p_other_user_id;
    else
        v_a := p_other_user_id;
        v_b := v_me;
    end if;

    insert into public.conversations (tenant_id, type, created_by, participant_a, participant_b)
    values (p_tenant_id, 'team_dm', v_me, v_a, v_b)
    on conflict (tenant_id, participant_a, participant_b) where (type = 'team_dm')
    do nothing;

    get diagnostics v_ins = row_count;

    select c.id
    into v_cid
    from public.conversations c
    where c.tenant_id = p_tenant_id
      and c.type = 'team_dm'
      and c.participant_a = v_a
      and c.participant_b = v_b;

    if v_cid is null then
        raise exception 'dm row missing';
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
            p_tenant_id,
            v_me,
            'team_dm_started',
            p_other_user_id,
            jsonb_build_object('conversation_id', v_cid)
        );
    end if;

    return v_cid;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: HQ ↔ client thread (one row per target tenant; all staff are members)
-- ---------------------------------------------------------------------------

create or replace function public.get_or_create_hq_client_dm(p_target_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_me uuid := auth.uid();
    v_owner uuid;
    v_cid uuid;
    v_ins int;
begin
    if v_me is null then
        raise exception 'not authenticated';
    end if;
    if p_target_tenant_id is null then
        raise exception 'invalid arguments';
    end if;
    if not public.is_chaster_staff() then
        raise exception 'forbidden';
    end if;

    select t.owner_user_id
    into v_owner
    from public.tenants t
    where t.id = p_target_tenant_id;

    if v_owner is null then
        select tm.user_id
        into v_owner
        from public.tenant_members tm
        where tm.tenant_id = p_target_tenant_id
          and tm.role = 'super_admin'
        order by tm.joined_at
        limit 1;
    end if;

    if v_owner is null then
        raise exception 'no company owner for tenant';
    end if;

    insert into public.conversations (tenant_id, type, created_by, target_tenant_id)
    values (null, 'hq_client', v_me, p_target_tenant_id)
    on conflict (target_tenant_id) where (type = 'hq_client')
    do nothing;

    get diagnostics v_ins = row_count;

    select c.id
    into v_cid
    from public.conversations c
    where c.type = 'hq_client'
      and c.target_tenant_id = p_target_tenant_id;

    if v_cid is null then
        raise exception 'hq conversation missing';
    end if;

    insert into public.conversation_members (conversation_id, user_id)
    values (v_cid, v_me)
    on conflict (conversation_id, user_id) do nothing;

    insert into public.conversation_members (conversation_id, user_id)
    values (v_cid, v_owner)
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
            p_target_tenant_id,
            v_me,
            'hq_client_conversation_started',
            v_owner,
            jsonb_build_object('conversation_id', v_cid)
        );
    end if;

    return v_cid;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: mark read (RLS on conversation_members)
-- ---------------------------------------------------------------------------

create or replace function public.update_last_read(p_conversation_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
    update public.conversation_members
    set last_read_at = now()
    where conversation_id = p_conversation_id
      and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS helper: super admin of a specific tenant (not get_my_tenant_id)
-- ---------------------------------------------------------------------------

create or replace function public.is_super_admin_of_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.tenant_members tm
        where tm.tenant_id = p_tenant_id
          and tm.user_id = auth.uid()
          and tm.role = 'super_admin'
    );
$$;

-- ---------------------------------------------------------------------------
-- RLS: conversations
-- ---------------------------------------------------------------------------

alter table public.conversations enable row level security;

create policy conversations_select on public.conversations
    for select to authenticated
    using (
        (
            exists (
                select 1
                from public.conversation_members cm
                where cm.conversation_id = conversations.id
                  and cm.user_id = auth.uid()
            )
            and (
                conversations.type = 'hq_client'
                or (
                    conversations.tenant_id is not null
                    and conversations.tenant_id = public.get_my_tenant_id()
                )
            )
        )
        or (
            conversations.type = 'hq_client'
            and public.is_chaster_staff()
        )
        or (
            conversations.type = 'hq_client'
            and public.is_super_admin_of_tenant(conversations.target_tenant_id)
        )
    );

-- ---------------------------------------------------------------------------
-- RLS: conversation_members
-- ---------------------------------------------------------------------------

alter table public.conversation_members enable row level security;

create policy conversation_members_select on public.conversation_members
    for select to authenticated
    using (
        exists (
            select 1
            from public.conversations c
            where c.id = conversation_members.conversation_id
              and (
                  (
                      exists (
                          select 1
                          from public.conversation_members cm2
                          where cm2.conversation_id = c.id
                            and cm2.user_id = auth.uid()
                      )
                      and (
                          c.type = 'hq_client'
                          or (
                              c.tenant_id is not null
                              and c.tenant_id = public.get_my_tenant_id()
                          )
                      )
                  )
                  or (
                      c.type = 'hq_client'
                      and public.is_chaster_staff()
                  )
                  or (
                      c.type = 'hq_client'
                      and public.is_super_admin_of_tenant(c.target_tenant_id)
                  )
              )
        )
    );

create policy conversation_members_update_own on public.conversation_members
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RLS: messages
-- ---------------------------------------------------------------------------

alter table public.messages enable row level security;

create policy messages_select on public.messages
    for select to authenticated
    using (
        exists (
            select 1
            from public.conversations c
            where c.id = messages.conversation_id
              and (
                  (
                      exists (
                          select 1
                          from public.conversation_members cm
                          where cm.conversation_id = c.id
                            and cm.user_id = auth.uid()
                      )
                      and (
                          c.type = 'hq_client'
                          or (
                              c.tenant_id is not null
                              and c.tenant_id = public.get_my_tenant_id()
                          )
                      )
                  )
                  or (
                      c.type = 'hq_client'
                      and public.is_chaster_staff()
                  )
                  or (
                      c.type = 'hq_client'
                      and public.is_super_admin_of_tenant(c.target_tenant_id)
                  )
              )
        )
    );

create policy messages_insert on public.messages
    for insert to authenticated
    with check (
        sender_id = auth.uid()
        and length(trim(body)) > 0
        and exists (
            select 1
            from public.conversation_members cm
            where cm.conversation_id = messages.conversation_id
              and cm.user_id = auth.uid()
        )
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
                  )
                  and (
                      c.type <> 'hq_client'
                      or public.is_chaster_staff()
                      or public.is_super_admin_of_tenant(c.target_tenant_id)
                  )
              )
        )
    );

create policy messages_update on public.messages
    for update to authenticated
    using (
        exists (
            select 1
            from public.conversation_members cm
            where cm.conversation_id = messages.conversation_id
              and cm.user_id = auth.uid()
        )
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
        )
    )
    with check (
        exists (
            select 1
            from public.conversation_members cm
            where cm.conversation_id = messages.conversation_id
              and cm.user_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select on table public.conversations to authenticated;
grant select, update on table public.conversation_members to authenticated;
grant select, insert, update on table public.messages to authenticated;

grant execute on function public.get_or_create_dm(uuid, uuid) to authenticated;
grant execute on function public.get_or_create_hq_client_dm(uuid) to authenticated;
grant execute on function public.update_last_read(uuid) to authenticated;
grant execute on function public.messaging_unread_counts() to authenticated;
grant execute on function public.is_super_admin_of_tenant(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (INSERT/UPDATE on messages; UPDATE on conversations for list)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
