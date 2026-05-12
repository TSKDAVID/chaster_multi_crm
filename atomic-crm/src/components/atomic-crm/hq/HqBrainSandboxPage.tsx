import { useMemo, useState } from "react";
import { useTranslate } from "ra-core";
import { Link } from "react-router";
import { ArrowLeft, TestTube2 } from "lucide-react";
import { ChasterHQGuard } from "../access/ChasterHQGuard";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { ChasterBrainSandboxChat } from "../brain/ChasterBrainSandboxChat";
import { useHqTenantDirectory } from "./useHqQueries";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export const HqBrainSandboxPath = "/hq/brain-sandbox";

export function HqBrainSandboxPage() {
  return (
    <ChasterHQGuard>
      <HqBrainSandboxPageInner />
    </ChasterHQGuard>
  );
}

function HqBrainSandboxPageInner() {
  const translate = useTranslate();
  const { isOwnerSide, can } = useCurrentUserRole();
  const tenantsQuery = useHqTenantDirectory(isOwnerSide && can("hq.view"));
  const rows = tenantsQuery.data ?? [];
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const stableTenantId = useMemo(() => {
    if (selectedTenantId && rows.some((r) => r.id === selectedTenantId)) {
      return selectedTenantId;
    }
    return rows[0]?.id ?? null;
  }, [rows, selectedTenantId]);

  return (
    <div className="mx-auto max-w-screen-lg space-y-6 p-4 md:p-6">
      <div className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit gap-1">
          <Link to="/hq">
            <ArrowLeft className="h-4 w-4" />
            {translate("chaster.hq.workspace_back")}
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <TestTube2 className="h-7 w-7" />
          {translate("chaster.hq.brain_sandbox_title")}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          {translate("chaster.hq.brain_sandbox_subtitle")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {translate("chaster.hq.brain_sandbox_tenant_card_title")}
          </CardTitle>
          <CardDescription>
            {translate("chaster.hq.brain_sandbox_tenant_card_desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tenantsQuery.isPending ? (
            <Skeleton className="h-10 w-full max-w-md" />
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {translate("chaster.hq.brain_sandbox_no_tenants")}
            </p>
          ) : (
            <div className="space-y-2 max-w-md">
              <Label>{translate("chaster.hq.brain_sandbox_tenant_label")}</Label>
              <Select
                value={stableTenantId ?? undefined}
                onValueChange={(v) => setSelectedTenantId(v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={translate("chaster.hq.brain_sandbox_tenant_placeholder")} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {rows.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.company_name} ({t.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {translate("chaster.hq.brain_sandbox_chat_title")}
          </CardTitle>
          <CardDescription>{translate("chaster.hq.brain_sandbox_chat_desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ChasterBrainSandboxChat tenantId={stableTenantId} storageScope="hq" />
        </CardContent>
      </Card>
    </div>
  );
}
