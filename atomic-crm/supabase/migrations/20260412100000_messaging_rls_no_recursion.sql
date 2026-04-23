-- Fix infinite RLS recursion on conversation_members: policies must not query
-- conversation_members (or conversations that query it) from within their own checks.
-- Use SECURITY DEFINER helpers so membership/visibility reads bypass RLS.

-- ---------------------------------------------------------------------------
-- Helpers (bypass RLS as definer)
-- ---------------------------------------------------------------------------

create or replace function public.messaging_is_member_of_conversation(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1
        from public.conversation_members cm
        where cm.conversation_id = p_conversation_id
          and cm.user_id = auth.uid()
    );
$$;

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
          )
    );
$$;

comment on function public.messaging_is_member_of_conversation(uuid) is
    'RLS helper: membership check without triggering conversation_members policies.';

comment on function public.messaging_conversation_visible_to_me(uuid) is
    'RLS helper: full conversation SELECT visibility without policy recursion.';

grant execute on function public.messaging_is_member_of_conversation(uuid) to authenticated;
grant execute on function public.messaging_conversation_visible_to_me(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Drop and recreate policies
-- ---------------------------------------------------------------------------

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
    for select to authenticated
    using (public.messaging_conversation_visible_to_me(id));

drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
    for select to authenticated
    using (public.messaging_conversation_visible_to_me(conversation_id));

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
    for select to authenticated
    using (public.messaging_conversation_visible_to_me(conversation_id));

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
                  )
                  and (
                      c.type <> 'hq_client'
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
        )
    )
    with check (
        public.messaging_is_member_of_conversation(conversation_id)
    );
