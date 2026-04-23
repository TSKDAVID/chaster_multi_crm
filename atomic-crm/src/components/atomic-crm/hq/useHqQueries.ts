import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "../providers/supabase/supabase";
import type { HqDashboardStats, HqTenantDirectoryRow } from "./hqTypes";

export function useHqDashboardStats(enabled: boolean) {
  return useQuery({
    queryKey: ["hq-dashboard-stats"],
    enabled,
    queryFn: async (): Promise<HqDashboardStats> => {
      const { data, error } = await getSupabaseClient().rpc(
        "hq_get_dashboard_stats",
      );
      if (error) throw error;
      const row = data as Record<string, number> | null;
      if (!row) {
        return {
          total_tenants: 0,
          total_team_members: 0,
          distinct_users: 0,
          kb_documents_ready: 0,
          new_tenants_7d: 0,
        };
      }
      return {
        total_tenants: Number(row.total_tenants),
        total_team_members: Number(row.total_team_members),
        distinct_users: Number(row.distinct_users),
        kb_documents_ready: Number(row.kb_documents_ready),
        new_tenants_7d: Number(row.new_tenants_7d),
      };
    },
  });
}

export function useHqTenantDirectory(enabled: boolean) {
  return useQuery({
    queryKey: ["hq-tenant-directory"],
    enabled,
    queryFn: async (): Promise<HqTenantDirectoryRow[]> => {
      const { data, error } = await getSupabaseClient().rpc(
        "hq_get_tenant_directory",
      );
      if (error) throw error;
      return (data ?? []) as HqTenantDirectoryRow[];
    },
  });
}

/** Single row from the directory RPC (same health_score as dashboard table). */
export function useHqTenantDirectoryRow(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["hq-tenant-directory-row", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<HqTenantDirectoryRow | null> => {
      const { data, error } = await getSupabaseClient().rpc(
        "hq_get_tenant_directory",
      );
      if (error) throw error;
      const rows = (data ?? []) as HqTenantDirectoryRow[];
      return rows.find((r) => r.id === tenantId) ?? null;
    },
  });
}
