import { useTranslate } from "ra-core";
import { ChasterHQGuard } from "../access/ChasterHQGuard";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { PortalTeamPageContent } from "../portal/PortalTeamPage";
import { HqWorkspaceShell } from "./HqWorkspaceShell";

export function HqWorkspaceTeamPage() {
  const translate = useTranslate();
  const { tenantId } = useCurrentUserRole();

  return (
    <ChasterHQGuard>
      <HqWorkspaceShell active="team">
        {!tenantId ? (
          <p className="text-sm text-muted-foreground py-6">
            {translate("chaster.hq.workspace_need_tenant")}
          </p>
        ) : (
          <PortalTeamPageContent showPortalQuickNav={false} />
        )}
      </HqWorkspaceShell>
    </ChasterHQGuard>
  );
}
