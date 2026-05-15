import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export type CasePresencePeer = {
  user_id: string;
  display_name: string;
  is_staff: boolean;
};

/**
 * Case-scoped presence on `presence:support_case:{caseId}`.
 */
export function useCasePresence(
  caseId: string | null,
  myUserId: string,
  myDisplayName: string,
  isStaff: boolean,
) {
  const [peers, setPeers] = useState<CasePresencePeer[]>([]);

  useEffect(() => {
    if (!caseId || !myUserId) return;
    const supabase = getSupabaseClient();
    const channel = supabase.channel(`presence:support_case:${caseId}`, {
      config: { presence: { key: myUserId } },
    });

    const sync = () => {
      const state = channel.presenceState() as Record<
        string,
        Array<{ user_id?: string; display_name?: string; is_staff?: boolean }>
      >;
      const seen = new Set<string>();
      const next: CasePresencePeer[] = [];
      for (const payloads of Object.values(state)) {
        for (const p of payloads) {
          const uid = p.user_id;
          if (!uid || uid === myUserId || seen.has(uid)) continue;
          seen.add(uid);
          next.push({
            user_id: uid,
            display_name: p.display_name?.trim() || "Someone",
            is_staff: Boolean(p.is_staff),
          });
        }
      }
      setPeers(next);
    };

    channel.on("presence", { event: "sync" }, sync).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          user_id: myUserId,
          display_name: myDisplayName,
          is_staff: isStaff,
        });
        sync();
      }
    });

    const tick = setInterval(() => {
      void channel.track({
        user_id: myUserId,
        display_name: myDisplayName,
        is_staff: isStaff,
      });
    }, 60_000);

    return () => {
      clearInterval(tick);
      void supabase.removeChannel(channel);
    };
  }, [caseId, myUserId, myDisplayName, isStaff]);

  return useMemo(() => peers, [peers]);
}
