import { useTranslate } from "ra-core";
import { Navigate } from "react-router";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { Skeleton } from "@/components/ui/skeleton";

/** Post-login home: Chaster staff → /hq, clients → /portal */
export function RoleHomeRedirect() {
  const translate = useTranslate();
  const { isOwnerSide, tenantId, isLoading } = useCurrentUserRole();

  if (isLoading) {
    return (
      <div className="p-8 flex justify-center">
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    );
  }

  if (isOwnerSide) {
    return <Navigate to="/hq" replace />;
  }

  if (!tenantId) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto text-center text-muted-foreground">
        {translate("chaster.home.no_organization")}
      </div>
    );
  }

  return <Navigate to="/portal" replace />;
}
