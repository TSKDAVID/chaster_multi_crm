import { useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Download,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Shield,
  Users,
} from "lucide-react";
import { useNotify, useTranslate } from "ra-core";
import { Link } from "react-router";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PermissionGate } from "../access/PermissionGate";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { logAuditEvent } from "../access/logAuditEvent";
import { useMessagingUnreadTotal } from "@/modules/messaging/hooks/useMessagingUnread";
import { UnreadBadge } from "@/modules/messaging/components/UnreadBadge";
import { getSupabaseClient } from "../providers/supabase/supabase";
import type { HqTenantDirectoryRow } from "./hqTypes";
import {
  CHASTER_HQ_NEED_SIGN_IN,
  invokeHqSendMemberPasswordReset,
} from "./hqTenantActionsClient";
import { useHqDashboardStats, useHqTenantDirectory } from "./useHqQueries";
import { Dashboard } from "../dashboard/Dashboard";
import { TenantWorkspaceStats } from "../portal/TenantWorkspaceStats";

export const HqDashboardPath = "/hq";

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "trial":
      return "secondary";
    case "suspended":
      return "destructive";
    case "churned":
      return "outline";
    default:
      return "outline";
  }
}

function healthBarClass(score: number): string {
  if (score <= 40) return "bg-destructive";
  if (score <= 70) return "bg-amber-500";
  return "bg-emerald-600";
}

function defaultReactivateTargetStatus(
  row: HqTenantDirectoryRow,
): "active" | "trial" {
  if (row.trial_ends_at) {
    const end = new Date(row.trial_ends_at).getTime();
    if (Number.isFinite(end) && end > Date.now()) return "trial";
  }
  return "active";
}

type HqDirectoryStatusDialog =
  | { kind: "suspend"; row: HqTenantDirectoryRow }
  | {
      kind: "reactivate";
      row: HqTenantDirectoryRow;
      targetStatus: "active" | "trial";
    };

function trialUrgent(trialEndsAt: string | null): boolean {
  if (!trialEndsAt) return false;
  const end = new Date(trialEndsAt).getTime();
  const now = Date.now();
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  return end > now && end - now < threeDays;
}

function exportTenantsCsv(rows: HqTenantDirectoryRow[], filename: string) {
  const headers = [
    "company_name",
    "slug",
    "status",
    "subscription_tier",
    "trial_ends_at",
    "primary_contact_email",
    "member_count",
    "kb_ready",
    "health_score",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        JSON.stringify(r.company_name),
        JSON.stringify(r.slug),
        r.status,
        r.subscription_tier,
        r.trial_ends_at ?? "",
        JSON.stringify(r.primary_contact_email ?? ""),
        r.member_count,
        r.kb_ready_count,
        r.health_score,
      ].join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function HqDashboardPage() {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { can, tenantId } = useCurrentUserRole();
  const hqMessagesUnread = useMessagingUnreadTotal(can("hq.messages.view"));
  const { data: stats, isPending: statsLoading } = useHqDashboardStats(true);
  const { data: rows, isPending: dirLoading } = useHqTenantDirectory(true);

  const [statusDialog, setStatusDialog] = useState<HqDirectoryStatusDialog | null>(
    null,
  );
  const [statusBusy, setStatusBusy] = useState(false);
  const [primaryResetKey, setPrimaryResetKey] = useState<string | null>(null);

  const applyTenantStatusChange = async () => {
    if (!statusDialog) return;
    setStatusBusy(true);
    try {
      const nextStatus =
        statusDialog.kind === "suspend"
          ? "suspended"
          : statusDialog.targetStatus;
      const { error } = await getSupabaseClient()
        .from("tenants")
        .update({ status: nextStatus })
        .eq("id", statusDialog.row.id);
      if (error) throw error;
      await logAuditEvent({
        action: "hq_tenant_status_changed",
        tenantId: statusDialog.row.id,
        metadata: {
          from: statusDialog.row.status,
          to: nextStatus,
          company_name: statusDialog.row.company_name,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["hq-tenant-directory"] });
      await queryClient.invalidateQueries({ queryKey: ["hq-dashboard-stats"] });
      await queryClient.invalidateQueries({
        queryKey: ["hq-tenant", statusDialog.row.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["hq-tenant-directory-row", statusDialog.row.id],
      });
      notify(translate("chaster.hq.status_change_success"), { type: "success" });
      setStatusDialog(null);
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
    } finally {
      setStatusBusy(false);
    }
  };

  const sendPrimaryAdminPasswordReset = useCallback(
    async (row: HqTenantDirectoryRow) => {
      if (!row.owner_user_id) return;
      const key = `${row.id}:${row.owner_user_id}`;
      setPrimaryResetKey(key);
      try {
        await invokeHqSendMemberPasswordReset(row.id, row.owner_user_id);
        notify(translate("chaster.hq.team_reset_sent"), { type: "success" });
        await queryClient.invalidateQueries({
          queryKey: ["hq-tenant-audit", row.id],
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === CHASTER_HQ_NEED_SIGN_IN) {
          notify(translate("chaster.hq.team_reset_need_sign_in"), {
            type: "warning",
          });
        } else {
          notify(msg, { type: "error" });
        }
      } finally {
        setPrimaryResetKey(null);
      }
    },
    [notify, translate, queryClient],
  );

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) =>
      a.company_name.localeCompare(b.company_name),
    );
  }, [rows]);

  const loading = statsLoading || dirLoading;
  const companyHealthCard = (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>{translate("chaster.hq.company_health_title")}</CardTitle>
          <CardDescription className="space-y-2">
            <span className="block">{translate("chaster.hq.company_health_desc")}</span>
            <span className="block text-xs">
              {translate("chaster.hq.hint_tenants_vs_companies")}
            </span>
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/hq/companies/new" className="inline-flex items-center gap-1">
              <Plus className="h-4 w-4" />
              {translate("chaster.hq.add_company")}
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!sortedRows.length}
            onClick={() => {
              exportTenantsCsv(
                sortedRows,
                `chaster-tenants-${new Date().toISOString().slice(0, 10)}.csv`,
              );
              notify(translate("chaster.hq.export_done"), { type: "success" });
            }}
          >
            <Download className="h-4 w-4 mr-1" />
            {translate("chaster.hq.export_csv")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{translate("chaster.hq.col_company")}</TableHead>
              <TableHead>{translate("chaster.hq.col_status")}</TableHead>
              <TableHead>{translate("chaster.hq.col_tier")}</TableHead>
              <TableHead>{translate("chaster.hq.col_admin_email")}</TableHead>
              <TableHead>{translate("chaster.hq.col_trial")}</TableHead>
              <TableHead>{translate("chaster.hq.col_activity")}</TableHead>
              <TableHead className="w-[140px]">
                {translate("chaster.hq.col_health")}
              </TableHead>
              <TableHead className="text-right min-w-[280px]">
                {translate("chaster.hq.col_actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {translate("chaster.hq.no_tenants")}
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {row.company_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(row.status)}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.subscription_tier}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {row.primary_contact_email ?? "—"}
                  </TableCell>
                  <TableCell
                    className={
                      trialUrgent(row.trial_ends_at)
                        ? "text-destructive font-medium"
                        : ""
                    }
                  >
                    {row.trial_ends_at
                      ? new Date(row.trial_ends_at).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {new Date(row.last_activity_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all",
                            healthBarClass(row.health_score),
                          )}
                          style={{ width: `${row.health_score}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums w-8">
                        {row.health_score}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/hq/companies/${row.id}`}>
                          {translate("chaster.hq.action_view")}
                        </Link>
                      </Button>
                      <PermissionGate permission="hq.companies.write">
                        {row.owner_user_id ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            title={translate("chaster.hq.action_reset_primary_hint")}
                            disabled={
                              primaryResetKey ===
                              `${row.id}:${row.owner_user_id}`
                            }
                            onClick={() =>
                              void sendPrimaryAdminPasswordReset(row)
                            }
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            {translate("chaster.hq.action_reset_primary")}
                          </Button>
                        ) : null}
                        {row.status === "suspended" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setStatusDialog({
                                kind: "reactivate",
                                row,
                                targetStatus:
                                  defaultReactivateTargetStatus(row),
                              })
                            }
                          >
                            {translate("chaster.hq.action_reactivate")}
                          </Button>
                        ) : row.status !== "churned" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive border-destructive/40 hover:bg-destructive/10"
                            onClick={() =>
                              setStatusDialog({ kind: "suspend", row })
                            }
                          >
                            {translate("chaster.hq.action_suspend")}
                          </Button>
                        ) : null}
                      </PermissionGate>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-screen-xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Building2 className="h-7 w-7" />
          {translate("chaster.hq.title")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {translate("chaster.hq.dashboard_subtitle")}
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {companyHealthCard}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={translate("chaster.hq.stat_tenants")}
              value={stats?.total_tenants ?? 0}
            />
            <StatCard
              label={translate("chaster.hq.stat_users")}
              value={stats?.distinct_users ?? 0}
            />
            <StatCard
              label={translate("chaster.hq.stat_kb_ready")}
              value={stats?.kb_documents_ready ?? 0}
            />
            <StatCard
              label={translate("chaster.hq.stat_new_7d")}
              value={stats?.new_tenants_7d ?? 0}
            />
          </div>

          {tenantId ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <LayoutDashboard className="h-5 w-5" />
                  {translate("chaster.hq.crm_workspace_title")}
                </CardTitle>
                <CardDescription>
                  {translate("chaster.hq.crm_workspace_desc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <TenantWorkspaceStats tenantId={tenantId} statLinkScope="hq" />
                <p className="text-xs text-muted-foreground">
                  {translate("chaster.hq.crm_workspace_followup")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/contacts">{translate("chaster.hq.crm_workspace_link_contacts")}</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/companies">{translate("chaster.hq.crm_workspace_link_companies")}</Link>
                  </Button>
                </div>
                <Dashboard />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <LayoutDashboard className="h-5 w-5" />
                  {translate("chaster.hq.crm_workspace_title")}
                </CardTitle>
                <CardDescription>
                  {translate("chaster.hq.crm_workspace_no_tenant_desc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link to="/portal">{translate("chaster.hq.crm_workspace_open_portal")}</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/contacts">{translate("chaster.hq.open_crm")}</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          <PermissionGate permission="hq.messages.view">
            <Card>
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <MessageSquare className="h-5 w-5" />
                    {translate("chaster.hq.card_messages_title")}
                    <UnreadBadge count={hqMessagesUnread.data ?? 0} />
                  </CardTitle>
                  <CardDescription>
                    {translate("chaster.hq.card_messages_desc")}
                  </CardDescription>
                </div>
                <Button asChild size="sm" className="shrink-0">
                  <Link to="/hq/messages">{translate("chaster.hq.open_messages")}</Link>
                </Button>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 pt-0">
                <Button asChild variant="outline" size="sm">
                  <Link to="/hq/messages" className="inline-flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    {translate("chaster.messages.hq_tab_clients")}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link
                    to="/hq/messages?tab=internal"
                    className="inline-flex items-center gap-1.5"
                  >
                    <Users className="h-3.5 w-3.5" />
                    {translate("chaster.messages.hq_tab_internal")}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </PermissionGate>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                {translate("chaster.hq.card_people_title")}
              </CardTitle>
              <CardDescription>
                {translate("chaster.hq.card_people_desc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 pt-0">
              <Button asChild size="sm" className="gap-1.5">
                <Link to="/hq/platform-team">
                  <Shield className="h-3.5 w-3.5" />
                  {translate("chaster.hq.card_people_platform_team")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/sales">{translate("chaster.hq.card_people_crm_users")}</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/hq/workspace/team">
                  {translate("chaster.hq.card_people_workspace_team")}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link to="/contacts">{translate("chaster.hq.open_crm")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/portal">{translate("chaster.hq.open_portal")}</Link>
            </Button>
          </div>
        </>
      )}

      <Dialog
        open={!!statusDialog}
        onOpenChange={(open) => {
          if (!open) setStatusDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {statusDialog?.kind === "suspend"
                ? translate("chaster.hq.status_suspend_title")
                : translate("chaster.hq.status_reactivate_title")}
            </DialogTitle>
            <DialogDescription>
              {statusDialog?.kind === "suspend"
                ? translate("chaster.hq.status_suspend_desc")
                : translate("chaster.hq.status_reactivate_desc_intro")}
              {statusDialog ? (
                <span className="mt-2 block font-medium text-foreground">
                  {statusDialog.row.company_name}
                </span>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {statusDialog?.kind === "reactivate" ? (
            <div className="space-y-3 py-1">
              <Label>{translate("chaster.hq.status_reactivate_pick")}</Label>
              <RadioGroup
                value={statusDialog.targetStatus}
                onValueChange={(v) =>
                  setStatusDialog({
                    ...statusDialog,
                    targetStatus: v as "active" | "trial",
                  })
                }
                className="gap-2"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="active" id="hq-reactivate-active" />
                  <Label htmlFor="hq-reactivate-active" className="font-normal">
                    {translate("chaster.hq.status_reactivate_option_active")}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="trial" id="hq-reactivate-trial" />
                  <Label htmlFor="hq-reactivate-trial" className="font-normal">
                    {translate("chaster.hq.status_reactivate_option_trial")}
                  </Label>
                </div>
              </RadioGroup>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStatusDialog(null)}
              disabled={statusBusy}
            >
              {translate("chaster.hq.status_change_cancel")}
            </Button>
            <Button
              type="button"
              variant={
                statusDialog?.kind === "suspend" ? "destructive" : "default"
              }
              disabled={statusBusy}
              onClick={() => void applyTenantStatusChange()}
            >
              {statusBusy
                ? translate("chaster.hq.saving")
                : translate("chaster.hq.status_change_confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
