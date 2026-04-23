import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export type TypingPeer = { user_id: string; display_name: string };

/**
 * Broadcast typing on channel `typing:{conversationId}` (Supabase Realtime Broadcast).
 */
export function useTypingIndicator(
  conversationId: string | null,
  myUserId: string,
  myDisplayName: string,
) {
  const [peers, setPeers] = useState<TypingPeer[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!conversationId) return;
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`typing:${conversationId}`);
    channelRef.current = channel;

    const peerTimers = new Map<string, ReturnType<typeof setTimeout>>();

    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      const p = payload as { user_id?: string; display_name?: string };
      if (!p.user_id || p.user_id === myUserId) return;
      const display_name = p.display_name ?? "Someone";
      setPeers((prev) => {
        const others = prev.filter((x) => x.user_id !== p.user_id);
        return [...others, { user_id: p.user_id!, display_name }];
      });
      const uid = p.user_id!;
      const old = peerTimers.get(uid);
      if (old) clearTimeout(old);
      const t = setTimeout(() => {
        setPeers((prev) => prev.filter((x) => x.user_id !== uid));
        peerTimers.delete(uid);
      }, 4000);
      peerTimers.set(uid, t);
    });

    void channel.subscribe();

    return () => {
      for (const t of peerTimers.values()) clearTimeout(t);
      peerTimers.clear();
      void supabase.removeChannel(channel);
      channelRef.current = null;
      setPeers([]);
    };
  }, [conversationId, myUserId]);

  const emitTyping = useCallback(() => {
    if (!conversationId || !channelRef.current) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
    }, 3000);
    void channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: myUserId, display_name: myDisplayName },
    });
  }, [conversationId, myUserId, myDisplayName]);

  return { typingPeers: peers, emitTyping };
}
