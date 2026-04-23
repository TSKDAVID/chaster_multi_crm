import { ArrowLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PermissionGate } from "../access/PermissionGate";
import { logAuditEvent } from "../access/logAuditEvent";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { cn } from "@/lib/utils";
import {
  hqHealthCriteriaFromDirectoryRow,
  hqHealthScoreColor,
  type HqHealthCriterionId,
} from "./hqHealthBreakdown";
import {
  CHASTER_HQ_NEED_SIGN_IN,
  invokeHqSendMemberPasswordReset,
} from "./hqTenantActionsClient";

function hqHealthCriterionLabel(
  id: HqHealthCriterionId,
  translate: (key: string) => string,
): string {
  switch (id) {
    case "subscription":
      return translate("chaster.hq.health_criterion_subscription");
    case "kb_ready":
      return translate("chaster.hq.health_criterion_kb_ready");
    case "team":
      return translate("chaster.hq.health_criterion_team");
    case "ai_customized":
      return translate("chaster.hq.health_criterion_ai");
    case "activity_7d":
      return translate("chaster.hq.health_criterion_activity");
    default:
      return id;
  }
}
import { HqTenantUsageCharts } from "./HqTenantUsageCharts";
import { useHqTenantDirectoryRow } from "./useHqQueries";

type TenantRow = {
  id: string;
  company_name: string;
  slug: string;
  status: string;
  subscription_tier: string;
  trial_ends_at: string | null;
  owner_user_id: string | null;
  notes: string | null;
  primary_contact_email: string | null;
};

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

type SaleRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
};

export function HqTenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();

  const {
    data: tenant,
    isPending: tLoad,
    isError: tenantError,
  } = useQuery({
    queryKey: ["hq-tenant", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<TenantRow | null> => {
      const { data, error } = await getSupabaseClient()
        .from("tenants")
        .select("*")
        .eq("id", tenantId!)
        .single();
      if (error) throw error;
      return data as TenantRow;
    },
  });

  const { data: members = [], isPending: mLoad } = useQuery({
    queryKey: ["hq-tenant-members", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<MemberRow[]> => {
      const { data, error } = await getSupabaseClient()
        .from("tenant_members")
        .select("id, user_id, role, joined_at")
        .eq("tenant_id", tenantId!)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MemberRow[];
    },
  });

  const userIds = useMemo(() => members.map((m) => m.user_id), [members]);

  const { data: salesByUser = {} } = useQuery({
    queryKey: ["hq-tenant-sales", tenantId, userIds],
    enabled: userIds.length > 0,
    queryFn: async (): Promise<Record<string, SaleRow>> => {
      const { data, error } = await getSupabaseClient()
        .from("sales")
        .select("user_id, first_name, last_name")
        .in("user_id", userIds);
      if (error) throw error;
      const map: Record<string, SaleRow> = {};
      for (const s of data ?? []) {
        const row = s as SaleRow;
        map[row.user_id] = row;
      }
      return map;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["hq-tenant-settings", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("tenant_settings")
        .select("*")
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: kbCount = 0, isPending: kbCountLoad } = useQuery({
    queryKey: ["hq-tenant-kb-count", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { count, error } = await getSupabaseClient()
        .from("knowledge_base_documents")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: audits = [] } = useQuery({
    queryKey: ["hq-tenant-audit", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("audit_logs")
        .select("id, actor_user_id, action, target_user_id, metadata, created_at")
        .eq("tenant_id", tenantId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [coName, setCoName] = useState("");
  const [status, setStatus] = useState("trial");
  const [tier, setTier] = useState("starter");
  const [trialEnd, setTrialEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [extendingTrial, setExtendingTrial] = useState(false);
  const [resetSendingFor, setResetSendingFor] = useState<string | null>(null);

  const { data: directoryRow, isPending: dirRowLoad } =
    useHqTenantDirectoryRow(tenantId);

  useEffect(() => {
    if (!tenant) return;
    setCoName(tenant.company_name);
    setStatus(tenant.status);
    setTier(tenant.subscription_tier);
    setTrialEnd(
      tenant.trial_ends_at
        ? tenant.trial_ends_at.slice(0, 16)
        : "",
    );
    setNotes(tenant.notes ?? "");
  }, [tenant]);

  const saveOverview = useCallback(async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company_name: coName.trim(),
        status,
        subscription_tier: tier,
        notes: notes.trim() || null,
      };
      if (trialEnd) {
        payload.trial_ends_at = new Date(trialEnd).toISOString();
      } else {
        payload.trial_ends_at = null;
      }

      const { error } = await getSupabaseClient()
        .from("tenants")
        .update(payload)
        .eq("id", tenantId);

      if (error) throw error;

      await logAuditEvent({
        action: "hq_tenant_updated",
        tenantId,
        metadata: { fields: Object.keys(payload) },
      });

      await queryClient.invalidateQueries({ queryKey: ["hq-tenant", tenantId] });
      await queryClient.invalidateQueries({ queryKey: ["hq-tenant-directory"] });
      await queryClient.invalidateQueries({
        queryKey: ["hq-tenant-directory-row", tenantId],
      });
      notify(translate("chaster.hq.detail_saved"), { type: "success" });
    } catch (e: unknown) {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
    } finally {
      setSaving(false);
    }
  }, [
    tenantId,
    coName,
    status,
    tier,
    trialEnd,
    notes,
    queryClient,
    notify,
    translate,
  ]);

  const extendTrialByDays = useCallback(
    async (days: number) => {
      if (!tenantId || !tenant) return;
      setExtendingTrial(true);
      try {
        const base = tenant.trial_ends_at
          ? new Date(tenant.trial_ends_at)
          : new Date();
        const next = new Date(base.getTime() + days * 86400000);
        const iso = next.toISOString();
        const { error } = await getSupabaseClient()
          .from("tenants")
          .update({ trial_ends_at: iso })
          .eq("id", tenantId);
        if (error) throw error;
        await logAuditEvent({
          action: "hq_trial_extended",
          tenantId,
          metadata: { days },
        });
        await queryClient.invalidateQueries({ queryKey: ["hq-tenant", tenantId] });
        await queryClient.invalidateQueries({ queryKey: ["hq-tenant-directory"] });
        await queryClient.invalidateQueries({
          queryKey: ["hq-tenant-directory-row", tenantId],
        });
        setTrialEnd(iso.slice(0, 16));
        notify(translate("chaster.hq.extend_trial_success"), { type: "success" });
      } catch (e: unknown) {
        notify(e instanceof Error ? e.message : String(e), { type: "error" });
      } finally {
        setExtendingTrial(false);
      }
    },
    [tenantId, tenant, queryClient, notify, translate],
  );

  const sendMemberPasswordReset = useCallback(
    async (targetUserId: string) => {
      if (!tenantId) return;
      setResetSendingFor(targetUserId);
      try {
        await invokeHqSendMemberPasswordReset(tenantId, targetUserId);
        notify(translate("chaster.hq.team_reset_sent"), { type: "success" });
        await queryClient.invalidateQueries({
          queryKey: ["hq-tenant-audit", tenantId],
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
        setResetSendingFor(null);
      }
    },
    [tenantId, notify, translate, queryClient],
  );

  const healthCriteria = useMemo(
    () =>
      directoryRow ? hqHealthCriteriaFromDirectoryRow(directoryRow) : null,
    [directoryRow],
  );

  const healthTone = directoryRow
    ? hqHealthScoreColor(directoryRow.health_score)
    : "yellow";

  if (!tenantId) {
    return null;
  }

  if (tLoad || mLoad) {
    return (
      <div className="p-6 max-w-screen-xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (tenantError || !tenant) {
    return (
      <div className="p-6 max-w-screen-xl mx-auto">
        <p className="text-muted-foreground">{translate("chaster.hq.detail_not_found")}</p>
        <Button asChild variant="link" className="mt-2">
          <Link to="/hq">{translate("chaster.hq.back_dashboard")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to="/hq">
            <ArrowLeft className="h-4 w-4" />
            {translate("chaster.hq.back_dashboard")}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{tenant.company_name}</h1>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">{translate("chaster.hq.tab_overview")}</TabsTrigger>
          <TabsTrigger value="team">{translate("chaster.hq.tab_team")}</TabsTrigger>
          <TabsTrigger value="usage">{translate("chaster.hq.tab_usage")}</TabsTrigger>
          <TabsTrigger value="kb">{translate("chaster.hq.tab_kb")}</TabsTrigger>
          <TabsTrigger value="settings">{translate("chaster.hq.tab_settings")}</TabsTrigger>
          <TabsTrigger value="audit">{translate("chaster.hq.tab_audit")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{translate("chaster.hq.overview_title")}</CardTitle>
              <CardDescription>{translate("chaster.hq.overview_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>{translate("chaster.hq.new_company_name")}</Label>
                <Input value={coName} onChange={(e) => setCoName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{translate("chaster.hq.col_status")}</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">trial</SelectItem>
                    <SelectItem value="active">active</SelectItem>
                    <SelectItem value="suspended">suspended</SelectItem>
                    <SelectItem value="churned">churned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{translate("chaster.hq.col_tier")}</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">starter</SelectItem>
                    <SelectItem value="pro">pro</SelectItem>
                    <SelectItem value="enterprise">enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{translate("chaster.hq.new_trial_end")}</Label>
                <Input
                  type="datetime-local"
                  value={trialEnd}
                  onChange={(e) => setTrialEnd(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={extendingTrial || saving}
                    onClick={() => void extendTrialByDays(7)}
                  >
                    {translate("chaster.hq.extend_trial_7")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={extendingTrial || saving}
                    onClick={() => void extendTrialByDays(14)}
                  >
                    {translate("chaster.hq.extend_trial_14")}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{translate("chaster.hq.notes_internal")}</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
              <p className="text-xs text-muted-foreground">
                {translate("chaster.hq.slug_readonly")}: {tenant.slug}
              </p>
              <Button type="button" onClick={() => void saveOverview()} disabled={saving}>
                {saving ? translate("chaster.hq.saving") : translate("chaster.hq.save")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{translate("chaster.hq.health_title")}</CardTitle>
              <CardDescription>{translate("chaster.hq.health_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {dirRowLoad ? (
                <Skeleton className="h-24 w-full max-w-md" />
              ) : directoryRow && healthCriteria ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-3xl font-semibold tabular-nums">
                      {directoryRow.health_score}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      / 100
                    </span>
                  </div>
                  <div className="h-2 w-full max-w-md rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all rounded-full",
                        healthTone === "red" && "bg-red-500",
                        healthTone === "yellow" && "bg-amber-500",
                        healthTone === "green" && "bg-green-600",
                      )}
                      style={{ width: `${directoryRow.health_score}%` }}
                    />
                  </div>
                  <ul className="text-sm space-y-2 max-w-lg">
                    {healthCriteria.map((c) => (
                      <li
                        key={c.id}
                        className="flex justify-between gap-4 border-b border-border/60 pb-2 last:border-0"
                      >
                        <span
                          className={
                            c.met ? "text-foreground" : "text-muted-foreground"
                          }
                        >
                          {hqHealthCriterionLabel(c.id, translate)}
                        </span>
                        <span className="tabular-nums text-muted-foreground shrink-0">
                          +{c.points}/{c.maxPoints}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {translate("chaster.hq.health_unavailable")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{translate("chaster.hq.team_title")}</CardTitle>
              <CardDescription>{translate("chaster.hq.team_desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{translate("chaster.hq.team_member")}</TableHead>
                    <TableHead>{translate("chaster.hq.team_role")}</TableHead>
                    <TableHead>{translate("chaster.hq.team_joined")}</TableHead>
                    <TableHead className="text-right w-[1%] whitespace-nowrap">
                      {translate("chaster.hq.team_actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        {translate("chaster.hq.team_empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((m) => {
                      const s = salesByUser[m.user_id];
                      const label = s
                        ? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || m.user_id
                        : m.user_id;
                      return (
                        <TableRow key={m.id}>
                          <TableCell>{label}</TableCell>
                          <TableCell>{m.role}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(m.joined_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <PermissionGate permission="hq.companies.write">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={resetSendingFor === m.user_id}
                                onClick={() => void sendMemberPasswordReset(m.user_id)}
                              >
                                {resetSendingFor === m.user_id
                                  ? translate("chaster.hq.team_reset_sending")
                                  : translate("chaster.hq.team_send_reset")}
                              </Button>
                            </PermissionGate>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{translate("chaster.hq.usage_title")}</CardTitle>
              <CardDescription>{translate("chaster.hq.usage_placeholder")}</CardDescription>
            </CardHeader>
            <CardContent>
              <HqTenantUsageCharts />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kb" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{translate("chaster.hq.kb_title")}</CardTitle>
              <CardDescription>{translate("chaster.hq.kb_support_note")}</CardDescription>
            </CardHeader>
            <CardContent>
              {kbCountLoad ? (
                <Skeleton className="h-14 w-full max-w-md" />
              ) : kbCount === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {translate("chaster.hq.kb_none")}
                </p>
              ) : (
                <div className="space-y-2 rounded-md border bg-muted/30 p-4">
                  <p className="text-sm font-medium">
                    {kbCount === 1
                      ? translate("chaster.hq.kb_presence_one")
                      : translate("chaster.hq.kb_presence_many", {
                          count: kbCount,
                        })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {translate("chaster.hq.kb_privacy_note")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{translate("chaster.hq.tenant_settings_title")}</CardTitle>
              <CardDescription>{translate("chaster.hq.tenant_settings_desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {settings ? (
                <pre className="text-xs bg-muted p-4 rounded-md overflow-x-auto">
                  {JSON.stringify(settings, null, 2)}
                </pre>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {translate("chaster.hq.settings_missing")}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{translate("chaster.hq.audit_title")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{translate("chaster.hq.audit_when")}</TableHead>
                    <TableHead>{translate("chaster.hq.audit_action")}</TableHead>
                    <TableHead>{translate("chaster.hq.audit_actor")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-muted-foreground">
                        {translate("chaster.hq.audit_empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    audits.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(a.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>{a.action}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {a.actor_user_id ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
