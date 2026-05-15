import { Link, useParams } from "react-router";
import { useTranslate } from "ra-core";
import { ArrowLeft } from "lucide-react";
import { TenantPortalGuard } from "../access/TenantPortalGuard";
import { PermissionGate } from "../access/PermissionGate";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SupportCaseThread } from "@/modules/support/components/SupportCaseThread";
import { CasePresenceBanner } from "@/modules/support/components/CasePresenceBanner";
import { useCasePresence } from "@/modules/support/hooks/useCasePresence";
import { useAuthUserId } from "../access/useAuthUserId";
import { useChasterAccess } from "../access/chasterAccessContext";
import { PortalQuickNav } from "./PortalQuickNav";

export function PortalSupportCasePage() {
  const { caseId } = useParams<{ caseId: string }>();
  const translate = useTranslate();
  const { data: myId } = useAuthUserId();
  const { isOwnerSide } = useChasterAccess();
  const presencePeers = useCasePresence(
    caseId ?? null,
    myId ?? "",
    translate("chaster.portal.support.thread_you"),
    isOwnerSide,
  );

  return (
    <TenantPortalGuard>
      <PermissionGate permission="portal.support.view">
        <div className="mx-auto max-w-3xl space-y-6 p-4 pb-12 md:p-6">
          <PortalQuickNav />
          <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
            <Link to="/portal/support">
              <ArrowLeft className="h-4 w-4" />
              {translate("chaster.hq.support.back_list")}
            </Link>
          </Button>
          <Card className="overflow-hidden border-border/80 shadow-sm">
            <CardHeader className="border-b bg-muted/20 py-5">
              <CardTitle className="text-lg">
                {translate("chaster.portal.support.title")}
              </CardTitle>
              <CardDescription>
                {translate("chaster.portal.support.subtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="space-y-4 p-4 sm:p-6">
                <CasePresenceBanner peers={presencePeers} variant="portal" />
                {caseId ? (
                  <SupportCaseThread caseId={caseId} variant="portal" />
                ) : (
                  <p className="text-sm text-muted-foreground">Invalid case.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </PermissionGate>
    </TenantPortalGuard>
  );
}
