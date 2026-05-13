import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNotify } from "ra-core";
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { ChasterHQGuard } from "../access/ChasterHQGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useAuthUserId } from "../access/useAuthUserId";
import type { UserRiskFlagRow } from "@/modules/support/supportTypes";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type SeverityFilter = "all" | "warning" | "high" | "critical";
type AcknowledgedFilter = "unacknowledged" | "all";

function formatFlagType(raw: string): string {
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function truncateUuid(uuid: string): string {
  return uuid.slice(0, 8) + "...";
}

function severityBadge(severity: UserRiskFlagRow["severity"]) {
  switch (severity) {
    case "critical":
      return <Badge variant="destructive">Critical</Badge>;
    case "high":
      return (
        <Badge className="border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300">
          High
        </Badge>
      );
    case "warning":
      return <Badge variant="outline">Warning</Badge>;
  }
}

export function HqRiskAlertsPage() {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: currentUserId } = useAuthUserId();

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [ackFilter, setAckFilter] = useState<AcknowledgedFilter>("unacknowledged");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const {
    data: flags,
    isLoading,
    error,
  } = useQuery<UserRiskFlagRow[]>({
    queryKey: ["hq-risk-alerts"],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_risk_flags")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as UserRiskFlagRow[];
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (flagId: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from("user_risk_flags")
        .update({
          acknowledged_by: currentUserId,
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", flagId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hq-risk-alerts"] });
      notify("Alert acknowledged", { type: "success" });
    },
    onError: (err: Error) => {
      notify(err.message, { type: "error" });
    },
  });

  const userHistoryQuery = useQuery<UserRiskFlagRow[]>({
    queryKey: ["hq-risk-alerts-user-history", expandedRow],
    enabled: !!expandedRow,
    queryFn: async () => {
      if (!expandedRow || !flags) return [];
      const row = flags.find((f) => f.id === expandedRow);
      if (!row) return [];
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("user_risk_flags")
        .select("*")
        .eq("user_id", row.user_id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as UserRiskFlagRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!flags) return [];
    return flags.filter((f) => {
      if (severityFilter !== "all" && f.severity !== severityFilter) return false;
      if (ackFilter === "unacknowledged" && f.acknowledged_at !== null) return false;
      return true;
    });
  }, [flags, severityFilter, ackFilter]);

  const kpis = useMemo(() => {
    if (!flags) return { unreviewed: 0, critical: 0, high: 0, warning: 0 };
    const unreviewed = flags.filter((f) => !f.acknowledged_at).length;
    const critical = flags.filter((f) => f.severity === "critical" && !f.acknowledged_at).length;
    const high = flags.filter((f) => f.severity === "high" && !f.acknowledged_at).length;
    const warning = flags.filter((f) => f.severity === "warning" && !f.acknowledged_at).length;
    return { unreviewed, critical, high, warning };
  }, [flags]);

  return (
    <ChasterHQGuard>
      <PermissionGate permission="hq.support.cases.read">
        <div className="flex flex-col gap-6 p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Risk Alerts
            </h1>
            <p className="text-sm text-muted-foreground">
              Users flagged by the rate-limiting system for suspicious activity.
            </p>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Unreviewed Alerts
                </CardTitle>
                <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <div className="text-2xl font-bold">{kpis.unreviewed}</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Critical</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <div className="text-2xl font-bold text-red-600">
                    {kpis.critical}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High</CardTitle>
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <div className="text-2xl font-bold text-orange-600">
                    {kpis.high}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Warning</CardTitle>
                <ShieldCheck className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <div className="text-2xl font-bold text-yellow-600">
                    {kpis.warning}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={severityFilter}
              onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={ackFilter}
              onValueChange={(v) => setAckFilter(v as AcknowledgedFilter)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unacknowledged">
                  Unacknowledged Only
                </SelectItem>
                <SelectItem value="all">All Alerts</SelectItem>
              </SelectContent>
            </Select>

            <span className="text-sm text-muted-foreground">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Error state */}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              Failed to load risk alerts: {(error as Error).message}
            </div>
          )}

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]" />
                    <TableHead>Severity</TableHead>
                    <TableHead>Flag Type</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={8}>
                          <Skeleton className="h-8 w-full" />
                        </TableCell>
                      </TableRow>
                    ))}

                  {!isLoading && filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No risk alerts found matching your filters.
                      </TableCell>
                    </TableRow>
                  )}

                  {filtered.map((flag) => (
                    <TableRowGroup
                      key={flag.id}
                      flag={flag}
                      expanded={expandedRow === flag.id}
                      onToggle={() =>
                        setExpandedRow(expandedRow === flag.id ? null : flag.id)
                      }
                      onAcknowledge={() => acknowledgeMutation.mutate(flag.id)}
                      isAcknowledging={
                        acknowledgeMutation.isPending &&
                        acknowledgeMutation.variables === flag.id
                      }
                      userHistory={
                        expandedRow === flag.id
                          ? userHistoryQuery.data ?? []
                          : []
                      }
                      userHistoryLoading={
                        expandedRow === flag.id && userHistoryQuery.isLoading
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </PermissionGate>
    </ChasterHQGuard>
  );
}

HqRiskAlertsPage.path = "/hq/risk-alerts";

/* ─────────────────────────── Row + Expansion ─────────────────────────── */

function TableRowGroup({
  flag,
  expanded,
  onToggle,
  onAcknowledge,
  isAcknowledging,
  userHistory,
  userHistoryLoading,
}: {
  flag: UserRiskFlagRow;
  expanded: boolean;
  onToggle: () => void;
  onAcknowledge: () => void;
  isAcknowledging: boolean;
  userHistory: UserRiskFlagRow[];
  userHistoryLoading: boolean;
}) {
  const isAcknowledged = !!flag.acknowledged_at;

  return (
    <>
      <TableRow
        className={cn(
          "cursor-pointer",
          expanded && "bg-muted/50",
          isAcknowledged && "opacity-60"
        )}
        onClick={onToggle}
      >
        <TableCell>
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </TableCell>
        <TableCell>{severityBadge(flag.severity)}</TableCell>
        <TableCell className="font-medium">
          {formatFlagType(flag.flag_type)}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {truncateUuid(flag.user_id)}
        </TableCell>
        <TableCell className="text-xs">
          {flag.tenant_id ? truncateUuid(flag.tenant_id) : "--"}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {relativeTime(flag.created_at)}
        </TableCell>
        <TableCell>
          {isAcknowledged ? (
            <Badge
              variant="outline"
              className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-400"
            >
              Acknowledged
            </Badge>
          ) : (
            <Badge variant="secondary">Pending Review</Badge>
          )}
        </TableCell>
        <TableCell className="text-right">
          {!isAcknowledged && (
            <Button
              size="sm"
              variant="outline"
              disabled={isAcknowledging}
              onClick={(e) => {
                e.stopPropagation();
                onAcknowledge();
              }}
            >
              {isAcknowledging ? "..." : "Acknowledge"}
            </Button>
          )}
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={8} className="bg-muted/30 p-4">
            <div className="flex flex-col gap-4">
              {/* Details JSON */}
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Details
                </h4>
                <pre className="max-h-48 overflow-auto rounded-md bg-background p-3 text-xs">
                  {JSON.stringify(flag.details, null, 2)}
                </pre>
              </div>

              {/* User Timeline */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  User Flag History
                </h4>
                {userHistoryLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : userHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No other flags for this user.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {userHistory.map((h) => (
                      <div
                        key={h.id}
                        className={cn(
                          "flex items-center gap-3 rounded-md border px-3 py-2 text-xs",
                          h.id === flag.id && "border-primary/50 bg-primary/5"
                        )}
                      >
                        <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {relativeTime(h.created_at)}
                        </span>
                        {severityBadge(h.severity)}
                        <span className="font-medium">
                          {formatFlagType(h.flag_type)}
                        </span>
                        {h.acknowledged_at && (
                          <span className="ml-auto text-green-600">
                            Acknowledged
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
