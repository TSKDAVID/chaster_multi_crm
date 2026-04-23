import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "../providers/supabase/supabase";

export function useTenantWorkspaceCounts(tenantId: string | null) {
  const { data: teamCount = 0 } = useQuery({
    queryKey: ["portal-stat-team", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { count, error } = await getSupabaseClient()
        .from("tenant_members")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: kbCount = 0 } = useQuery({
    queryKey: ["portal-stat-kb", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { count, error } = await getSupabaseClient()
        .from("knowledge_base_documents")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  return { teamCount, kbCount };
}
