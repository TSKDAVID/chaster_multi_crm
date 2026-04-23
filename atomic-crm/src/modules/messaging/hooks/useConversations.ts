import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslate } from "ra-core";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export type ConversationRow = {
  id: string;
  tenant_id: string | null;
  type: string;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  target_tenant_id: string | null;
  participant_a: string | null;
  participant_b: string | null;
  name: string | null;
  last_read_at: string | null;
};

async function fetchUnreadMap(): Promise<Record<string, number>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("messaging_unread_counts");
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of (data ?? []) as {
    conversation_id: string;
    unread_count: number;
  }[]) {
    map[row.conversation_id] = Number(row.unread_count ?? 0);
  }
  return map;
}

function useConversationUnreadMap(enabled: boolean) {
  return useQuery({
    queryKey: ["messaging-unread-map"],
    queryFn: fetchUnreadMap,
    enabled,
    staleTime: 10_000,
  });
}

export function useTeamConversations(tenantId: string | null, myUserId: string) {
  const qc = useQueryClient();
  const unreadQ = useConversationUnreadMap(!!tenantId && !!myUserId);

  const convQ = useQuery({
    queryKey: ["messaging-team-conversations", tenantId, myUserId],
    enabled: !!tenantId && !!myUserId,
    queryFn: async (): Promise<ConversationRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `
          id,
          tenant_id,
          type,
          created_at,
          last_message_at,
          last_message_preview,
          last_message_sender_id,
          target_tenant_id,
          participant_a,
          participant_b,
          name,
          conversation_members!inner(last_read_at, user_id)
        `,
        )
        .eq("tenant_id", tenantId!)
        .in("type", ["team_dm", "team_group"])
        .eq("conversation_members.user_id", myUserId)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return rows.map((r) => {
        const cm = r.conversation_members as { last_read_at: string | null }[];
        const inner = Array.isArray(cm) ? cm[0] : cm;
        const { conversation_members: _, ...rest } = r;
        return {
          ...(rest as Omit<ConversationRow, "last_read_at">),
          last_read_at: inner?.last_read_at ?? null,
        };
      });
    },
  });

  useEffect(() => {
    if (!tenantId) return;
    const supabase = getSupabaseClient();
    const ch = supabase
      .channel(`team-conv-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          void qc.invalidateQueries({
            queryKey: ["messaging-team-conversations", tenantId, myUserId],
          });
          void qc.invalidateQueries({ queryKey: ["messaging-unread-map"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [tenantId, myUserId, qc]);

  const withUnread = useMemo(() => {
    const byIdUnread = unreadQ.data ?? {};
    return (convQ.data ?? []).map((c) => ({
      ...c,
      unreadCount: byIdUnread[c.id] ?? 0,
    }));
  }, [convQ.data, unreadQ.data]);

  return {
    conversations: withUnread,
    isLoading: convQ.isPending || unreadQ.isPending,
    refetch: () => {
      void convQ.refetch();
      void unreadQ.refetch();
    },
  };
}

export function useClientHqConversation(tenantId: string | null, myUserId: string) {
  const qc = useQueryClient();
  const unreadQ = useConversationUnreadMap(!!tenantId && !!myUserId);

  const convQ = useQuery({
    queryKey: ["messaging-client-hq", tenantId, myUserId],
    enabled: !!tenantId && !!myUserId,
    queryFn: async (): Promise<ConversationRow | null> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `
          id,
          tenant_id,
          type,
          created_at,
          last_message_at,
          last_message_preview,
          last_message_sender_id,
          target_tenant_id,
          participant_a,
          participant_b,
          name,
          conversation_members!inner(last_read_at, user_id)
        `,
        )
        .eq("type", "hq_client")
        .eq("target_tenant_id", tenantId!)
        .eq("conversation_members.user_id", myUserId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const r = data as Record<string, unknown>;
      const cm = r.conversation_members as { last_read_at: string | null }[];
      const inner = Array.isArray(cm) ? cm[0] : cm;
      const { conversation_members: _, ...rest } = r;
      return {
        ...(rest as Omit<ConversationRow, "last_read_at">),
        last_read_at: inner?.last_read_at ?? null,
      };
    },
  });

  useEffect(() => {
    if (!tenantId) return;
    const supabase = getSupabaseClient();
    const ch = supabase
      .channel(`hq-client-conv-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `target_tenant_id=eq.${tenantId}`,
        },
        () => {
          void qc.invalidateQueries({
            queryKey: ["messaging-client-hq", tenantId, myUserId],
          });
          void qc.invalidateQueries({ queryKey: ["messaging-unread-map"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [tenantId, myUserId, qc]);

  const c = convQ.data;
  const unreadCount = c ? (unreadQ.data?.[c.id] ?? 0) : 0;

  return {
    conversation: c,
    unreadCount,
    isLoading: convQ.isPending || unreadQ.isPending,
    refetch: () => {
      void convQ.refetch();
      void unreadQ.refetch();
    },
  };
}

export function useHqClientConversations(myUserId: string) {
  const qc = useQueryClient();
  const unreadQ = useConversationUnreadMap(!!myUserId);

  const convQ = useQuery({
    queryKey: ["messaging-hq-client-conversations", myUserId],
    enabled: !!myUserId,
    queryFn: async (): Promise<ConversationRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `
          id,
          tenant_id,
          type,
          created_at,
          last_message_at,
          last_message_preview,
          last_message_sender_id,
          target_tenant_id,
          participant_a,
          participant_b,
          name,
          conversation_members!inner(last_read_at, user_id)
        `,
        )
        .eq("type", "hq_client")
        .eq("conversation_members.user_id", myUserId)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return rows.map((r) => {
        const cm = r.conversation_members as { last_read_at: string | null }[];
        const inner = Array.isArray(cm) ? cm[0] : cm;
        const { conversation_members: _, ...rest } = r;
        return {
          ...(rest as Omit<ConversationRow, "last_read_at">),
          last_read_at: inner?.last_read_at ?? null,
        };
      });
    },
  });

  const tenantIds = useMemo(
    () =>
      [...new Set((convQ.data ?? []).map((c) => c.target_tenant_id).filter(Boolean))] as string[],
    [convQ.data],
  );

  const namesQ = useQuery({
    queryKey: ["messaging-hq-tenant-names", tenantIds],
    enabled: tenantIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("tenants")
        .select("id, company_name, owner_user_id")
        .in("id", tenantIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const t of data ?? []) {
        const row = t as { id: string; company_name: string };
        map[row.id] = row.company_name;
      }
      return map;
    },
  });

  const ownerQ = useQuery({
    queryKey: ["messaging-hq-owner-sales", tenantIds],
    enabled: tenantIds.length > 0,
    queryFn: async (): Promise<Record<string, { name: string; email: string }>> => {
      const supabase = getSupabaseClient();
      const { data: tenants, error: e1 } = await supabase
        .from("tenants")
        .select("id, owner_user_id")
        .in("id", tenantIds);
      if (e1) throw e1;
      const ownerByTenant: Record<string, string | null> = {};
      const ownerIds: string[] = [];
      for (const t of tenants ?? []) {
        const row = t as { id: string; owner_user_id: string | null };
        ownerByTenant[row.id] = row.owner_user_id;
        if (row.owner_user_id) ownerIds.push(row.owner_user_id);
      }
      if (ownerIds.length === 0) return {};
      const { data: sales, error: e2 } = await supabase
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", [...new Set(ownerIds)]);
      if (e2) throw e2;
      const byUser: Record<string, { name: string; email: string }> = {};
      for (const s of sales ?? []) {
        const row = s as {
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string;
        };
        const name = [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email;
        byUser[row.user_id] = { name, email: row.email };
      }
      const out: Record<string, { name: string; email: string }> = {};
      for (const tid of tenantIds) {
        const ou = ownerByTenant[tid];
        if (ou && byUser[ou]) out[tid] = byUser[ou];
      }
      return out;
    },
  });

  useEffect(() => {
    const supabase = getSupabaseClient();
    const ch = supabase
      .channel("hq-staff-conversations")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => {
          void qc.invalidateQueries({
            queryKey: ["messaging-hq-client-conversations", myUserId],
          });
          void qc.invalidateQueries({ queryKey: ["messaging-unread-map"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [myUserId, qc]);

  const withMeta = useMemo(() => {
    const byIdUnread = unreadQ.data ?? {};
    const companyNames = namesQ.data ?? {};
    const ownerLabels = ownerQ.data ?? {};
    return (convQ.data ?? []).map((c) => ({
      ...c,
      unreadCount: byIdUnread[c.id] ?? 0,
      companyName: c.target_tenant_id ? companyNames[c.target_tenant_id] ?? "—" : "—",
      ownerLabel: c.target_tenant_id ? ownerLabels[c.target_tenant_id] ?? null : null,
    }));
  }, [convQ.data, unreadQ.data, namesQ.data, ownerQ.data]);

  return {
    conversations: withMeta,
    isLoading:
      convQ.isPending || unreadQ.isPending || namesQ.isPending || ownerQ.isPending,
    refetch: () => {
      void convQ.refetch();
      void unreadQ.refetch();
      void namesQ.refetch();
      void ownerQ.refetch();
    },
  };
}

export type HqStaffDmConversationRow = ConversationRow & {
  peerUserId: string;
  peerDisplayName: string;
  unreadCount: number;
};

export function useHqStaffDmConversations(myUserId: string) {
  const translate = useTranslate();
  const qc = useQueryClient();
  const unreadQ = useConversationUnreadMap(!!myUserId);

  const convQ = useQuery({
    queryKey: ["messaging-hq-staff-dm", myUserId],
    enabled: !!myUserId,
    queryFn: async (): Promise<ConversationRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("conversations")
        .select(
          `
          id,
          tenant_id,
          type,
          created_at,
          last_message_at,
          last_message_preview,
          last_message_sender_id,
          target_tenant_id,
          participant_a,
          participant_b,
          name,
          conversation_members!inner(last_read_at, user_id)
        `,
        )
        .eq("type", "staff_dm")
        .eq("conversation_members.user_id", myUserId)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const rows = (data ?? []) as Record<string, unknown>[];
      return rows.map((r) => {
        const cm = r.conversation_members as { last_read_at: string | null }[];
        const inner = Array.isArray(cm) ? cm[0] : cm;
        const { conversation_members: _, ...rest } = r;
        return {
          ...(rest as Omit<ConversationRow, "last_read_at">),
          last_read_at: inner?.last_read_at ?? null,
        };
      });
    },
  });

  const peerIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of convQ.data ?? []) {
      const a = c.participant_a;
      const b = c.participant_b;
      if (!a || !b) continue;
      set.add(a === myUserId ? b : a);
    }
    return [...set];
  }, [convQ.data, myUserId]);

  const namesQ = useQuery({
    queryKey: ["messaging-hq-staff-peer-names", peerIds],
    enabled: peerIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", peerIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        const r = row as {
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string;
        };
        map[r.user_id] = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email;
      }
      return map;
    },
  });

  useEffect(() => {
    const supabase = getSupabaseClient();
    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: ["messaging-hq-staff-dm", myUserId] });
      void qc.invalidateQueries({ queryKey: ["messaging-unread-map"] });
    };
    const ch = supabase
      .channel("hq-internal-staff-dm")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations" },
        invalidate,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [myUserId, qc]);

  const withMeta = useMemo((): HqStaffDmConversationRow[] => {
    const byIdUnread = unreadQ.data ?? {};
    const names = namesQ.data ?? {};
    const fallback = translate("chaster.messages.direct_peer_fallback");
    return (convQ.data ?? []).map((c) => {
      const peer =
        c.participant_a === myUserId
          ? (c.participant_b ?? "")
          : (c.participant_a ?? "");
      return {
        ...c,
        peerUserId: peer,
        peerDisplayName: peer ? (names[peer] ?? fallback) : fallback,
        unreadCount: byIdUnread[c.id] ?? 0,
      };
    });
  }, [convQ.data, unreadQ.data, namesQ.data, myUserId, translate]);

  return {
    conversations: withMeta,
    isLoading: convQ.isPending || unreadQ.isPending || namesQ.isPending,
    refetch: () => {
      void convQ.refetch();
      void unreadQ.refetch();
      void namesQ.refetch();
    },
  };
}
