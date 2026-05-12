import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ComponentType, ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  CircleDot,
  Layers,
  LayoutGrid,
  Link2,
  Network,
  Plus,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNotify, useTranslate } from "ra-core";
import { Link } from "react-router";
import { ChasterHQGuard } from "../access/ChasterHQGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { HqDashboardPath } from "./HqDashboardPage";
import { HqPlatformTeamPath } from "./HqPlatformTeamPage";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { cn } from "@/lib/utils";

export const HqOrganizationsRoutePath = "/hq/organizations";

type HqOrgRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  purpose: string | null;
  accent_color: string | null;
  created_at: string;
};

type HqOrgMemberRow = {
  hq_organization_id: string;
  user_id: string;
  role: "lead" | "admin" | "member";
  note: string | null;
  added_at: string;
};

type SaleMini = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function displayName(s: SaleMini | undefined): string {
  if (!s) return "—";
  const n = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
  return n || s.email || "—";
}

const PURPOSE_PRESETS = [
  "support",
  "customer_success",
  "sales_ops",
  "engineering",
  "finance",
  "other",
] as const;

const ACCENT_PRESETS = [
  "#6366f1",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ec4899",
  "#64748b",
];

export function HqOrganizationsPage() {
  return (
    <ChasterHQGuard>
      <HqOrganizationsPageInner />
    </ChasterHQGuard>
  );
}

function HqOrganizationsPageInner() {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { can } = useCurrentUserRole();
  const canManage = can("hq.organizations.manage");

  const [tab, setTab] = useState("overview");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOrg, setDeleteOrg] = useState<HqOrgRow | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPurpose, setNewPurpose] = useState<string>("support");
  const [newAccent, setNewAccent] = useState(ACCENT_PRESETS[0]!);

  const [pickUserId, setPickUserId] = useState<string | null>(null);
  const [pickRole, setPickRole] = useState<"lead" | "admin" | "member">("member");

  const orgsQuery = useQuery({
    queryKey: ["hq-internal-organizations"],
    queryFn: async (): Promise<HqOrgRow[]> => {
      const { data, error } = await getSupabaseClient()
        .from("hq_organizations")
        .select("id, name, slug, description, purpose, accent_color, created_at")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HqOrgRow[];
    },
  });

  const membersQuery = useQuery({
    queryKey: ["hq-internal-organization-members"],
    queryFn: async (): Promise<HqOrgMemberRow[]> => {
      const { data, error } = await getSupabaseClient()
        .from("hq_organization_members")
        .select("hq_organization_id, user_id, role, note, added_at");
      if (error) throw error;
      return (data ?? []) as HqOrgMemberRow[];
    },
  });

  const platformTeamQuery = useQuery({
    queryKey: ["hq-internal-orgs-platform-user-ids"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("chaster_team")
        .select("user_id");
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id as string);
    },
  });

  const salesQuery = useQuery({
    queryKey: [
      "hq-internal-orgs-sales",
      (platformTeamQuery.data ?? []).slice().sort().join(","),
    ],
    queryFn: async (): Promise<Record<string, SaleMini>> => {
      const ids = platformTeamQuery.data ?? [];
      if (ids.length === 0) return {};
      const { data, error } = await getSupabaseClient()
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);
      if (error) throw error;
      const map: Record<string, SaleMini> = {};
      for (const row of data ?? []) {
        const s = row as SaleMini;
        if (s.user_id) map[s.user_id] = s;
      }
      return map;
    },
    enabled: (platformTeamQuery.data?.length ?? 0) > 0,
  });

  const membersByOrg = useMemo(() => {
    const m = new Map<string, HqOrgMemberRow[]>();
    for (const row of membersQuery.data ?? []) {
      const list = m.get(row.hq_organization_id) ?? [];
      list.push(row);
      m.set(row.hq_organization_id, list);
    }
    return m;
  }, [membersQuery.data]);

  const rosterRows = useMemo(() => {
    const orgs = orgsQuery.data ?? [];
    const sales = salesQuery.data ?? {};
    const memberIndex = new Map<string, Map<string, HqOrgMemberRow["role"]>>();
    for (const row of membersQuery.data ?? []) {
      let inner = memberIndex.get(row.user_id);
      if (!inner) {
        inner = new Map();
        memberIndex.set(row.user_id, inner);
      }
      inner.set(row.hq_organization_id, row.role);
    }
    const userIds = platformTeamQuery.data ?? [];
    return userIds.map((uid) => ({
      userId: uid,
      name: displayName(sales[uid]),
      email: sales[uid]?.email ?? "",
      orgCells: orgs.map((o) => memberIndex.get(uid)?.get(o.id) ?? null),
    }));
  }, [
    membersQuery.data,
    orgsQuery.data,
    platformTeamQuery.data,
    salesQuery.data,
  ]);

  const stats = useMemo(() => {
    const orgs = orgsQuery.data ?? [];
    const members = membersQuery.data ?? [];
    const leads = members.filter((m) => m.role === "lead").length;
    const orgIdsWithLead = new Set(
      members.filter((m) => m.role === "lead").map((m) => m.hq_organization_id),
    );
    const withoutLead = orgs.filter((o) => !orgIdsWithLead.has(o.id)).length;
    return {
      orgCount: orgs.length,
      assignmentCount: members.length,
      leadCount: leads,
      withoutLead,
    };
  }, [orgsQuery.data, membersQuery.data]);

  const selectedOrg = useMemo(
    () => (orgsQuery.data ?? []).find((o) => o.id === selectedOrgId) ?? null,
    [orgsQuery.data, selectedOrgId],
  );

  const selectedMembers = selectedOrgId
    ? membersByOrg.get(selectedOrgId) ?? []
    : [];

  const candidatesNotInOrg = useMemo(() => {
    if (!selectedOrgId) return [];
    const inOrg = new Set(selectedMembers.map((m) => m.user_id));
    return (platformTeamQuery.data ?? []).filter((uid) => !inOrg.has(uid));
  }, [platformTeamQuery.data, selectedMembers, selectedOrgId]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const slug = newSlug.trim() || slugify(newName);
      const {
        data: { user },
      } = await getSupabaseClient().auth.getUser();
      const { error } = await getSupabaseClient().from("hq_organizations").insert({
        name: newName.trim(),
        slug,
        description: newDesc.trim() || null,
        purpose: newPurpose === "other" ? null : newPurpose,
        accent_color: newAccent,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hq-internal-organizations"] });
      notify(translate("chaster.hq.organizations.created"), { type: "success" });
      setCreateOpen(false);
      setNewName("");
      setNewSlug("");
      setNewDesc("");
      setNewPurpose("support");
      setNewAccent(ACCENT_PRESETS[0]!);
    },
    onError: (e: unknown) => {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (org: HqOrgRow) => {
      const { error } = await getSupabaseClient()
        .from("hq_organizations")
        .delete()
        .eq("id", org.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["hq-internal-organizations"] });
      await queryClient.invalidateQueries({
        queryKey: ["hq-internal-organization-members"],
      });
      notify(translate("chaster.hq.organizations.deleted"), { type: "success" });
      setDeleteOrg(null);
      setSelectedOrgId(null);
      setSheetOpen(false);
    },
    onError: (e: unknown) => {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrgId || !pickUserId) return;
      const {
        data: { user },
      } = await getSupabaseClient().auth.getUser();
      const { error } = await getSupabaseClient().from("hq_organization_members").insert({
        hq_organization_id: selectedOrgId,
        user_id: pickUserId,
        role: pickRole,
        added_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["hq-internal-organization-members"],
      });
      notify(translate("chaster.hq.organizations.member_added"), { type: "success" });
      setAddMemberOpen(false);
      setPickUserId(null);
      setPickRole("member");
    },
    onError: (e: unknown) => {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
    },
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: async (p: {
      userId: string;
      role: "lead" | "admin" | "member";
    }) => {
      if (!selectedOrgId) return;
      const { error } = await getSupabaseClient()
        .from("hq_organization_members")
        .update({ role: p.role })
        .eq("hq_organization_id", selectedOrgId)
        .eq("user_id", p.userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["hq-internal-organization-members"],
      });
    },
    onError: (e: unknown) => {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!selectedOrgId) return;
      const { error } = await getSupabaseClient()
        .from("hq_organization_members")
        .delete()
        .eq("hq_organization_id", selectedOrgId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["hq-internal-organization-members"],
      });
      notify(translate("chaster.hq.organizations.member_removed"), { type: "success" });
    },
    onError: (e: unknown) => {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
    },
  });

  const openOrg = (org: HqOrgRow) => {
    setSelectedOrgId(org.id);
    setSheetOpen(true);
  };

  const loading =
    orgsQuery.isPending ||
    membersQuery.isPending ||
    platformTeamQuery.isPending;

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 pb-16 pt-4 md:pt-8 space-y-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3 max-w-2xl">
          <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit gap-1 text-muted-foreground">
            <Link to={HqDashboardPath}>
              <ChevronRight className="h-4 w-4 rotate-180" />
              {translate("chaster.hq.organizations.back_hq")}
            </Link>
          </Button>
          <div className="flex items-start gap-4">
            <div
              className="rounded-2xl p-3 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20 shadow-sm"
              aria-hidden
            >
              <Layers className="h-9 w-9 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {translate("chaster.hq.organizations.title")}
              </h1>
              <p className="text-muted-foreground mt-2 text-base leading-relaxed">
                {translate("chaster.hq.organizations.subtitle")}
              </p>
            </div>
          </div>
        </div>
        <PermissionGate permission="hq.organizations.manage">
          <Button
            type="button"
            size="lg"
            className="shrink-0 gap-2 shadow-md"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-5 w-5" />
            {translate("chaster.hq.organizations.new")}
          </Button>
        </PermissionGate>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Layers}
          label={translate("chaster.hq.organizations.stat_orgs")}
          value={loading ? "—" : String(stats.orgCount)}
          hint={translate("chaster.hq.organizations.stat_orgs_hint")}
        />
        <StatTile
          icon={Users}
          label={translate("chaster.hq.organizations.stat_assignments")}
          value={loading ? "—" : String(stats.assignmentCount)}
          hint={translate("chaster.hq.organizations.stat_assignments_hint")}
        />
        <StatTile
          icon={Shield}
          label={translate("chaster.hq.organizations.stat_leads")}
          value={loading ? "—" : String(stats.leadCount)}
          hint={translate("chaster.hq.organizations.stat_leads_hint")}
        />
        <StatTile
          icon={CircleDot}
          label={translate("chaster.hq.organizations.stat_gaps")}
          value={loading ? "—" : String(stats.withoutLead)}
          tone={stats.withoutLead > 0 ? "warn" : "default"}
          hint={translate("chaster.hq.organizations.stat_gaps_hint")}
        />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-3 h-auto p-1 gap-1 bg-muted/60">
          <TabsTrigger value="overview" className="gap-2 py-2.5 text-sm">
            <LayoutGrid className="h-4 w-4" />
            {translate("chaster.hq.organizations.tab_overview")}
          </TabsTrigger>
          <TabsTrigger value="orgs" className="gap-2 py-2.5 text-sm">
            <Layers className="h-4 w-4" />
            {translate("chaster.hq.organizations.tab_orgs")}
          </TabsTrigger>
          <TabsTrigger value="roster" className="gap-2 py-2.5 text-sm">
            <Network className="h-4 w-4" />
            {translate("chaster.hq.organizations.tab_roster")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-2 outline-none">
          <div className="grid gap-6 lg:grid-cols-3">
            <ConceptCard
              icon={Building2}
              title={translate("chaster.hq.organizations.concept_clients_title")}
              body={translate("chaster.hq.organizations.concept_clients_body")}
              action={
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <Link to={HqDashboardPath}>
                    {translate("chaster.hq.organizations.concept_clients_cta")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              }
            />
            <ConceptCard
              icon={Shield}
              title={translate("chaster.hq.organizations.concept_platform_title")}
              body={translate("chaster.hq.organizations.concept_platform_body")}
              action={
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <Link to={HqPlatformTeamPath}>
                    {translate("chaster.hq.organizations.concept_platform_cta")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              }
            />
            <ConceptCard
              icon={Layers}
              title={translate("chaster.hq.organizations.concept_internal_title")}
              body={translate("chaster.hq.organizations.concept_internal_body")}
              accent
            />
          </div>
          <Card className="border-dashed bg-muted/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                {translate("chaster.hq.organizations.workflow_title")}
              </CardTitle>
              <CardDescription>
                {translate("chaster.hq.organizations.workflow_body")}
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>

        <TabsContent value="orgs" className="mt-2 outline-none space-y-6">
          {orgsQuery.isPending ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          ) : (orgsQuery.data ?? []).length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center space-y-4">
                <Layers className="h-12 w-12 mx-auto text-muted-foreground opacity-40" />
                <div>
                  <p className="font-medium">
                    {translate("chaster.hq.organizations.empty_title")}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                    {translate("chaster.hq.organizations.empty_body")}
                  </p>
                </div>
                <PermissionGate permission="hq.organizations.manage">
                  <Button type="button" onClick={() => setCreateOpen(true)}>
                    {translate("chaster.hq.organizations.new")}
                  </Button>
                </PermissionGate>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {(orgsQuery.data ?? []).map((org) => {
                const n = membersByOrg.get(org.id)?.length ?? 0;
                const color = org.accent_color ?? ACCENT_PRESETS[0];
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => openOrg(org)}
                    className={cn(
                      "text-left rounded-xl border bg-card p-5 shadow-sm transition-all",
                      "hover:shadow-md hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="h-10 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: color ?? undefined }}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{org.name}</h3>
                          {org.purpose ? (
                            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                              {translate(`chaster.hq.organizations.purpose_${org.purpose}`, {
                                _: org.purpose,
                              })}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          /{org.slug}
                        </p>
                        {org.description ? (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {org.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Users className="h-4 w-4" />
                        {translate("chaster.hq.organizations.member_count", {
                          smart_count: n,
                        })}
                      </span>
                      <span className="text-primary text-sm font-medium inline-flex items-center gap-0.5">
                        {translate("chaster.hq.organizations.open")}
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="roster" className="mt-2 outline-none">
          <Card>
            <CardHeader>
              <CardTitle>{translate("chaster.hq.organizations.roster_title")}</CardTitle>
              <CardDescription>
                {translate("chaster.hq.organizations.roster_desc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="w-full">
                <div className="min-w-[640px] lg:min-w-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px] sticky left-0 bg-card z-10 border-r">
                          {translate("chaster.hq.organizations.col_person")}
                        </TableHead>
                        {(orgsQuery.data ?? []).map((o) => (
                          <TableHead key={o.id} className="text-center min-w-[100px]">
                            <span className="line-clamp-2">{o.name}</span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={99}>
                            <Skeleton className="h-24 w-full" />
                          </TableCell>
                        </TableRow>
                      ) : rosterRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={99} className="text-center text-muted-foreground py-12">
                            {translate("chaster.hq.organizations.roster_empty")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        rosterRows.map((row) => (
                          <TableRow key={row.userId}>
                            <TableCell className="sticky left-0 bg-card z-10 border-r font-medium">
                              <div>{row.name}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                                {row.email}
                              </div>
                            </TableCell>
                            {row.orgCells.map((cell, i) => (
                              <TableCell key={i} className="text-center">
                                {cell ? (
                                  <Badge
                                    variant={
                                      cell === "lead"
                                        ? "default"
                                        : cell === "admin"
                                          ? "secondary"
                                          : "outline"
                                    }
                                    className="text-[10px]"
                                  >
                                    {translate(`chaster.hq.organizations.role_${cell}`)}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="flex h-full max-h-[100dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          {selectedOrg ? (
            <>
              <div
                className="h-1.5 w-full shrink-0"
                style={{
                  backgroundColor:
                    selectedOrg.accent_color?.trim() || ACCENT_PRESETS[0],
                }}
                aria-hidden
              />
              <SheetHeader className="space-y-3 border-b bg-muted/25 px-6 pb-5 pt-6 text-left sm:pr-14">
                <SheetTitle className="text-xl font-semibold capitalize leading-snug tracking-tight">
                  {selectedOrg.name}
                </SheetTitle>
                <p className="text-muted-foreground">
                  <span className="inline-flex items-center rounded-md border border-border/80 bg-background px-2.5 py-1 font-mono text-xs tabular-nums tracking-wide text-muted-foreground shadow-sm">
                    /{selectedOrg.slug}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedOrg.purpose ? (
                    <Badge variant="secondary" className="font-normal">
                      {translate(`chaster.hq.organizations.purpose_${selectedOrg.purpose}`, {
                        _: selectedOrg.purpose,
                      })}
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="border-border/80 font-normal tabular-nums">
                    {translate("chaster.hq.organizations.member_count", {
                      smart_count: selectedMembers.length,
                    })}
                  </Badge>
                </div>
              </SheetHeader>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                  <div className="space-y-6">
                    {selectedOrg.description ? (
                      <div className="rounded-xl border border-border/60 bg-muted/15 px-4 py-3">
                        <p className="text-sm leading-relaxed text-foreground/90">
                          {selectedOrg.description}
                        </p>
                      </div>
                    ) : null}

                    <PermissionGate permission="hq.organizations.manage">
                      <Button
                        type="button"
                        className="w-full gap-2 shadow-sm sm:w-auto"
                        onClick={() => setAddMemberOpen(true)}
                      >
                        <Plus className="h-4 w-4" />
                        {translate("chaster.hq.organizations.add_member")}
                      </Button>
                    </PermissionGate>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                          <Users className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-semibold tracking-tight">
                          {translate("chaster.hq.organizations.members_section_title")}
                        </span>
                      </div>
                      <Separator className="bg-border/80" />
                      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
                        <ScrollArea className="h-[min(52vh,400px)]">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-border/60 hover:bg-transparent">
                                <TableHead className="h-11 bg-muted/70 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {translate("chaster.hq.organizations.col_member")}
                                </TableHead>
                                <TableHead className="h-11 bg-muted/70 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  {translate("chaster.hq.organizations.col_role")}
                                </TableHead>
                                <TableHead className="h-11 w-[72px] bg-muted/70 p-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground" />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedMembers.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={3} className="p-0">
                                    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/80">
                                        <Users className="h-6 w-6 text-muted-foreground/60" />
                                      </div>
                                      <p className="max-w-[260px] text-sm text-muted-foreground">
                                        {translate("chaster.hq.organizations.member_empty")}
                                      </p>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ) : (
                                selectedMembers.map((m) => (
                                  <TableRow
                                    key={m.user_id}
                                    className="border-border/50 bg-background/50"
                                  >
                                    <TableCell className="py-3 align-top">
                                      <div className="font-medium leading-tight">
                                        {displayName(salesQuery.data?.[m.user_id])}
                                      </div>
                                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                        {salesQuery.data?.[m.user_id]?.email}
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-3 align-top">
                                      {canManage ? (
                                        <Select
                                          value={m.role}
                                          onValueChange={(v) =>
                                            updateMemberRoleMutation.mutate({
                                              userId: m.user_id,
                                              role: v as "lead" | "admin" | "member",
                                            })
                                          }
                                        >
                                          <SelectTrigger className="h-9 w-[132px] border-border/80">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="lead">
                                              {translate("chaster.hq.organizations.role_lead")}
                                            </SelectItem>
                                            <SelectItem value="admin">
                                              {translate("chaster.hq.organizations.role_admin")}
                                            </SelectItem>
                                            <SelectItem value="member">
                                              {translate("chaster.hq.organizations.role_member")}
                                            </SelectItem>
                                          </SelectContent>
                                        </Select>
                                      ) : (
                                        <Badge variant="outline">
                                          {translate(`chaster.hq.organizations.role_${m.role}`)}
                                        </Badge>
                                      )}
                                    </TableCell>
                                    <TableCell className="py-3 align-top">
                                      {canManage ? (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-9 w-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                          onClick={() => removeMemberMutation.mutate(m.user_id)}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      ) : null}
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </ScrollArea>
                      </div>
                    </div>
                  </div>
                </div>

                {canManage ? (
                  <SheetFooter className="shrink-0 border-t border-border/80 bg-muted/15 px-6 py-4">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-center gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive sm:ml-auto sm:w-auto"
                      onClick={() => setDeleteOrg(selectedOrg)}
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      {translate("chaster.hq.organizations.delete_org")}
                    </Button>
                  </SheetFooter>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{translate("chaster.hq.organizations.create_title")}</DialogTitle>
            <DialogDescription>
              {translate("chaster.hq.organizations.create_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="hq-org-name">{translate("chaster.hq.organizations.field_name")}</Label>
              <Input
                id="hq-org-name"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setNewSlug(slugify(e.target.value));
                }}
                placeholder={translate("chaster.hq.organizations.ph_name")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hq-org-slug">{translate("chaster.hq.organizations.field_slug")}</Label>
              <Input
                id="hq-org-slug"
                value={newSlug}
                onChange={(e) => setNewSlug(slugify(e.target.value))}
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>{translate("chaster.hq.organizations.field_purpose")}</Label>
              <Select value={newPurpose} onValueChange={setNewPurpose}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PURPOSE_PRESETS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {translate(`chaster.hq.organizations.purpose_${p}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{translate("chaster.hq.organizations.field_accent")}</Label>
              <div className="flex flex-wrap gap-2">
                {ACCENT_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform",
                      newAccent === c ? "scale-110 border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                    onClick={() => setNewAccent(c)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hq-org-desc">{translate("chaster.hq.organizations.field_desc")}</Label>
              <Textarea
                id="hq-org-desc"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={3}
                placeholder={translate("chaster.hq.organizations.ph_desc")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              {translate("ra.action.cancel", { _: "Cancel" })}
            </Button>
            <Button
              type="button"
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {translate("ra.action.save", { _: "Save" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("chaster.hq.organizations.add_member_title")}</DialogTitle>
            <DialogDescription>
              {translate("chaster.hq.organizations.add_member_desc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{translate("chaster.hq.organizations.pick_staff")}</Label>
              <Select
                value={pickUserId ?? ""}
                onValueChange={(v) => setPickUserId(v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={translate("chaster.hq.organizations.pick_placeholder")} />
                </SelectTrigger>
                <SelectContent>
                  {candidatesNotInOrg.map((uid) => (
                    <SelectItem key={uid} value={uid}>
                      {displayName(salesQuery.data?.[uid])} ({salesQuery.data?.[uid]?.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{translate("chaster.hq.organizations.field_role")}</Label>
              <Select
                value={pickRole}
                onValueChange={(v) => setPickRole(v as "lead" | "admin" | "member")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">
                    {translate("chaster.hq.organizations.role_lead")}
                  </SelectItem>
                  <SelectItem value="admin">
                    {translate("chaster.hq.organizations.role_admin")}
                  </SelectItem>
                  <SelectItem value="member">
                    {translate("chaster.hq.organizations.role_member")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddMemberOpen(false)}>
              {translate("ra.action.cancel", { _: "Cancel" })}
            </Button>
            <Button
              type="button"
              disabled={!pickUserId || addMemberMutation.isPending}
              onClick={() => addMemberMutation.mutate()}
            >
              {translate("chaster.hq.organizations.add_member_submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteOrg} onOpenChange={(o) => !o && setDeleteOrg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{translate("chaster.hq.organizations.delete_title")}</DialogTitle>
            <DialogDescription>
              {translate("chaster.hq.organizations.delete_desc", {
                name: deleteOrg?.name ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOrg(null)}>
              {translate("ra.action.cancel", { _: "Cancel" })}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteOrg && deleteMutation.mutate(deleteOrg)}
            >
              {translate("chaster.hq.organizations.delete_confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "warn";
}) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-border/80",
        tone === "warn" && "border-amber-500/40 bg-amber-500/[0.03]",
      )}
    >
      <CardHeader className="pb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <CardTitle className="text-3xl font-semibold tabular-nums">{value}</CardTitle>
        <CardDescription className="font-medium text-foreground">{label}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-muted-foreground leading-snug">{hint}</CardContent>
    </Card>
  );
}

function ConceptCard({
  icon: Icon,
  title,
  body,
  action,
  accent,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
  action?: ReactNode;
  accent?: boolean;
}) {
  return (
    <Card
      className={cn(
        "h-full flex flex-col border-border/80",
        accent && "border-primary/25 bg-gradient-to-b from-primary/[0.06] to-transparent shadow-sm",
      )}
    >
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn("h-5 w-5", accent ? "text-primary" : "text-muted-foreground")} />
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription className="text-sm leading-relaxed">{body}</CardDescription>
      </CardHeader>
      {action ? <CardContent className="pt-0 mt-auto">{action}</CardContent> : null}
    </Card>
  );
}
