import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "ra-core";
import { Navigate } from "react-router";
import { useCurrentUserRole } from "./useCurrentUserRole";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Wraps portal routes: tenant + module checks. Chaster HQ staff are redirected to `/hq`.
 */
export function TenantPortalGuard({ children }: { children: ReactNode }) {
  const { isOwnerSide, tenantId, isLoading } = useCurrentUserRole();
  const translate = useTranslate();
  const { data: moduleFlags, isPending: moduleFlagsPending } = useQuery({
    queryKey: ["tenant-portal-guard-module-flags", tenantId],
    enabled: !!tenantId && !isLoading && !isOwnerSide,
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

  if (isLoading) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  /** Portal is for tenant users; HQ staff should use /hq (test with a separate login for portal QA). */
  if (isOwnerSide) {
    return <Navigate to="/hq" replace />;
  }

  if (moduleFlagsPending) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!tenantId) {
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
