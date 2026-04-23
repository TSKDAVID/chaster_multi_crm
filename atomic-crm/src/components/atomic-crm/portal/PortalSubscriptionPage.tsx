import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useNotify, useTranslate } from "ra-core";
import { CreditCard } from "lucide-react";
import { PortalQuickNav } from "./PortalQuickNav";
import { TenantPortalGuard } from "../access/TenantPortalGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { useChasterAccess } from "../access/chasterAccessContext";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type TenantRow = {
  subscription_tier: string;
  status: string;
  trial_ends_at: string | null;
};

type ModuleFlagsRow = {
  crm_module_enabled: boolean;
  widget_module_enabled: boolean;
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(iso).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
}

export function PortalSubscriptionPage() {
  const translate = useTranslate();
  const notify = useNotify();
  const { tenantId } = useChasterAccess();
  const { can, isLoading: accessLoading } = useCurrentUserRole();
  const canBilling = can("portal.subscription");

  const { data: tenant, isPending } = useQuery({
    queryKey: ["portal-subscription-tenant", tenantId],
    enabled: !!tenantId && !accessLoading && canBilling,
    queryFn: async (): Promise<TenantRow | null> => {
      const { data, error } = await getSupabaseClient()
        .from("tenants")
        .select("subscription_tier, status, trial_ends_at")
        .eq("id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as TenantRow | null;
    },
  });

  const { data: teamCount = 0 } = useQuery({
    queryKey: ["portal-sub-stat-team", tenantId],
    enabled: !!tenantId && !accessLoading && canBilling,
    queryFn: async () => {
      const { count, error } = await getSupabaseClient()
        .from("tenant_members")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: kbBytes = 0 } = useQuery({
    queryKey: ["portal-sub-kb-bytes", tenantId],
    enabled: !!tenantId && !accessLoading && canBilling,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("knowledge_base_documents")
        .select("file_size_bytes")
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      let sum = 0;
      for (const r of data ?? []) {
        const n = (r as { file_size_bytes: number | null }).file_size_bytes;
        if (typeof n === "number") sum += n;
      }
      return sum;
    },
  });

  const { data: moduleFlags } = useQuery({
    queryKey: ["portal-sub-modules", tenantId],
    enabled: !!tenantId && !accessLoading && canBilling,
    queryFn: async (): Promise<ModuleFlagsRow | null> => {
      const { data, error } = await getSupabaseClient()
        .from("tenant_settings")
        .select("crm_module_enabled, widget_module_enabled")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data as ModuleFlagsRow | null;
    },
  });

  const trialDays = useMemo(
    () => (tenant?.status === "trial" ? daysUntil(tenant.trial_ends_at) : null),
    [tenant],
  );

  const kbMb = kbBytes / (1024 * 1024);
  const canManageSubscription = canBilling && tenant?.status !== undefined;

  const updateSubscription = async (updates: Partial<TenantRow>) => {
    if (!tenantId) return;
    const { error } = await getSupabaseClient()
      .from("tenants")
      .update(updates)
      .eq("id", tenantId);
    if (error) {
      notify(error.message, { type: "warning" });
      return;
    }
    notify("Subscription updated.", { type: "info" });
  };

  return (
    <TenantPortalGuard>
      <div className="max-w-screen-xl mx-auto p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CreditCard className="h-7 w-7" />
            {translate("chaster.portal.subscription_title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {translate("chaster.portal.subscription_desc")}
          </p>
        </div>

        <PortalQuickNav />

        <PermissionGate
          permission="portal.subscription"
          fallback={
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground text-sm">
                {translate("chaster.portal.subscription_access_denied")}
              </CardContent>
            </Card>
          }
        >
          {trialDays != null && trialDays >= 0 ? (
            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900">
              <CardContent className="py-3 text-sm">
                {translate("chaster.portal.subscription_trial_banner", {
                  days: trialDays,
                })}
              </CardContent>
            </Card>
          ) : null}

          {isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {translate("chaster.portal.subscription_plan")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {translate("chaster.portal.subscription_tier")}
                  </span>
                  <span className="font-medium capitalize">
                    {tenant?.subscription_tier ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {translate("chaster.portal.subscription_status")}
                  </span>
                  <span className="font-medium capitalize">{tenant?.status ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CRM module</span>
                  <span className="font-medium">
                    {moduleFlags?.crm_module_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Widget module</span>
                  <span className="font-medium">
                    {moduleFlags?.widget_module_enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <MeterCard
              label={translate("chaster.portal.subscription_meter_conversations")}
              valueLabel="0 / 500"
              pct={5}
            />
            <MeterCard
              label={translate("chaster.portal.subscription_meter_storage")}
              valueLabel={`${kbMb.toFixed(1)} / 100 MB`}
              pct={Math.min(100, (kbMb / 100) * 100)}
            />
            <MeterCard
              label={translate("chaster.portal.subscription_meter_seats")}
              valueLabel={`${teamCount} / 5`}
              pct={Math.min(100, (teamCount / 5) * 100)}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Manage subscription</CardTitle>
              <CardDescription>
                Quick lifecycle controls for local/staging testing flows.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!canManageSubscription}
                onClick={() => void updateSubscription({ subscription_tier: "starter" })}
              >
                Downgrade to Starter
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canManageSubscription}
                onClick={() => void updateSubscription({ subscription_tier: "enterprise" })}
              >
                Upgrade to Enterprise
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canManageSubscription}
                onClick={() => void updateSubscription({ status: "active" })}
              >
                Extend / Reactivate
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!canManageSubscription}
                onClick={() => void updateSubscription({ status: "cancelled" })}
              >
                Cancel subscription
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {translate("chaster.portal.subscription_history")}
              </CardTitle>
              <CardDescription>
                {translate("chaster.portal.subscription_placeholder_desc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground text-center">
                      {translate("chaster.portal.subscription_placeholder_row")}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </PermissionGate>
      </div>
    </TenantPortalGuard>
  );
}

function MeterCard({
  label,
  valueLabel,
  pct,
}: {
  label: string;
  valueLabel: string;
  pct: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-lg tabular-nums">{valueLabel}</CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={pct} className="h-2" />
      </CardContent>
    </Card>
  );
}
