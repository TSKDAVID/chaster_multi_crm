import { useTranslate } from "ra-core";
import { TestTube2 } from "lucide-react";
import { TenantPortalGuard } from "../access/TenantPortalGuard";
import { useChasterAccess } from "../access/chasterAccessContext";
import { ChasterBrainSandboxChat } from "../brain/ChasterBrainSandboxChat";
import { PortalQuickNav } from "./PortalQuickNav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PortalBrainSandboxPage() {
  return (
    <TenantPortalGuard>
      <PortalBrainSandboxPageInner />
    </TenantPortalGuard>
  );
}

function PortalBrainSandboxPageInner() {
  const translate = useTranslate();
  const { tenantId } = useChasterAccess();

  return (
    <div className="mx-auto max-w-screen-lg space-y-6 p-4 md:p-6">
      <PortalQuickNav />
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <TestTube2 className="h-7 w-7" />
          {translate("chaster.portal.brain_sandbox_title")}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          {translate("chaster.portal.brain_sandbox_subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {translate("chaster.portal.brain_sandbox_chat_title")}
          </CardTitle>
          <CardDescription>
            {translate("chaster.portal.brain_sandbox_chat_desc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChasterBrainSandboxChat tenantId={tenantId} storageScope="portal" />
        </CardContent>
      </Card>
    </div>
  );
}
