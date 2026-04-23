import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useGetIdentity, useNotify, useTranslate } from "ra-core";
import { Users } from "lucide-react";
import { PortalQuickNav } from "./PortalQuickNav";
import { TenantPortalGuard } from "../access/TenantPortalGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useChasterAccess } from "../access/chasterAccessContext";
import { useAuthUserId } from "../access/useAuthUserId";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { logAuditEvent } from "../access/logAuditEvent";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { invokeTenantTeam } from "./tenantTeamClient";
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
  email: string;
};

type TenantRole = "super_admin" | "admin" | "member";

type PendingInviteRow = {
  id: string;
  email: string;
  role: string;
  created_at: string;
};

function normRole(r: string): TenantRole {
  if (r === "super_admin" || r === "admin" || r === "member") return r;
  return "member";
}

export function PortalTeamPageContent({
  showPortalQuickNav,
}: {
  showPortalQuickNav: boolean;
}) {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data: identity } = useGetIdentity();
  const { data: authUserId } = useAuthUserId();
  const myId = authUserId ?? "";
  const { tenantId } = useChasterAccess();
  const { can, tenantMemberRole, refetch: refetchAccess } = useCurrentUserRole();
  const myTenantRole = normRole(tenantMemberRole ?? "member");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirst, setInviteFirst] = useState("");
  const [inviteLast, setInviteLast] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [inviteSending, setInviteSending] = useState(false);

  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferToId, setTransferToId] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);

  const [resendInviteId, setResendInviteId] = useState<string | null>(null);
  const [cancelInviteId, setCancelInviteId] = useState<string | null>(null);
  const [cancelInviteBusy, setCancelInviteBusy] = useState(false);

  const { data: members = [], isPending } = useQuery({
    queryKey: ["portal-team-members", tenantId],
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

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["portal-tenant-invites", tenantId],
    enabled: !!tenantId && can("portal.team.invite"),
    queryFn: async (): Promise<PendingInviteRow[]> => {
      const { data, error } = await getSupabaseClient()
        .from("tenant_invites")
        .select("id, email, role, created_at")
        .eq("tenant_id", tenantId!)
        .is("accepted_at", null)
        .is("cancelled_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PendingInviteRow[];
    },
  });

  const { data: salesByUser = {} } = useQuery({
    queryKey: ["portal-team-sales", userIds],
    enabled: userIds.length > 0,
    queryFn: async (): Promise<Record<string, SaleRow>> => {
      const { data, error } = await getSupabaseClient()
        .from("sales")
        .select("user_id, first_name, last_name, email")
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

  const invalidateTeam = () => {
    void queryClient.invalidateQueries({ queryKey: ["portal-team-members", tenantId] });
    void queryClient.invalidateQueries({ queryKey: ["portal-team-sales"] });
    void queryClient.invalidateQueries({ queryKey: ["portal-stat-team", tenantId] });
    void queryClient.invalidateQueries({ queryKey: ["portal-tenant-invites", tenantId] });
  };

  const submitInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteSending(true);
    try {
      await invokeTenantTeam("invite_tenant_member", {
        email,
        first_name: inviteFirst.trim() || undefined,
        last_name: inviteLast.trim() || undefined,
        role: inviteRole,
      });
      notify(translate("chaster.portal.team_invite_success"), { type: "success" });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteFirst("");
      setInviteLast("");
      setInviteRole("member");
      invalidateTeam();
    } catch (e) {
      console.error(e);
      notify((e as Error).message, { type: "error" });
    } finally {
      setInviteSending(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await invokeTenantTeam("remove_tenant_member", {
        target_user_id: removeTarget.user_id,
      });
      notify(translate("chaster.portal.team_remove_success"), { type: "success" });
      setRemoveTarget(null);
      invalidateTeam();
    } catch (e) {
      console.error(e);
      notify((e as Error).message, { type: "error" });
    } finally {
      setRemoveBusy(false);
    }
  };

  const updateRole = async (target: MemberRow, role: "member" | "admin") => {
    try {
      await invokeTenantTeam("update_tenant_member_role", {
        target_user_id: target.user_id,
        role,
      });
      notify(translate("chaster.portal.team_role_updated"), { type: "success" });
      invalidateTeam();
      void refetchAccess();
    } catch (e) {
      console.error(e);
      notify((e as Error).message, { type: "error" });
    }
  };

  const resendInvite = async (inviteId: string) => {
    setResendInviteId(inviteId);
    try {
      await invokeTenantTeam("resend_tenant_invite", { invite_id: inviteId });
      notify(translate("chaster.portal.team_invite_resend_success"), { type: "success" });
      invalidateTeam();
    } catch (e) {
      console.error(e);
      notify((e as Error).message, { type: "error" });
    } finally {
      setResendInviteId(null);
    }
  };

  const confirmCancelInvite = async () => {
    if (!cancelInviteId || !tenantId) return;
    setCancelInviteBusy(true);
    try {
      const { error } = await getSupabaseClient()
        .from("tenant_invites")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", cancelInviteId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      await logAuditEvent({
        action: "tenant_invite_cancelled",
        tenantId,
        metadata: { invite_id: cancelInviteId },
      });
      notify(translate("chaster.portal.team_invite_cancel_success"), { type: "success" });
      setCancelInviteId(null);
      invalidateTeam();
    } catch (e) {
      console.error(e);
      notify((e as Error).message, { type: "error" });
    } finally {
      setCancelInviteBusy(false);
    }
  };

  const submitTransfer = async () => {
    if (!transferToId || !tenantId) return;
    setTransferBusy(true);
    try {
      const { error } = await getSupabaseClient().rpc(
        "transfer_tenant_super_admin",
        { p_new_super_admin_user_id: transferToId },
      );
      if (error) throw error;
      await logAuditEvent({
        action: "tenant_super_admin_transferred",
        tenantId,
        targetUserId: transferToId,
        metadata: {},
      });
      notify(translate("chaster.portal.team_transfer_success"), { type: "success" });
      setTransferOpen(false);
      setTransferToId("");
      invalidateTeam();
      void refetchAccess();
    } catch (e) {
      console.error(e);
      notify((e as Error).message, { type: "error" });
    } finally {
      setTransferBusy(false);
    }
  };

  const transferCandidates = members.filter(
    (m) => m.user_id !== myId && normRole(m.role) !== "super_admin",
  );

  const canShowRoleSelect = (m: MemberRow) => {
    if (!can("portal.team.role_update")) return false;
    const tr = normRole(m.role);
    if (tr === "super_admin") return false;
    if (myTenantRole === "admin") return tr === "member";
    if (myTenantRole === "super_admin") return true;
    return false;
  };

  const canShowRemove = (m: MemberRow) => {
    if (!can("portal.team.remove_member")) return false;
    if (m.user_id === myId) return false;
    const tr = normRole(m.role);
    if (tr === "super_admin") return false;
    if (myTenantRole === "admin") return tr === "member";
    if (myTenantRole === "super_admin") return true;
    return false;
  };

  return (
    <div className="max-w-screen-xl mx-auto p-4 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="h-7 w-7" />
              {translate("chaster.portal.team_title")}
            </h1>
            <p className="text-muted-foreground mt-1">
              {translate("chaster.portal.team_desc")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PermissionGate permission="portal.team.invite">
              <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
                {translate("chaster.portal.team_invite_open")}
              </Button>
            </PermissionGate>
            <PermissionGate permission="portal.team.promote">
              {myTenantRole === "super_admin" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setTransferOpen(true)}
                >
                  {translate("chaster.portal.team_transfer_open")}
                </Button>
              ) : null}
            </PermissionGate>
          </div>
        </div>

        {showPortalQuickNav ? <PortalQuickNav /> : null}

        {can("portal.team.invite") ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {translate("chaster.portal.team_pending_title")}
              </CardTitle>
              <CardDescription>
                {translate("chaster.portal.team_pending_desc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingInvites.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  {translate("chaster.portal.team_pending_empty")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{translate("chaster.portal.team_invite_email")}</TableHead>
                      <TableHead>{translate("chaster.portal.team_invite_role")}</TableHead>
                      <TableHead>{translate("chaster.portal.team_pending_sent")}</TableHead>
                      <TableHead className="text-right w-[200px]">
                        {translate("chaster.portal.team_actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvites.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium">{inv.email}</TableCell>
                        <TableCell className="capitalize">{inv.role}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(inv.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={resendInviteId === inv.id}
                              onClick={() => void resendInvite(inv.id)}
                            >
                              {resendInviteId === inv.id
                                ? translate("chaster.portal.team_pending_resending")
                                : translate("chaster.portal.team_pending_resend")}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setCancelInviteId(inv.id)}
                            >
                              {translate("chaster.portal.team_pending_cancel")}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {translate("chaster.portal.team_title")}
            </CardTitle>
            <CardDescription>
              {can("portal.team.invite")
                ? translate("chaster.portal.team_admin_help")
                : translate("chaster.portal.team_invite_hint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {translate("chaster.portal.team_empty")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{translate("chaster.portal.team_col_member")}</TableHead>
                    <TableHead>{translate("chaster.portal.team_col_role")}</TableHead>
                    <TableHead>{translate("chaster.portal.team_col_joined")}</TableHead>
                    <TableHead className="text-right w-[200px]">
                      {translate("chaster.portal.team_actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => {
                    const s = salesByUser[m.user_id];
                    const label = s
                      ? [s.first_name, s.last_name].filter(Boolean).join(" ").trim() ||
                        s.email
                      : m.user_id.slice(0, 8) + "…";
                    const tr = normRole(m.role);
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{label}</span>
                            {m.user_id === myId ? (
                              <span className="text-xs text-muted-foreground">
                                ({translate("chaster.portal.team_you")})
                              </span>
                            ) : null}
                          </div>
                          {s?.email ? (
                            <div className="text-xs text-muted-foreground">{s.email}</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {canShowRoleSelect(m) ? (
                            <Select
                              value={tr === "super_admin" ? "super_admin" : tr}
                              onValueChange={(v) => {
                                if (v === "member" || v === "admin") {
                                  void updateRole(m, v);
                                }
                              }}
                            >
                              <SelectTrigger className="w-[140px] h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">
                                  {translate("chaster.portal.team_role_member")}
                                </SelectItem>
                                <SelectItem value="admin">
                                  {translate("chaster.portal.team_role_admin")}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="capitalize">{m.role.replace("_", " ")}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(m.joined_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {canShowRemove(m) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => setRemoveTarget(m)}
                            >
                              {translate("chaster.portal.team_remove")}
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

        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{translate("chaster.portal.team_invite_title")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-2">
                <Label>{translate("chaster.portal.team_invite_email")}</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label>{translate("chaster.portal.team_invite_first")}</Label>
                  <Input
                    value={inviteFirst}
                    onChange={(e) => setInviteFirst(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{translate("chaster.portal.team_invite_last")}</Label>
                  <Input
                    value={inviteLast}
                    onChange={(e) => setInviteLast(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{translate("chaster.portal.team_invite_role")}</Label>
                <Select
                  value={inviteRole}
                  onValueChange={(v) =>
                    setInviteRole(v === "admin" ? "admin" : "member")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">
                      {translate("chaster.portal.team_role_member")}
                    </SelectItem>
                    <SelectItem value="admin">
                      {translate("chaster.portal.team_role_admin")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                {translate("chaster.portal.team_remove_confirm_cancel")}
              </Button>
              <Button
                type="button"
                disabled={inviteSending || !inviteEmail.trim()}
                onClick={() => void submitInvite()}
              >
                {inviteSending
                  ? translate("chaster.portal.team_invite_sending")
                  : translate("chaster.portal.team_invite_send")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{translate("chaster.portal.team_remove_confirm_title")}</DialogTitle>
              <DialogDescription>
                {translate("chaster.portal.team_remove_confirm_desc")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRemoveTarget(null)}
                disabled={removeBusy}
              >
                {translate("chaster.portal.team_remove_confirm_cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={removeBusy}
                onClick={() => void confirmRemove()}
              >
                {translate("chaster.portal.team_remove_confirm_action")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!cancelInviteId}
          onOpenChange={(o) => !o && setCancelInviteId(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {translate("chaster.portal.team_invite_cancel_title")}
              </DialogTitle>
              <DialogDescription>
                {translate("chaster.portal.team_invite_cancel_desc")}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCancelInviteId(null)}
                disabled={cancelInviteBusy}
              >
                {translate("chaster.portal.team_remove_confirm_cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={cancelInviteBusy}
                onClick={() => void confirmCancelInvite()}
              >
                {translate("chaster.portal.team_pending_cancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{translate("chaster.portal.team_transfer_title")}</DialogTitle>
              <DialogDescription>
                {translate("chaster.portal.team_transfer_desc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <Label>{translate("chaster.portal.team_transfer_pick")}</Label>
              <Select value={transferToId} onValueChange={setTransferToId}>
                <SelectTrigger>
                  <SelectValue placeholder="…" />
                </SelectTrigger>
                <SelectContent>
                  {transferCandidates.map((m) => {
                    const s = salesByUser[m.user_id];
                    const lab = s
                      ? [s.first_name, s.last_name].filter(Boolean).join(" ").trim() ||
                        s.email
                      : m.user_id;
                    return (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {lab} ({m.role})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTransferOpen(false)}>
                {translate("chaster.portal.team_remove_confirm_cancel")}
              </Button>
              <Button
                type="button"
                disabled={transferBusy || !transferToId}
                onClick={() => void submitTransfer()}
              >
                {translate("chaster.portal.team_transfer_submit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}

export function PortalTeamPage() {
  return (
    <TenantPortalGuard>
      <PortalTeamPageContent showPortalQuickNav />
    </TenantPortalGuard>
  );
}
