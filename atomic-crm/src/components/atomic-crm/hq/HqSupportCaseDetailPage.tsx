import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import {
  FunctionsFetchError,
  FunctionsHttpError,
} from "@supabase/supabase-js";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { ChasterHQGuard } from "../access/ChasterHQGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { useAuthUserId } from "../access/useAuthUserId";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SupportCaseThread } from "@/modules/support/components/SupportCaseThread";
import type {
  SupportCasePriority,
  SupportCaseRow,
  SupportCaseSource,
  SupportCaseStatus,
  SupportRequesterRow,
} from "@/modules/support/supportTypes";

async function formatEdgeFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    try {
      const j = (await res.json()) as { error?: string; message?: string };
      return j.error ?? j.message ?? error.message;
    } catch {
      try {
        const t = await res.text();
        return t || error.message;
      } catch {
        return error.message;
      }
    }
  }
  if (error instanceof FunctionsFetchError) {
    const c = error.context;
    const cause =
      c instanceof Error
        ? c.message
        : c && typeof c === "object" && "message" in c
          ? String((c as { message: string }).message)
          : "";
    return [error.message, cause].filter(Boolean).join(" ");
  }
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: string }).message);
  }
  return String(error);
}

type CaseDetail = SupportCaseRow & {
  tenants: { company_name: string } | null;
  support_requesters: SupportRequesterRow | null;
};

type InternalNote = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
};

function statusLabelKey(status: SupportCaseStatus): string {
  switch (status) {
    case "open":
      return "chaster.portal.support.case_open";
    case "in_progress":
      return "chaster.portal.support.case_in_progress";
    case "pending_client":
      return "chaster.portal.support.case_pending_client";
    case "resolved":
      return "chaster.portal.support.case_resolved";
    default:
      return "chaster.portal.support.case_open";
  }
}

function priorityLabelKey(p: SupportCasePriority): string {
  switch (p) {
    case "low":
      return "chaster.hq.support.priority_low";
    case "medium":
      return "chaster.hq.support.priority_medium";
    case "high":
      return "chaster.hq.support.priority_high";
    case "urgent":
      return "chaster.hq.support.priority_urgent";
    default:
      return "chaster.hq.support.priority_medium";
  }
}

function sourceLabelKey(s: SupportCaseSource): string {
  switch (s) {
    case "portal":
      return "chaster.hq.support.source_portal";
    case "phone":
      return "chaster.hq.support.source_phone";
    case "email":
      return "chaster.hq.support.source_email";
    case "hq":
      return "chaster.hq.support.source_hq";
    case "other":
      return "chaster.hq.support.source_other";
    case "prospect":
      return "chaster.hq.support.source_prospect";
    default:
      return "chaster.hq.support.source_portal";
  }
}

function normalizeCaseDetail(
  r: Record<string, unknown>,
): CaseDetail {
  const row = r as unknown as CaseDetail;
  const sr = row.support_requesters;
  const desc = row.description;
  return {
    ...row,
    priority: (row.priority as SupportCasePriority) ?? "medium",
    source: (row.source as SupportCaseSource) ?? "portal",
    description:
      typeof desc === "string" ? desc : "",
    support_requesters:
      sr && typeof sr === "object" && !Array.isArray(sr)
        ? (sr as SupportRequesterRow)
        : null,
  };
}

export function HqSupportCaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const translate = useTranslate();
  const notify = useNotify();
  const qc = useQueryClient();
  const { can } = useCurrentUserRole();
  const { data: myId } = useAuthUserId();
  const [status, setStatus] = useState<SupportCaseStatus>("open");
  const [priority, setPriority] = useState<SupportCasePriority>("medium");
  const [source, setSource] = useState<SupportCaseSource>("portal");
  const [noteBody, setNoteBody] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [reqOrg, setReqOrg] = useState("");
  const [reqFirst, setReqFirst] = useState("");
  const [reqLast, setReqLast] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqPhone, setReqPhone] = useState("");
  const [reqNotes, setReqNotes] = useState("");
  const [provCompany, setProvCompany] = useState("");
  const [provEmail, setProvEmail] = useState("");
  const [provFirst, setProvFirst] = useState("");
  const [provLast, setProvLast] = useState("");
  const [provTier, setProvTier] = useState("starter");
  const [provStatus, setProvStatus] = useState("trial");
  const [provTrialEnds, setProvTrialEnds] = useState("");
  const [provCreateCrm, setProvCreateCrm] = useState(true);

  const caseQ = useQuery({
    queryKey: ["support-case", caseId],
    enabled: !!caseId && can("hq.support.cases.read"),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("support_cases")
        .select("*, tenants(company_name), support_requesters(*)")
        .eq("id", caseId!)
        .maybeSingle();
      if (error) throw error;
      return data
        ? normalizeCaseDetail(data as Record<string, unknown>)
        : null;
    },
  });

  const c = caseQ.data;

  useEffect(() => {
    if (c?.status) setStatus(c.status);
    if (c?.priority) setPriority(c.priority);
    if (c?.source) setSource(c.source);
  }, [c?.id, c?.status, c?.priority, c?.source]);

  useEffect(() => {
    const rq = c?.support_requesters;
    if (!rq) return;
    setReqOrg(rq.organization_name ?? "");
    setReqFirst(rq.contact_first_name ?? "");
    setReqLast(rq.contact_last_name ?? "");
    setReqEmail(rq.email ?? "");
    setReqPhone(rq.phone ?? "");
    setReqNotes(rq.notes ?? "");
  }, [c?.id, c?.support_requesters?.id]);

  useEffect(() => {
    if (!provisionOpen || !c?.support_requesters) return;
    const rq = c.support_requesters;
    setProvCompany(rq.organization_name?.trim() || "");
    setProvEmail(rq.email?.trim() || "");
    setProvFirst(rq.contact_first_name?.trim() || "");
    setProvLast(rq.contact_last_name?.trim() || "");
  }, [provisionOpen, c?.support_requesters]);

  useEffect(() => {
    if (!caseId) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`support-internal-notes-${caseId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_case_internal_notes",
          filter: `case_id=eq.${caseId}`,
        },
        () => {
          void qc.invalidateQueries({
            queryKey: ["support-internal-notes", caseId],
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [caseId, qc]);

  const notesQ = useQuery({
    queryKey: ["support-internal-notes", caseId],
    enabled: !!caseId && can("hq.support.cases.read"),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("support_case_internal_notes")
        .select("*")
        .eq("case_id", caseId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InternalNote[];
    },
  });

  const staffQ = useQuery({
    queryKey: ["hq-chaster-staff-pick"],
    enabled: assignOpen && can("hq.support.cases.manage"),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("chaster_team")
        .select("user_id");
      if (error) throw error;
      const ids = (data ?? []).map((r) => (r as { user_id: string }).user_id);
      if (ids.length === 0) return [] as { user_id: string; label: string }[];
      const { data: sales, error: sErr } = await getSupabaseClient()
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", ids);
      if (sErr) throw sErr;
      return (sales ?? []).map((row) => {
        const o = row as {
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
        };
        const fn = [o.first_name, o.last_name].filter(Boolean).join(" ").trim();
        return {
          user_id: o.user_id,
          label: fn || o.email || o.user_id.slice(0, 8),
        };
      });
    },
  });

  const authorNames = useMemo(() => {
    const ids = [...new Set((notesQ.data ?? []).map((n) => n.author_id))];
    return ids;
  }, [notesQ.data]);

  const authorQ = useQuery({
    queryKey: ["support-note-authors", authorNames],
    enabled: authorNames.length > 0,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", authorNames);
      if (error) throw error;
      const out: Record<string, string> = {};
      for (const row of data ?? []) {
        const o = row as {
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string | null;
        };
        const fn = [o.first_name, o.last_name].filter(Boolean).join(" ").trim();
        out[o.user_id] = fn || o.email || o.user_id.slice(0, 8);
      }
      return out;
    },
  });

  const saveMut = useMutation({
    mutationFn: async (payload: {
      status: SupportCaseStatus;
      assigned_to: string | null;
      priority: SupportCasePriority;
      source: SupportCaseSource;
    }) => {
      const resolvedAt =
        payload.status === "resolved"
          ? new Date().toISOString()
          : null;
      const { error } = await getSupabaseClient()
        .from("support_cases")
        .update({
          status: payload.status,
          assigned_to: payload.assigned_to,
          resolved_at: resolvedAt,
          priority: payload.priority,
          source: payload.source,
        })
        .eq("id", caseId!);
      if (error) throw error;
    },
    onSuccess: () => {
      notify(translate("chaster.hq.support.saved"), { type: "success" });
      void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
      void qc.invalidateQueries({ queryKey: ["hq-support-cases"] });
      void qc.invalidateQueries({ queryKey: ["support-messages", caseId] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const noteMut = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient()
        .from("support_case_internal_notes")
        .insert({
          case_id: caseId!,
          author_id: myId!,
          body: noteBody.trim(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteBody("");
      void qc.invalidateQueries({ queryKey: ["support-internal-notes", caseId] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const onSave = () => {
    if (!c) return;
    saveMut.mutate({
      status,
      assigned_to: c.assigned_to,
      priority,
      source,
    });
  };

  const assignSelf = () => {
    if (!c || !myId) return;
    saveMut.mutate({
      status,
      assigned_to: myId,
      priority,
      source,
    });
  };

  const pickAssignee = (userId: string) => {
    if (!c) return;
    saveMut.mutate({ status, assigned_to: userId, priority, source });
    setAssignOpen(false);
  };

  const requesterSaveMut = useMutation({
    mutationFn: async () => {
      if (!c?.support_requesters?.id) throw new Error("no requester");
      const { error } = await getSupabaseClient()
        .from("support_requesters")
        .update({
          organization_name: reqOrg.trim(),
          contact_first_name: reqFirst.trim() || null,
          contact_last_name: reqLast.trim() || null,
          email: reqEmail.trim() || null,
          phone: reqPhone.trim() || null,
          notes: reqNotes.trim() || null,
        })
        .eq("id", c.support_requesters.id);
      if (error) throw error;
    },
    onSuccess: () => {
      notify(translate("chaster.hq.support.requester_saved"), {
        type: "success",
      });
      void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
      void qc.invalidateQueries({ queryKey: ["hq-support-cases"] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const onSaveRequester = () => {
    if (!reqEmail.trim() && !reqPhone.trim()) {
      notify(translate("chaster.hq.support.validation_prospect_contact"), {
        type: "warning",
      });
      return;
    }
    requesterSaveMut.mutate();
  };

  const provisionMut = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error(translate("chaster.hq.new_need_sign_in"));
      }
      const company_name = provCompany.trim();
      const email = provEmail.trim().toLowerCase();
      if (!company_name || !email) {
        throw new Error(translate("chaster.hq.new_required"));
      }
      const body: Record<string, string> = {
        company_name,
        email,
        subscription_tier: provTier,
        status: provStatus,
        first_name: provFirst.trim() || "Pending",
        last_name: provLast.trim() || "Pending",
      };
      if (provTrialEnds) {
        body.trial_ends_at = new Date(provTrialEnds).toISOString();
      }
      if (provCreateCrm) {
        body.create_crm_company = "true";
      }
      const { data, error } = await supabase.functions.invoke<{
        tenant?: { id: string };
        crm_company_created?: boolean;
        crm_company_error?: string;
      }>("hq_provision_tenant", {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) {
        throw new Error(await formatEdgeFunctionError(error));
      }
      if (!data?.tenant?.id) {
        throw new Error("Unexpected response");
      }
      const { error: linkErr } = await supabase.rpc(
        "hq_link_support_case_to_tenant",
        {
          p_case_id: caseId!,
          p_tenant_id: data.tenant.id,
        },
      );
      if (linkErr) throw linkErr;
      return {
        tenantId: data.tenant.id,
        crmOk: data.crm_company_created,
        crmErr: data.crm_company_error,
      };
    },
    onSuccess: (res) => {
      notify(translate("chaster.hq.support.provision_success"), {
        type: "success",
      });
      if (res.crmOk === false) {
        notify(translate("chaster.hq.new_crm_company_failed"), {
          type: "warning",
        });
      }
      setProvisionOpen(false);
      void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
      void qc.invalidateQueries({ queryKey: ["hq-support-cases"] });
      void qc.invalidateQueries({ queryKey: ["support-messages", caseId] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const isProspectCase = Boolean(c && c.tenant_id == null);

  return (
    <ChasterHQGuard>
      <PermissionGate permission="hq.support.cases.read">
        <div className="mx-auto max-w-7xl space-y-8 p-4 pb-12 sm:p-6 lg:p-8">
          <Button variant="ghost" size="sm" asChild className="-ml-2 gap-1">
            <Link to="/hq/support/cases">
              <ArrowLeft className="h-4 w-4" />
              {translate("chaster.hq.support.back_list")}
            </Link>
          </Button>

          {caseQ.isPending || !c ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : (
            <>
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link to="/hq/support/cases">
                        {translate("chaster.hq.support.detail_breadcrumb_list")}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="font-mono text-xs">
                      {c.case_number}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="max-w-[min(100%,320px)] truncate">
                      {c.subject}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                      <span className="font-mono text-xs tracking-wide">
                        {c.case_number}
                      </span>
                      <span aria-hidden className="text-muted-foreground/60">
                        ·
                      </span>
                      <span className="truncate font-medium">
                        {c.tenants?.company_name ??
                          c.support_requesters?.organization_name ??
                          translate("chaster.hq.support.prospect_no_tenant")}
                      </span>
                    </div>
                    <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                      {c.subject}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                      {isProspectCase ? (
                        <Badge variant="outline" className="font-normal border-amber-500/50 text-amber-800 dark:text-amber-200">
                          {translate("chaster.hq.support.prospect_badge")}
                        </Badge>
                      ) : null}
                      <Badge variant="secondary" className="font-normal">
                        {translate(statusLabelKey(c.status))}
                      </Badge>
                      <Badge variant="outline" className="font-normal">
                        {translate(priorityLabelKey(c.priority))}
                      </Badge>
                      <Badge variant="outline" className="font-normal">
                        {translate(sourceLabelKey(c.source))}
                      </Badge>
                    </div>
                  </div>
                  {c.tenant_id ? (
                    <Button variant="outline" size="sm" asChild className="shrink-0">
                      <Link
                        to={`/hq/companies/${c.tenant_id}`}
                        className="inline-flex items-center gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {translate("chaster.hq.support.open_tenant")}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-8 lg:grid-cols-[1fr_min(20rem,100%)] xl:grid-cols-3">
                <Card className="overflow-hidden border-border/80 shadow-sm lg:col-span-1 xl:col-span-2">
                  <CardHeader className="border-b bg-muted/20 py-4 sm:py-5">
                    <CardTitle className="text-lg">
                      {translate("chaster.hq.support.conversation")}
                    </CardTitle>
                    <CardDescription>
                      {isProspectCase
                        ? translate("chaster.hq.support.conversation_hint_prospect")
                        : translate("chaster.hq.support.conversation_hint")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="p-4 sm:p-5">
                      {caseId ? (
                        <SupportCaseThread caseId={caseId} variant="hq" />
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
                  <Card className="border-border/80 shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        {translate("chaster.hq.support.case_description_title")}
                      </CardTitle>
                      <CardDescription>
                        {translate("chaster.hq.support.case_description_hint")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {c.description?.trim() ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {c.description.trim()}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {translate("chaster.hq.support.case_description_empty")}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {isProspectCase && c.support_requesters ? (
                    <PermissionGate permission="hq.support.cases.manage">
                      <Card className="border-border/80 shadow-sm border-amber-500/20">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">
                            {translate("chaster.hq.support.requester_card_title")}
                          </CardTitle>
                          <CardDescription>
                            {translate("chaster.hq.support.requester_card_hint")}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs">
                              {translate("chaster.hq.support.prospect_organization")}
                            </Label>
                            <Input
                              value={reqOrg}
                              onChange={(e) => setReqOrg(e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">
                                {translate("chaster.hq.support.prospect_first_name")}
                              </Label>
                              <Input
                                value={reqFirst}
                                onChange={(e) => setReqFirst(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">
                                {translate("chaster.hq.support.prospect_last_name")}
                              </Label>
                              <Input
                                value={reqLast}
                                onChange={(e) => setReqLast(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              {translate("chaster.hq.support.prospect_email")}
                            </Label>
                            <Input
                              type="email"
                              value={reqEmail}
                              onChange={(e) => setReqEmail(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              {translate("chaster.hq.support.prospect_phone")}
                            </Label>
                            <Input
                              value={reqPhone}
                              onChange={(e) => setReqPhone(e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              {translate("chaster.hq.support.prospect_notes")}
                            </Label>
                            <Textarea
                              rows={2}
                              value={reqNotes}
                              onChange={(e) => setReqNotes(e.target.value)}
                              className="resize-y"
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={requesterSaveMut.isPending}
                            onClick={() => onSaveRequester()}
                          >
                            {translate("chaster.hq.support.requester_save")}
                          </Button>
                          <Separator />
                          <p className="text-sm text-muted-foreground">
                            {translate("chaster.hq.support.create_tenant_from_case_desc")}
                          </p>
                          <Button
                            type="button"
                            onClick={() => setProvisionOpen(true)}
                          >
                            {translate("chaster.hq.support.create_tenant_from_case")}
                          </Button>
                        </CardContent>
                      </Card>
                    </PermissionGate>
                  ) : null}

                  <PermissionGate permission="hq.support.cases.manage">
                    <Card className="border-border/80 shadow-sm">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          {translate("chaster.hq.support.case_detail")}
                        </CardTitle>
                        <CardDescription>
                          {translate("chaster.hq.support.status_label")},{" "}
                          {translate("chaster.hq.support.record_priority")},{" "}
                          {translate("chaster.hq.support.record_source")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="space-y-1">
                          <Label className="text-xs">
                            {translate("chaster.hq.support.status_label")}
                          </Label>
                          <Select
                            value={status}
                            onValueChange={(v) =>
                              setStatus(v as SupportCaseStatus)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">
                                {translate("chaster.portal.support.case_open")}
                              </SelectItem>
                              <SelectItem value="in_progress">
                                {translate(
                                  "chaster.portal.support.case_in_progress",
                                )}
                              </SelectItem>
                              <SelectItem value="pending_client">
                                {translate(
                                  "chaster.portal.support.case_pending_client",
                                )}
                              </SelectItem>
                              <SelectItem value="resolved">
                                {translate(
                                  "chaster.portal.support.case_resolved",
                                )}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            {translate("chaster.hq.support.record_priority")}
                          </Label>
                          <Select
                            value={priority}
                            onValueChange={(v) =>
                              setPriority(v as SupportCasePriority)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(
                                [
                                  "low",
                                  "medium",
                                  "high",
                                  "urgent",
                                ] as SupportCasePriority[]
                              ).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {translate(priorityLabelKey(k))}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">
                            {translate("chaster.hq.support.record_source")}
                          </Label>
                          <Select
                            value={source}
                            onValueChange={(v) =>
                              setSource(v as SupportCaseSource)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(
                                [
                                  "portal",
                                  "phone",
                                  "email",
                                  "hq",
                                  "other",
                                  "prospect",
                                ] as SupportCaseSource[]
                              ).map((k) => (
                                <SelectItem key={k} value={k}>
                                  {translate(sourceLabelKey(k))}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={assignSelf}
                            disabled={saveMut.isPending}
                          >
                            {translate("chaster.hq.support.assign_self")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setAssignOpen(true)}
                            disabled={saveMut.isPending}
                          >
                            {translate("chaster.hq.support.assign_pick")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={onSave}
                            disabled={saveMut.isPending}
                          >
                            {saveMut.isPending
                              ? translate("chaster.hq.support.saving")
                              : translate("chaster.hq.support.save_actions")}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </PermissionGate>

                  <Card className="border-border/80 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        {translate("chaster.hq.support.internal_notes")}
                      </CardTitle>
                      <CardDescription>
                        {translate("chaster.hq.support.internal_notes_hint")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ul className="max-h-52 space-y-2 overflow-y-auto text-sm">
                        {(notesQ.data ?? []).map((n) => (
                          <li
                            key={n.id}
                            className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5"
                          >
                            <div className="text-xs text-muted-foreground">
                              {authorQ.data?.[n.author_id] ??
                                n.author_id.slice(0, 8)}{" "}
                              · {new Date(n.created_at).toLocaleString()}
                            </div>
                            <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">
                              {n.body}
                            </p>
                          </li>
                        ))}
                      </ul>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="text-xs">
                          {translate("chaster.hq.support.internal_add")}
                        </Label>
                        <Textarea
                          rows={3}
                          value={noteBody}
                          onChange={(e) => setNoteBody(e.target.value)}
                          placeholder={translate(
                            "chaster.hq.support.internal_add_placeholder",
                          )}
                          className="resize-y bg-background"
                        />
                        <Button
                          type="button"
                          size="sm"
                          disabled={!noteBody.trim() || noteMut.isPending}
                          onClick={() => noteMut.mutate()}
                        >
                          {translate("chaster.hq.support.internal_add")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {translate("chaster.hq.support.assign_pick")}
                    </DialogTitle>
                  </DialogHeader>
                  <ul className="space-y-1 max-h-64 overflow-y-auto">
                    {(staffQ.data ?? []).map((s) => (
                      <li key={s.user_id}>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => pickAssignee(s.user_id)}
                        >
                          {s.label}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </DialogContent>
              </Dialog>

              <Dialog open={provisionOpen} onOpenChange={setProvisionOpen}>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {translate("chaster.hq.support.provision_dialog_title")}
                    </DialogTitle>
                    <DialogDescription>
                      {translate("chaster.hq.support.provision_dialog_desc")}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>{translate("chaster.hq.new_company_name")}</Label>
                      <Input
                        value={provCompany}
                        onChange={(e) => setProvCompany(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{translate("chaster.hq.new_admin_email")}</Label>
                      <Input
                        type="email"
                        value={provEmail}
                        onChange={(e) => setProvEmail(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>{translate("chaster.hq.new_first_name")}</Label>
                        <Input
                          value={provFirst}
                          onChange={(e) => setProvFirst(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>{translate("chaster.hq.new_last_name")}</Label>
                        <Input
                          value={provLast}
                          onChange={(e) => setProvLast(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>{translate("chaster.hq.new_tier")}</Label>
                      <Select value={provTier} onValueChange={setProvTier}>
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
                    <div className="space-y-1">
                      <Label>{translate("chaster.hq.new_status")}</Label>
                      <Select value={provStatus} onValueChange={setProvStatus}>
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
                    <div className="space-y-1">
                      <Label>{translate("chaster.hq.new_trial_end")}</Label>
                      <Input
                        type="datetime-local"
                        value={provTrialEnds}
                        onChange={(e) => setProvTrialEnds(e.target.value)}
                      />
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border border-border/80 p-3">
                      <Checkbox
                        checked={provCreateCrm}
                        onCheckedChange={(v) => setProvCreateCrm(v === true)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 space-y-1">
                        <Label className="font-medium leading-snug">
                          {translate("chaster.hq.new_create_crm_company")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {translate("chaster.hq.new_create_crm_company_hint")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setProvisionOpen(false)}
                    >
                      {translate("chaster.hq.support.new_case_cancel")}
                    </Button>
                    <Button
                      type="button"
                      disabled={provisionMut.isPending}
                      onClick={() => provisionMut.mutate()}
                    >
                      {provisionMut.isPending
                        ? translate("chaster.hq.new_submitting")
                        : translate("chaster.hq.new_submit")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </PermissionGate>
    </ChasterHQGuard>
  );
}
