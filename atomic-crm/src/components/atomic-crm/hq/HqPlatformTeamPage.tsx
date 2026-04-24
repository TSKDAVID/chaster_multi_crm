import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import { Link } from "react-router";
import { ArrowLeft, Shield, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { ChasterHQGuard } from "../access/ChasterHQGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useAuthUserId } from "../access/useAuthUserId";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

export const HqPlatformTeamPath = "/hq/platform-team";

type ChasterTeamRow = {
  id: string;
  user_id: string;
  role: string;
  added_at: string;
};

type SaleRow = {
  id: number;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type PlatformRole =
  | "hq_owner"
  | "hq_ops_admin"
  | "hq_support_lead"
  | "hq_support_agent"
  | "hq_developer"
  | "hq_analyst";

function isPlatformRole(r: string): r is PlatformRole {
  return (
    r === "hq_owner" ||
    r === "hq_ops_admin" ||
    r === "hq_support_lead" ||
    r === "hq_support_agent" ||
    r === "hq_developer" ||
    r === "hq_analyst" ||
    // backward compatibility for existing rows
    r === "staff" ||
    r === "admin" ||
    r === "super_admin"
  );
}

export function HqPlatformTeamPage() {
  return (
    <ChasterHQGuard>
      <HqPlatformTeamPageInner />
    </ChasterHQGuard>
  );
}

function HqPlatformTeamPageInner() {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { can } = useCurrentUserRole();
  const { data: authUserId } = useAuthUserId();
  const canManage = can("hq.team.manage");
  const [addOpen, setAddOpen] = useState(false);
  const [pickUserId, setPickUserId] = useState<string | null>(null);
  const [pickRole, setPickRole] = useState<PlatformRole>("hq_support_agent");

  const teamQuery = useQuery({
    queryKey: ["hq-chaster-platform-team"],
    queryFn: async (): Promise<ChasterTeamRow[]> => {
      const { data, error } = await getSupabaseClient()
        .from("chaster_team")
        .select("id, user_id, role, added_at")
        .order("added_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ChasterTeamRow[];
    },
  });

  const userIds = useMemo(
    () => (teamQuery.data ?? []).map((r) => r.user_id),
    [teamQuery.data],
  );

  const salesQuery = useQuery({
    queryKey: ["hq-chaster-platform-team-sales", userIds.slice().sort().join(",")],
    queryFn: async (): Promise<Record<string, SaleRow>> => {
      if (userIds.length === 0) return {};
      const { data, error } = await getSupabaseClient()
        .from("sales")
        .select("id, user_id, first_name, last_name, email")
        .in("user_id", userIds);
      if (error) throw error;
      const map: Record<string, SaleRow> = {};
      for (const row of data ?? []) {
        const s = row as SaleRow;
        if (s.user_id) map[s.user_id] = s;
      }
      return map;
    },
    enabled: userIds.length > 0,
  });

  const candidatesQuery = useQuery({
    queryKey: ["hq-chaster-platform-team-candidates"],
    queryFn: async (): Promise<SaleRow[]> => {
      const supabase = getSupabaseClient();
      const { data: team, error: e1 } = await supabase
        .from("chaster_team")
        .select("user_id");
      if (e1) throw e1;
      const inTeam = new Set((team ?? []).map((t) => t.user_id as string));
      const { data: sales, error: e2 } = await supabase
        .from("sales")
        .select("id, user_id, first_name, last_name, email")
        .not("user_id", "is", null);
      if (e2) throw e2;
      const rows = (sales ?? []) as SaleRow[];
      const out = rows.filter((s) => s.user_id && !inTeam.has(s.user_id));
      out.sort((a, b) =>
        (a.email ?? "").localeCompare(b.email ?? "", undefined, {
          sensitivity: "base",
        }),
      );
      return out;
    },
    enabled: addOpen && canManage,
  });

  const updateRoleMut = useMutation({
    mutationFn: async ({
      id,
      role,
    }: {
      id: string;
      role: PlatformRole;
    }) => {
      const { error } = await getSupabaseClient()
        .from("chaster_team")
        .update({ role })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hq-chaster-platform-team"] });
      await queryClient.invalidateQueries({ queryKey: ["chaster-access"] });
      notify(translate("chaster.hq.platform_team_role_updated"), {
        type: "success",
      });
    },
    onError: (e: Error) => {
      notify(e.message, { type: "error" });
    },
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getSupabaseClient()
        .from("chaster_team")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hq-chaster-platform-team"] });
      await queryClient.invalidateQueries({
        queryKey: ["hq-chaster-platform-team-candidates"],
      });
      await queryClient.invalidateQueries({ queryKey: ["chaster-access"] });
      notify(translate("chaster.hq.platform_team_removed"), { type: "success" });
    },
    onError: (e: Error) => {
      notify(e.message, { type: "error" });
    },
  });

  const addMut = useMutation({
    mutationFn: async ({
      user_id,
      role,
    }: {
      user_id: string;
      role: PlatformRole;
    }) => {
      const { error } = await getSupabaseClient().from("chaster_team").insert({
        user_id,
        role,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setAddOpen(false);
      setPickUserId(null);
      setPickRole("hq_support_agent");
      await queryClient.invalidateQueries({ queryKey: ["hq-chaster-platform-team"] });
      await queryClient.invalidateQueries({
        queryKey: ["hq-chaster-platform-team-candidates"],
      });
      await queryClient.invalidateQueries({ queryKey: ["chaster-access"] });
      notify(translate("chaster.hq.platform_team_added"), { type: "success" });
    },
    onError: (e: Error) => {
      notify(e.message, { type: "error" });
    },
  });

  const rows = teamQuery.data ?? [];
  const salesByUser = salesQuery.data ?? {};
  const loading = teamQuery.isPending;

  return (
    <div className="mx-auto max-w-screen-xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit gap-1">
            <Link to="/hq">
              <ArrowLeft className="h-4 w-4" />
              {translate("chaster.hq.workspace_back")}
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Shield className="h-7 w-7" />
            {translate("chaster.hq.platform_team_title")}
          </h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            {translate("chaster.hq.platform_team_subtitle")}
          </p>
        </div>
        <PermissionGate permission="hq.team.manage">
          <Button
            type="button"
            className="shrink-0 gap-2"
            onClick={() => setAddOpen(true)}
          >
            <UserPlus className="h-4 w-4" />
            {translate("chaster.hq.platform_team_add_member")}
          </Button>
        </PermissionGate>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {translate("chaster.hq.platform_team_roster_title")}
          </CardTitle>
          <CardDescription>
            {translate("chaster.hq.platform_team_roster_desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">
              {translate("chaster.hq.platform_team_empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{translate("chaster.hq.platform_team_col_name")}</TableHead>
                  <TableHead>{translate("chaster.hq.platform_team_col_email")}</TableHead>
                  <TableHead>{translate("chaster.hq.platform_team_col_role")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {translate("chaster.hq.platform_team_col_added")}
                  </TableHead>
                  <TableHead className="text-right w-[120px]">
                    {translate("chaster.hq.platform_team_col_actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const sale = salesByUser[row.user_id];
                  const name = sale
                    ? [sale.first_name, sale.last_name].filter(Boolean).join(" ") ||
                      "—"
                    : translate("chaster.hq.platform_team_no_profile");
                  const email = sale?.email ?? "—";
                  const role = normalizePlatformRole(row.role);
                  const isSelf = authUserId === row.user_id;

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {email}
                      </TableCell>
                      <TableCell>
                        {canManage ? (
                          <Select
                            value={role}
                            onValueChange={(v) => {
                              if (isPlatformRole(v) && v !== role) {
                                updateRoleMut.mutate({ id: row.id, role: v });
                              }
                            }}
                            disabled={updateRoleMut.isPending}
                          >
                            <SelectTrigger className="h-8 w-[140px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hq_support_agent">
                                {translate("chaster.hq.platform_team_role_staff")}
                              </SelectItem>
                              <SelectItem value="hq_support_lead">
                                Support lead
                              </SelectItem>
                              <SelectItem value="hq_ops_admin">
                                {translate("chaster.hq.platform_team_role_admin")}
                              </SelectItem>
                              <SelectItem value="hq_owner">
                                {translate(
                                  "chaster.hq.platform_team_role_super_admin",
                                )}
                              </SelectItem>
                              <SelectItem value="hq_developer">Developer</SelectItem>
                              <SelectItem value="hq_analyst">Analyst</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-sm">{roleLabel(role, translate)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell text-sm whitespace-nowrap">
                        {row.added_at
                          ? new Date(row.added_at).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canManage ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10"
                            disabled={removeMut.isPending || isSelf}
                            title={
                              isSelf
                                ? translate("chaster.hq.platform_team_remove_self_hint")
                                : undefined
                            }
                            onClick={() => {
                              if (
                                !window.confirm(
                                  translate("chaster.hq.platform_team_remove_confirm"),
                                )
                              ) {
                                return;
                              }
                              removeMut.mutate(row.id);
                            }}
                          >
                            {translate("chaster.hq.platform_team_remove")}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">
            {translate("chaster.hq.platform_team_related_title")}
          </CardTitle>
          <CardDescription>
            {translate("chaster.hq.platform_team_related_desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{translate("chaster.hq.platform_team_add_dialog_title")}</DialogTitle>
            <DialogDescription>
              {translate("chaster.hq.platform_team_add_dialog_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{translate("chaster.hq.platform_team_add_pick_user")}</Label>
              {candidatesQuery.isPending ? (
                <Skeleton className="h-9 w-full" />
              ) : (candidatesQuery.data ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {translate("chaster.hq.platform_team_add_no_candidates")}
                </p>
              ) : (
                <Select
                  value={pickUserId ?? ""}
                  onValueChange={(v) => setPickUserId(v || null)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={translate(
                        "chaster.hq.platform_team_add_placeholder",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {(candidatesQuery.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.user_id!}>
                        {(s.email ?? s.user_id) +
                          (s.first_name || s.last_name
                            ? ` (${[s.first_name, s.last_name].filter(Boolean).join(" ")})`
                            : "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-2">
              <Label>{translate("chaster.hq.platform_team_col_role")}</Label>
              <Select
                value={pickRole}
                onValueChange={(v) => {
                  if (isPlatformRole(v)) setPickRole(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hq_support_agent">
                    {translate("chaster.hq.platform_team_role_staff")}
                  </SelectItem>
                  <SelectItem value="hq_support_lead">
                    Support lead
                  </SelectItem>
                  <SelectItem value="hq_ops_admin">
                    {translate("chaster.hq.platform_team_role_admin")}
                  </SelectItem>
                  <SelectItem value="hq_owner">
                    {translate("chaster.hq.platform_team_role_super_admin")}
                  </SelectItem>
                  <SelectItem value="hq_developer">Developer</SelectItem>
                  <SelectItem value="hq_analyst">Analyst</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              {translate("chaster.hq.status_change_cancel")}
            </Button>
            <Button
              type="button"
              disabled={!pickUserId || addMut.isPending}
              onClick={() => {
                if (!pickUserId) return;
                addMut.mutate({ user_id: pickUserId, role: pickRole });
              }}
            >
              {translate("chaster.hq.platform_team_add_submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function roleLabel(
  role: PlatformRole,
  translate: (key: string) => string,
): string {
  switch (role) {
    case "hq_owner":
      return translate("chaster.hq.platform_team_role_super_admin");
    case "hq_ops_admin":
      return translate("chaster.hq.platform_team_role_admin");
    case "hq_support_lead":
      return "Support lead";
    case "hq_developer":
      return "Developer";
    case "hq_analyst":
      return "Analyst";
    case "hq_support_agent":
      return translate("chaster.hq.platform_team_role_staff");
    default:
      return role;
  }
}

function normalizePlatformRole(role: string): PlatformRole {
  switch (role) {
    case "hq_owner":
      return "hq_owner";
    case "hq_ops_admin":
      return "hq_ops_admin";
    case "hq_support_lead":
      return "hq_support_lead";
    case "hq_support_agent":
      return "hq_support_agent";
    case "hq_developer":
      return "hq_developer";
    case "hq_analyst":
      return "hq_analyst";
    case "super_admin":
      return "hq_owner";
    case "admin":
      return "hq_ops_admin";
    default:
      return "hq_support_agent";
  }
}
