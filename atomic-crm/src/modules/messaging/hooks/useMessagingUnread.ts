import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { useCurrentUserRole } from "@/components/atomic-crm/access/useCurrentUserRole";

async function fetchUnreadSum(): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("messaging_unread_counts");
  if (error) throw error;
  const rows = (data ?? []) as { conversation_id: string; unread_count: number }[];
  return rows.reduce((acc, r) => acc + Number(r.unread_count ?? 0), 0);
}

/**
 * Total unread across conversations the current user is a member of (excludes own messages).
 * Invalidates on Realtime message / conversation updates.
 */
export function useMessagingUnreadTotal(enabled: boolean) {
  const qc = useQueryClient();
  const { tenantId, isOwnerSide } = useCurrentUserRole();
  const channelNameRef = useRef(
    `messaging-unread-refresh-${Math.random().toString(36).slice(2)}`,
  );

  const q = useQuery({
    queryKey: ["messaging-unread-total", tenantId, isOwnerSide],
    queryFn: fetchUnreadSum,
    enabled: enabled,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => {
          void qc.invalidateQueries({ queryKey: ["messaging-unread-total"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        () => {
          void qc.invalidateQueries({ queryKey: ["messaging-unread-total"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, qc]);

  return q;
}
