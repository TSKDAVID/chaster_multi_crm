import { useTranslate } from "ra-core";
import { ChasterHQGuard } from "../access/ChasterHQGuard";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { PortalKnowledgeBasePageContent } from "../portal/PortalKnowledgeBasePage";
import { HqWorkspaceShell } from "./HqWorkspaceShell";

export function HqWorkspaceKnowledgeBasePage() {
  const translate = useTranslate();
  const { tenantId } = useCurrentUserRole();

  return (
    <ChasterHQGuard>
      <HqWorkspaceShell active="kb">
        {!tenantId ? (
          <p className="text-sm text-muted-foreground py-6">
            {translate("chaster.hq.workspace_need_tenant")}
          </p>
        ) : (
          <PortalKnowledgeBasePageContent showPortalQuickNav={false} />
        )}
      </HqWorkspaceShell>
    </ChasterHQGuard>
  );
}
