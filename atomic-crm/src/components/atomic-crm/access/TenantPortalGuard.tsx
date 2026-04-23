import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "ra-core";
import { useCurrentUserRole } from "./useCurrentUserRole";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ensures the user has a tenant (or is Chaster staff using default tenant).
 * Future: inject tenant-scoped React context here.
 */
export function TenantPortalGuard({ children }: { children: ReactNode }) {
  const { isOwnerSide, tenantId, isLoading } = useCurrentUserRole();
  const translate = useTranslate();
  const { data: moduleFlags, isPending: moduleFlagsPending } = useQuery({
    queryKey: ["tenant-portal-guard-module-flags", tenantId],
    enabled: !!tenantId && !isLoading,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("tenant_settings")
        .select("crm_module_enabled")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as { crm_module_enabled: boolean } | null;
    },
  });

  if (isLoading || moduleFlagsPending) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!tenantId && !isOwnerSide) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto text-center">
        <p className="text-muted-foreground">
          {translate("chaster.portal.no_tenant", {
            _: "Your account is not linked to an organization. Contact support if you just completed checkout.",
          })}
        </p>
      </div>
    );
  }
  if (tenantId && moduleFlags?.crm_module_enabled === false) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto text-center">
        <p className="text-muted-foreground">
          {translate("chaster.portal.no_tenant", {
            _: "CRM is not included in your active subscription yet. Upgrade plan to unlock CRM access.",
          })}
        </p>
      </div>
    );
  }

  return children;
}
