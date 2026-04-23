import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export type PresenceInfo = { online: boolean; last_seen: string | null };

/**
 * Tenant-scoped presence on `presence:tenant_{tenantId}`.
 * Returns a map of userId → { online, last_seen } (best-effort; offline uses last seen from sync state).
 */
export function usePresence(tenantId: string | null, myUserId: string, myDisplayName: string) {
  const [map, setMap] = useState<Map<string, PresenceInfo>>(new Map());

  useEffect(() => {
    if (!tenantId) return;
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`presence:tenant_${tenantId}`, {
      config: { presence: { key: myUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<
          string,
          Array<{ user_id?: string; display_name?: string; last_seen?: string }>
        >;
        const next = new Map<string, PresenceInfo>();
        for (const [, payloads] of Object.entries(state)) {
          for (const p of payloads) {
            const uid = p.user_id;
            if (!uid) continue;
            next.set(uid, { online: true, last_seen: p.last_seen ?? new Date().toISOString() });
          }
        }
        setMap(next);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: myUserId,
            display_name: myDisplayName,
            last_seen: new Date().toISOString(),
          });
        }
      });

    const tick = setInterval(() => {
      void channel.track({
        user_id: myUserId,
        display_name: myDisplayName,
        last_seen: new Date().toISOString(),
      });
    }, 60_000);

    return () => {
      clearInterval(tick);
      void supabase.removeChannel(channel);
    };
  }, [tenantId, myUserId, myDisplayName]);

  return map;
}
