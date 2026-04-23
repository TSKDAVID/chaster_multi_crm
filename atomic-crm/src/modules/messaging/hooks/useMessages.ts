import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  reply_to_id: string | null;
  _local?: "sending" | "failed";
};

const PAGE = 50;

export function useMessages(conversationId: string | null) {
  const qc = useQueryClient();
  const [olderLoading, setOlderLoading] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const seenIds = useRef<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["messaging-messages", conversationId],
    enabled: !!conversationId,
    queryFn: async (): Promise<MessageRow[]> => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, reply_to_id",
        )
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (error) throw error;
      const rows = (data ?? []) as MessageRow[];
      rows.reverse();
      seenIds.current = new Set(rows.map((m) => m.id));
      setHasMoreOlder(rows.length >= PAGE);
      return rows;
    },
  });

  const loadOlder = useCallback(async () => {
    if (!conversationId || !q.data?.length || olderLoading || !hasMoreOlder) return;
    const oldest = q.data[0];
    if (!oldest) return;
    setOlderLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, reply_to_id",
        )
        .eq("conversation_id", conversationId)
        .lt("created_at", oldest.created_at)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (error) throw error;
      const batch = ((data ?? []) as MessageRow[]).reverse();
      if (batch.length < PAGE) setHasMoreOlder(false);
      for (const m of batch) seenIds.current.add(m.id);
      qc.setQueryData<MessageRow[]>(["messaging-messages", conversationId], (prev) => {
        if (!prev) return batch;
        const merged = [...batch, ...prev];
        const dedup = new Map<string, MessageRow>();
        for (const m of merged) dedup.set(m.id, m);
        return [...dedup.values()].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      });
    } finally {
      setOlderLoading(false);
    }
  }, [conversationId, q.data, olderLoading, hasMoreOlder, qc]);

  useEffect(() => {
    if (!conversationId) return;
    const supabase = getSupabaseClient();
    const ch = supabase
      .channel(`messages-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          if (seenIds.current.has(row.id)) return;
          seenIds.current.add(row.id);
          qc.setQueryData<MessageRow[]>(["messaging-messages", conversationId], (prev) => {
            if (!prev) return [row];
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          qc.setQueryData<MessageRow[]>(["messaging-messages", conversationId], (prev) => {
            if (!prev) return prev;
            return prev.map((m) => (m.id === row.id ? { ...m, ...row } : m));
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [conversationId, qc]);

  const prependOptimistic = useCallback(
    (msg: MessageRow) => {
      if (!conversationId) return;
      seenIds.current.add(msg.id);
      qc.setQueryData<MessageRow[]>(["messaging-messages", conversationId], (prev) => {
        if (!prev) return [msg];
        return [...prev, msg];
      });
    },
    [conversationId, qc],
  );

  const replaceOptimisticId = useCallback(
    (tempId: string, real: MessageRow) => {
      if (!conversationId) return;
      seenIds.current.delete(tempId);
      seenIds.current.add(real.id);
      const cleaned = { ...real, _local: undefined };
      qc.setQueryData<MessageRow[]>(["messaging-messages", conversationId], (prev) => {
        if (!prev) return [cleaned];
        return prev.map((m) => (m.id === tempId ? cleaned : m));
      });
    },
    [conversationId, qc],
  );

  const markFailed = useCallback(
    (tempId: string) => {
      if (!conversationId) return;
      qc.setQueryData<MessageRow[]>(["messaging-messages", conversationId], (prev) => {
        if (!prev) return prev;
        return prev.map((m) =>
          m.id === tempId ? { ...m, _local: "failed" as const } : m,
        ) as MessageRow[];
      });
    },
    [conversationId, qc],
  );

  const markSending = useCallback(
    (tempId: string) => {
      if (!conversationId) return;
      qc.setQueryData<MessageRow[]>(["messaging-messages", conversationId], (prev) => {
        if (!prev) return prev;
        return prev.map((m) =>
          m.id === tempId ? { ...m, _local: "sending" as const } : m,
        ) as MessageRow[];
      });
    },
    [conversationId, qc],
  );

  return {
    messages: q.data ?? [],
    isLoading: q.isPending,
    loadOlder,
    olderLoading,
    hasMoreOlder,
    refetch: q.refetch,
    prependOptimistic,
    replaceOptimisticId,
    markFailed,
    markSending,
  };
}
