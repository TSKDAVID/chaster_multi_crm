import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { useCurrentUserRole } from "@/components/atomic-crm/access/useCurrentUserRole";

async function fetchPortalUnread(): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc(
    "support_portal_unread_case_count",
  );
  if (error) throw error;
  return Number(data ?? 0);
}

async function fetchStaffUnread(): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc(
    "support_staff_unread_case_count",
  );
  if (error) throw error;
  return Number(data ?? 0);
}

/** Unread support case count for the portal (messages from Chaster staff). */
export function useSupportPortalUnreadTotal(enabled: boolean) {
  const qc = useQueryClient();
  const { tenantId } = useCurrentUserRole();
  const portalChannelNameRef = useRef(
    `support-portal-unread-refresh-${Math.random().toString(36).slice(2)}`,
  );

  const q = useQuery({
    queryKey: ["support-portal-unread-total", tenantId],
    queryFn: fetchPortalUnread,
    enabled,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(portalChannelNameRef.current)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_case_messages" },
        () => {
          void qc.invalidateQueries({ queryKey: ["support-portal-unread-total"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_cases" },
        () => {
          void qc.invalidateQueries({ queryKey: ["support-portal-unread-total"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, qc]);

  return q;
}

/** Unread case count for HQ (last message from client, after staff read cursor). */
export function useSupportStaffUnreadTotal(enabled: boolean) {
  const qc = useQueryClient();
  const staffChannelNameRef = useRef(
    `support-staff-unread-refresh-${Math.random().toString(36).slice(2)}`,
  );

  const q = useQuery({
    queryKey: ["support-staff-unread-total"],
    queryFn: fetchStaffUnread,
    enabled,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(staffChannelNameRef.current)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_case_messages" },
        () => {
          void qc.invalidateQueries({ queryKey: ["support-staff-unread-total"] });
          void qc.invalidateQueries({ queryKey: ["hq-support-cases"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "support_case_staff_read_state" },
        () => {
          void qc.invalidateQueries({ queryKey: ["support-staff-unread-total"] });
          void qc.invalidateQueries({ queryKey: ["hq-support-cases"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, qc]);

  return q;
}
