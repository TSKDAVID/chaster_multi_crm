import { useEffect, useMemo, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import {
  FunctionsFetchError,
  FunctionsHttpError,
} from "@supabase/supabase-js";
import {
  CalendarClock,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { ChasterHQGuard } from "../access/ChasterHQGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { useAuthUserId } from "../access/useAuthUserId";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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
import { SupportCaseThread } from "@/modules/support/components/SupportCaseThread";
import { reopenSupportCase } from "@/modules/support/lib/reopenSupportCase";
import { CloseCaseDialog } from "@/modules/support/components/CloseCaseDialog";
import { CasePresenceBanner } from "@/modules/support/components/CasePresenceBanner";
import { HqSupportCaseWorkspace } from "@/modules/support/components/HqSupportCaseWorkspace";
import { HqSupportCaseSidebar } from "@/modules/support/components/HqSupportCaseSidebar";
import { SupportViewportShell } from "@/modules/support/components/SupportViewportShell";
import { useCasePresence } from "@/modules/support/hooks/useCasePresence";
import { safeSelectValue } from "@/modules/support/lib/selectValue";
import { useChasterAccess } from "../access/chasterAccessContext";
import type {
  SupportCaseClosureReason,
  SupportCasePriority,
  SupportCaseRow,
  SupportCaseSource,
  SupportCaseStatus,
  SupportRequesterRow,
} from "@/modules/support/supportTypes";

function SlaTimerChip({
  label,
  dueAt,
  breached,
  completedAt,
}: {
  label: string;
  dueAt: string;
  breached: boolean;
  completedAt: string | null;
}) {
  const due = new Date(dueAt).getTime();
  const now = Date.now();

  if (completedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/50 bg-green-50 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-950/30 dark:text-green-300">
        {label}: Met
      </span>
    );
  }

  if (breached) {
    const overdue = now - due;
    const hrs = Math.floor(overdue / 3600000);
    const mins = Math.floor((overdue % 3600000) / 60000);
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/50 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300 animate-pulse">
        {label}: Breached ({hrs > 0 ? `${hrs}h ` : ""}{mins}m overdue)
      </span>
    );
  }

  const remaining = due - now;
  const hrs = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  const isUrgent = remaining < 900000; // <15 min
  const isWarning = remaining < 3600000; // <1 hr

  const colorClass = isUrgent
    ? "border-red-500/50 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
    : isWarning
      ? "border-yellow-500/50 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300"
      : "border-green-500/50 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${colorClass}`}>
      {label}: {hrs > 0 ? `${hrs}h ` : ""}{mins}m remaining
    </span>
  );
}

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

const CLOSURE_REASONS = [
  "resolved",
  "pending_customer",
  "duplicate",
  "cannot_resolve",
  "spam",
  "cancelled",
] as const satisfies readonly SupportCaseClosureReason[];

function closureLabelKey(r: string | null | undefined): string {
  if (r && (CLOSURE_REASONS as readonly string[]).includes(r)) {
    return `chaster.hq.support.closure_${r}`;
  }
  return "chaster.hq.support.closure_resolved";
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
  const statusRaw = row.status as SupportCaseStatus | undefined;
  const priorityRaw = row.priority as SupportCasePriority | undefined;
  const sourceRaw = row.source as SupportCaseSource | undefined;
  return {
    ...row,
    status:
      statusRaw === "open" ||
      statusRaw === "in_progress" ||
      statusRaw === "pending_client" ||
      statusRaw === "resolved"
        ? statusRaw
        : "open",
    priority:
      priorityRaw === "low" ||
      priorityRaw === "medium" ||
      priorityRaw === "high" ||
      priorityRaw === "urgent"
        ? priorityRaw
        : "medium",
    source:
      sourceRaw === "portal" ||
      sourceRaw === "phone" ||
      sourceRaw === "email" ||
      sourceRaw === "hq" ||
      sourceRaw === "other" ||
      sourceRaw === "prospect"
        ? sourceRaw
        : "portal",
    tags: Array.isArray(row.tags)
      ? row.tags.filter((t): t is string => typeof t === "string")
      : [],
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
  const canManage = can("hq.support.cases.manage");
  const { data: myId } = useAuthUserId();
  const { isOwnerSide } = useChasterAccess();
  const presencePeers = useCasePresence(
    caseId ?? null,
    myId ?? "",
    "Staff",
    isOwnerSide,
  );
  const [status, setStatus] = useState<SupportCaseStatus>("open");
  const [priority, setPriority] = useState<SupportCasePriority>("medium");
  const [source, setSource] = useState<SupportCaseSource>("portal");
  const [noteBody, setNoteBody] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
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

  const relatedCaseQ = useQuery({
    queryKey: ["support-related-case", c?.related_case_id],
    enabled: !!c?.related_case_id,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("support_cases")
        .select("id, case_number, subject, status")
        .eq("id", c!.related_case_id!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; case_number: string; subject: string; status: string } | null;
    },
  });

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

  const assigneeQ = useQuery({
    queryKey: ["support-case-assignee", c?.assigned_to],
    enabled: !!c?.assigned_to,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .eq("user_id", c!.assigned_to!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const o = data as {
        user_id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
      };
      const fn = [o.first_name, o.last_name].filter(Boolean).join(" ").trim();
      return fn || o.email || o.user_id.slice(0, 8);
    },
  });

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

  const closeCaseMut = useMutation({
    mutationFn: async (payload: {
      reason: SupportCaseClosureReason;
      note: string;
    }) => {
      const nextStatus: SupportCaseStatus =
        payload.reason === "pending_customer" ? "pending_client" : "resolved";
      const resolvedAt =
        nextStatus === "resolved" ? new Date().toISOString() : null;
      const { error } = await getSupabaseClient()
        .from("support_cases")
        .update({
          status: nextStatus,
          resolved_at: resolvedAt,
          closure_reason: payload.reason,
          closure_note: payload.note || null,
        })
        .eq("id", caseId!);
      if (error) throw error;
    },
    onSuccess: () => {
      setCloseOpen(false);
      notify(translate("chaster.hq.support.close_case_success"), {
        type: "success",
      });
      void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
      void qc.invalidateQueries({ queryKey: ["support-case-thread", caseId] });
      void qc.invalidateQueries({ queryKey: ["support-messages", caseId] });
      void qc.invalidateQueries({ queryKey: ["hq-support-cases"] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const reopenMut = useMutation({
    mutationFn: async () => {
      await reopenSupportCase(getSupabaseClient(), caseId!, {
        asStaff: true,
      });
    },
    onSuccess: () => {
      notify(translate("chaster.portal.support.case_reopened"), {
        type: "success",
      });
      void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
      void qc.invalidateQueries({ queryKey: ["support-case-thread", caseId] });
      void qc.invalidateQueries({ queryKey: ["hq-support-cases"] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
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
      void qc.invalidateQueries({ queryKey: ["support-case-thread", caseId] });
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

  const STATUS_OPTIONS = [
    "open",
    "in_progress",
    "pending_client",
    "resolved",
  ] as const satisfies readonly SupportCaseStatus[];
  const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const satisfies readonly SupportCasePriority[];
  const SOURCE_OPTIONS = [
    "portal",
    "phone",
    "email",
    "hq",
    "other",
    "prospect",
  ] as const satisfies readonly SupportCaseSource[];

  const safeStatus = safeSelectValue(status, STATUS_OPTIONS, "open");
  const safePriority = safeSelectValue(priority, PRIORITY_OPTIONS, "medium");
  const safeSource = safeSelectValue(source, SOURCE_OPTIONS, "other");
  const caseTags = Array.isArray(c?.tags) ? c!.tags! : [];

  return (
    <ChasterHQGuard>
      <PermissionGate permission="hq.support.cases.read">
        <div className="flex min-h-0 flex-1 flex-col">
        <SupportViewportShell>
          {caseQ.isPending || !c ? (
            <Skeleton className="min-h-0 flex-1 w-full" />
          ) : (
              <HqSupportCaseWorkspace
                caseRow={c}
                assigneeLabel={
                  c.assigned_to
                    ? assigneeQ.data ?? translate("chaster.hq.support.assignee_loading")
                    : translate("chaster.hq.support.unassigned")
                }
                isProspect={isProspectCase}
                banners={
                  <>
                    {c.possible_duplicate_of && !c.merged_into_case_id ? (
                      <div className="rounded-lg border border-yellow-400/50 bg-yellow-50 p-3 dark:bg-yellow-950/20 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200">
                          This case may be a duplicate of another case
                          {c.duplicate_confidence
                            ? ` (${Math.round(c.duplicate_confidence * 100)}% confidence)`
                            : ""}
                          .
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const { error } = await getSupabaseClient().rpc(
                                  "merge_support_cases",
                                  {
                                    p_source_case_id: caseId!,
                                    p_target_case_id: c.possible_duplicate_of!,
                                  },
                                );
                                if (error) throw error;
                                notify("Case merged successfully", { type: "success" });
                                void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
                              } catch (e: unknown) {
                                notify((e as Error).message, { type: "error" });
                              }
                            }}
                          >
                            Merge into original
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              const { error } = await getSupabaseClient()
                                .from("support_cases")
                                .update({ possible_duplicate_of: null, duplicate_confidence: null })
                                .eq("id", caseId!);
                              if (error) notify(error.message, { type: "error" });
                              else void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
                            }}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {c.merged_into_case_id ? (
                      <div className="rounded-lg border border-gray-300/50 bg-gray-50 p-3 dark:bg-gray-950/20 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          This case was merged into another case
                          {c.merged_at
                            ? ` on ${new Date(c.merged_at).toLocaleDateString()}`
                            : ""}
                          .
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const { error } = await getSupabaseClient().rpc(
                                "unmerge_support_case",
                                { p_source_case_id: caseId! },
                              );
                              if (error) throw error;
                              notify("Case unmerged successfully", { type: "success" });
                              void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
                            } catch (e: unknown) {
                              notify((e as Error).message, { type: "error" });
                            }
                          }}
                        >
                          Undo merge
                        </Button>
                      </div>
                    ) : null}
                    {c.follow_up_at &&
                    new Date(c.follow_up_at).getTime() < Date.now() &&
                    c.status !== "resolved" ? (
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/50 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300">
                        <CalendarClock className="h-3 w-3" />
                        Follow-up overdue
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      {c.source === "email" && c.source_email ? (
                        <Badge variant="outline" className="font-normal text-xs">
                          {c.source_email}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="font-normal">
                        {translate(sourceLabelKey(c.source))}
                      </Badge>
                      {c.closure_reason ? (
                        <Badge variant="secondary" className="font-normal">
                          {translate(closureLabelKey(c.closure_reason))}
                        </Badge>
                      ) : null}
                      {(c.escalation_level ?? 0) > 0 ? (
                        <Badge variant="destructive" className="font-normal">
                          Escalation L{c.escalation_level}
                        </Badge>
                      ) : null}
                      {(c.tags ?? []).map((tag) => (
                        <Badge key={tag} variant="outline" className="font-normal bg-muted/50 text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    {c.status !== "resolved" && (c.first_response_due_at || c.resolution_due_at) ? (
                      <div className="flex flex-wrap gap-2">
                        {c.first_response_due_at ? (
                          <SlaTimerChip
                            label="Response SLA"
                            dueAt={c.first_response_due_at}
                            breached={!!c.sla_response_breached}
                            completedAt={c.first_responded_at ?? null}
                          />
                        ) : null}
                        {c.resolution_due_at ? (
                          <SlaTimerChip
                            label="Resolution SLA"
                            dueAt={c.resolution_due_at}
                            breached={!!c.sla_resolution_breached}
                            completedAt={c.status === "resolved" ? c.resolved_at : null}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </>
                }
                toolbarActions={
                  <>
                    {canManage && c.status !== "resolved" && c.status !== "pending_client" ? (
                      <Button type="button" size="sm" className="gap-2" onClick={() => setCloseOpen(true)}>
                        <CheckCircle2 className="h-4 w-4" />
                        {translate("chaster.hq.support.close_case_btn")}
                      </Button>
                    ) : null}
                    {canManage &&
                    (c.status === "resolved" || c.status === "pending_client") ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-2"
                        disabled={reopenMut.isPending}
                        onClick={() => reopenMut.mutate()}
                      >
                        <RotateCcw className="h-4 w-4" />
                        {translate("chaster.portal.support.thread_reopen")}
                      </Button>
                    ) : null}
                  </>
                }
                conversation={
                  <div className="flex h-full min-h-0 flex-col gap-2">
                    <CasePresenceBanner peers={presencePeers} variant="hq" />
                    {caseId ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <ErrorBoundary
                          onError={(error) => {
                            console.error("SupportCaseThread crashed", error);
                          }}
                          fallbackRender={({ resetErrorBoundary }) => (
                            <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                              <p>{translate("chaster.hq.support.thread_load_error")}</p>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={resetErrorBoundary}
                              >
                                {translate("ra.action.refresh")}
                              </Button>
                            </div>
                          )}
                        >
                          <SupportCaseThread
                            caseId={caseId}
                            variant="hq"
                            caseRow={c}
                            embedded
                          />
                        </ErrorBoundary>
                      </div>
                    ) : null}
                  </div>
                }
                sidebar={
                <HqSupportCaseSidebar
                  caseRow={c}
                  caseId={caseId!}
                  isProspectCase={isProspectCase}
                  caseTags={caseTags}
                  safeStatus={safeStatus}
                  safePriority={safePriority}
                  safeSource={safeSource}
                  setStatus={setStatus}
                  setPriority={setPriority}
                  setSource={setSource}
                  relatedCase={relatedCaseQ.data ?? null}
                  reqOrg={reqOrg}
                  setReqOrg={setReqOrg}
                  reqFirst={reqFirst}
                  setReqFirst={setReqFirst}
                  reqLast={reqLast}
                  setReqLast={setReqLast}
                  reqEmail={reqEmail}
                  setReqEmail={setReqEmail}
                  reqPhone={reqPhone}
                  setReqPhone={setReqPhone}
                  reqNotes={reqNotes}
                  setReqNotes={setReqNotes}
                  onSaveRequester={onSaveRequester}
                  requesterSavePending={requesterSaveMut.isPending}
                  onOpenProvision={() => setProvisionOpen(true)}
                  assignSelf={assignSelf}
                  onSave={onSave}
                  savePending={saveMut.isPending}
                  onOpenAssign={() => setAssignOpen(true)}
                  notes={notesQ.data ?? []}
                  authorNames={authorQ.data}
                  noteBody={noteBody}
                  setNoteBody={setNoteBody}
                  onAddNote={() => noteMut.mutate()}
                  notePending={noteMut.isPending}
                  onCaseInvalidate={() =>
                    void qc.invalidateQueries({ queryKey: ["support-case", caseId] })
                  }
                />
                }
              />
          )}
        </SupportViewportShell>

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

              <CloseCaseDialog
                open={closeOpen}
                onOpenChange={setCloseOpen}
                pending={closeCaseMut.isPending}
                onConfirm={(payload) => closeCaseMut.mutate(payload)}
              />
        </div>
      </PermissionGate>
    </ChasterHQGuard>
  );
}
