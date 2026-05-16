import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { logCrmError } from "@/lib/crmDebugLog";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import {
  AlertTriangle,
  ChevronUp,
  Headphones,
  Inbox,
  Plus,
  Search,
  Shield,
  UserPlus,
} from "lucide-react";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { ChasterHQGuard } from "../access/ChasterHQGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { useAuthUserId } from "../access/useAuthUserId";
import { useHqTenantDirectory } from "./useHqQueries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  SupportCaseCategory,
  SupportCasePriority,
  SupportCaseRow,
  SupportCaseSource,
  SupportCaseStatus,
  SupportRequesterRow,
} from "@/modules/support/supportTypes";
import { useSupportStaffUnreadTotal } from "@/modules/support/hooks/useSupportUnread";
import { useSupportCaseSearch } from "@/modules/support/hooks/useSupportCaseSearch";
import { HqSupportCaseListItem } from "@/modules/support/components/HqSupportCaseListItem";
import { HqSupportCasePreview } from "@/modules/support/components/HqSupportCasePreview";
import { SupportViewportShell } from "@/modules/support/components/SupportViewportShell";
import { supportScrollAreaClass } from "@/modules/support/lib/supportScroll";
import { HqSupportFilterSheet } from "@/modules/support/components/HqSupportFilterSheet";
import { HqSupportMetricsStrip } from "@/modules/support/components/HqSupportMetricsStrip";
import {
  sortSupportCases,
  type SupportCaseSortDir,
  type SupportCaseSortField,
} from "@/modules/support/lib/sortSupportCases";
import { CHASTER_SELECT_NONE } from "../sales/SalesProvisioningInputs";
import { UnreadBadge } from "@/modules/messaging/components/UnreadBadge";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

type CaseWithTenant = SupportCaseRow & {
  tenants: { company_name: string } | null;
  support_requesters: SupportRequesterRow | null;
};

type QuickView = "all" | "my_open" | "unassigned" | "unread";

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

function categoryLabelKey(c: SupportCaseCategory): string {
  const map: Record<SupportCaseCategory, string> = {
    billing: "chaster.portal.support.category_billing",
    technical: "chaster.portal.support.category_technical",
    account: "chaster.portal.support.category_account",
    ai_kb: "chaster.portal.support.category_ai_kb",
    widget: "chaster.portal.support.category_widget",
    other: "chaster.portal.support.category_other",
  };
  return map[c] ?? map.other;
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

function normalizeCaseRow(r: Record<string, unknown>): CaseWithTenant {
  const row = r as unknown as CaseWithTenant;
  const sr = row.support_requesters;
  const status = row.status as SupportCaseStatus;
  const validStatuses: SupportCaseStatus[] = [
    "open",
    "in_progress",
    "pending_client",
    "resolved",
  ];
  return {
    ...row,
    case_number: typeof row.case_number === "string" ? row.case_number : "",
    subject:
      typeof row.subject === "string" && row.subject.trim()
        ? row.subject
        : "(No subject)",
    updated_at:
      typeof row.updated_at === "string"
        ? row.updated_at
        : typeof row.created_at === "string"
          ? row.created_at
          : new Date().toISOString(),
    status: validStatuses.includes(status) ? status : "open",
    priority: (row.priority as SupportCasePriority) ?? "medium",
    source: (row.source as SupportCaseSource) ?? "portal",
    support_requesters:
      sr && typeof sr === "object" && !Array.isArray(sr)
        ? (sr as SupportRequesterRow)
        : null,
  };
}

function previewText(body: string | null | undefined, max = 80): string {
  if (!body || typeof body !== "string") return "";
  const t = body.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function HqSupportCasesPage() {
  const translate = useTranslate();
  const notify = useNotify();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const { can } = useCurrentUserRole();
  const { data: myId } = useAuthUserId();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const selectedCaseId = searchParams.get("caseId");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [quickView, setQuickView] = useState<QuickView>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const ftsQ = useSupportCaseSearch("hq", debouncedSearch);
  const [tenantFilter, setTenantFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [slaAtRiskOnly, setSlaAtRiskOnly] = useState(false);
  const [sortField, setSortField] = useState<SupportCaseSortField>(() => {
    try {
      return (
        (localStorage.getItem("hq-support-sort-field") as SupportCaseSortField) ||
        "updated_at"
      );
    } catch {
      return "updated_at";
    }
  });
  const [sortDir, setSortDir] = useState<SupportCaseSortDir>(() => {
    try {
      return (
        (localStorage.getItem("hq-support-sort-dir") as SupportCaseSortDir) || "desc"
      );
    } catch {
      return "desc";
    }
  });
  const [page, setPage] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [newTenantId, setNewTenantId] = useState<string>("");
  const [newSubject, setNewSubject] = useState("");
  const [newCategory, setNewCategory] = useState<SupportCaseCategory>("other");
  const [newPriority, setNewPriority] = useState<SupportCasePriority>("medium");
  const [newMessage, setNewMessage] = useState("");
  const [newAssignSelf, setNewAssignSelf] = useState(true);
  const [tenantQuery, setTenantQuery] = useState("");
  const [showProspectFields, setShowProspectFields] = useState(false);
  const [tenantPickerOpen, setTenantPickerOpen] = useState(false);
  const [newSource, setNewSource] = useState<SupportCaseSource>("hq");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [newFollowUp, setNewFollowUp] = useState("");
  const [newInternalNote, setNewInternalNote] = useState("");
  const [newAssignTo, setNewAssignTo] = useState<string>(CHASTER_SELECT_NONE);
  const [newDescription, setNewDescription] = useState("");
  const [newAttachmentFiles, setNewAttachmentFiles] = useState<File[]>([]);
  const [requesterSearchQ, setRequesterSearchQ] = useState("");
  const [relatedCaseSearchQ, setRelatedCaseSearchQ] = useState("");
  const [selectedRequesterId, setSelectedRequesterId] = useState<string>("");
  const [selectedRelatedCaseId, setSelectedRelatedCaseId] = useState<string>("");
  const tenantPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (newOpen && !showProspectFields) {
      setTenantPickerOpen(true);
    }
    if (!newOpen) {
      setTenantPickerOpen(false);
    }
  }, [newOpen, showProspectFields]);

  useEffect(() => {
    if (!tenantPickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = tenantPickerRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setTenantPickerOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [tenantPickerOpen]);
  useEffect(() => {
    try {
      localStorage.setItem("hq-support-sort-field", sortField);
      localStorage.setItem("hq-support-sort-dir", sortDir);
    } catch {
      /* ignore */
    }
  }, [sortField, sortDir]);

  const [prospectOrg, setProspectOrg] = useState("");
  const [prospectFirst, setProspectFirst] = useState("");
  const [prospectLast, setProspectLast] = useState("");
  const [prospectEmail, setProspectEmail] = useState("");
  const [prospectPhone, setProspectPhone] = useState("");
  const [prospectNotes, setProspectNotes] = useState("");

  const staffUnread = useSupportStaffUnreadTotal(can("hq.support.cases.read"));
  const dirQ = useHqTenantDirectory(can("hq.support.cases.read"));

  const casesQ = useQuery({
    queryKey: ["hq-support-cases"],
    enabled: can("hq.support.cases.read"),
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("support_cases")
        .select("*, tenants(company_name), support_requesters(*)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) =>
        normalizeCaseRow(r as Record<string, unknown>),
      );
    },
  });

  const staffIdsQ = useQuery({
    queryKey: ["chaster-team-user-ids"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("chaster_team")
        .select("user_id");
      if (error) throw error;
      return new Set((data ?? []).map((r) => (r as { user_id: string }).user_id));
    },
  });

  const readStateQ = useQuery({
    queryKey: [
      "support-case-read-state-staff",
      myId,
      casesQ.data?.map((c) => c.id),
    ],
    enabled: !!myId && !!casesQ.data?.length,
    queryFn: async () => {
      const ids = casesQ.data!.map((c) => c.id);
      const { data, error } = await getSupabaseClient()
        .from("support_case_staff_read_state")
        .select("case_id, last_read_at")
        .eq("user_id", myId!)
        .in("case_id", ids);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        const o = row as { case_id: string; last_read_at: string };
        map[o.case_id] = o.last_read_at;
      }
      return map;
    },
  });

  const lastMessagesQ = useQuery({
    queryKey: ["hq-support-cases-last-msg", casesQ.data?.map((c) => c.id)],
    enabled: !!casesQ.data?.length,
    queryFn: async () => {
      const ids = casesQ.data!.map((c) => c.id);
      const { data, error } = await getSupabaseClient()
        .from("support_case_messages")
        .select("case_id, sender_id, created_at, is_system, body")
        .in("case_id", ids)
        .eq("is_system", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const last: Record<
        string,
        { sender_id: string | null; created_at: string; body: string }
      > = {};
      for (const row of data ?? []) {
        const o = row as {
          case_id: string;
          sender_id: string | null;
          created_at: string;
          body: string;
        };
        if (!last[o.case_id]) last[o.case_id] = o;
      }
      return last;
    },
  });

  const staffListQ = useQuery({
    queryKey: ["hq-staff-list-for-assign"],
    enabled: newOpen,
    queryFn: async () => {
      const { data: team, error: tErr } = await getSupabaseClient().from("chaster_team").select("user_id");
      if (tErr) throw tErr;
      const ids = (team ?? []).map((r) => (r as { user_id: string }).user_id);
      if (ids.length === 0) return [] as { user_id: string; label: string }[];
      const { data: sales, error: sErr } = await getSupabaseClient().from("sales").select("user_id, first_name, last_name, email").in("user_id", ids);
      if (sErr) throw sErr;
      return (sales ?? []).map((row) => {
        const o = row as { user_id: string; first_name: string | null; last_name: string | null; email: string | null };
        const fn = [o.first_name, o.last_name].filter(Boolean).join(" ").trim();
        return { user_id: o.user_id, label: fn || o.email || o.user_id.slice(0, 8) };
      });
    },
  });

  const requesterResultsQ = useQuery({
    queryKey: ["hq-requester-search", requesterSearchQ],
    enabled: requesterSearchQ.trim().length >= 2,
    queryFn: async () => {
      const q = requesterSearchQ.trim().toLowerCase();
      const { data, error } = await getSupabaseClient()
        .from("support_requesters")
        .select("id, organization_name, contact_first_name, contact_last_name, email, phone")
        .or(`email.ilike.%${q}%,organization_name.ilike.%${q}%,contact_first_name.ilike.%${q}%,contact_last_name.ilike.%${q}%`)
        .limit(10);
      if (error) throw error;
      return (data ?? []) as { id: string; organization_name: string | null; contact_first_name: string | null; contact_last_name: string | null; email: string | null; phone: string | null }[];
    },
  });

  const relatedCaseResultsQ = useQuery({
    queryKey: ["hq-related-case-search", relatedCaseSearchQ],
    enabled: relatedCaseSearchQ.trim().length >= 2,
    queryFn: async () => {
      const q = relatedCaseSearchQ.trim().toLowerCase();
      const { data, error } = await getSupabaseClient()
        .from("support_cases")
        .select("id, case_number, subject, status")
        .or(`case_number.ilike.%${q}%,subject.ilike.%${q}%`)
        .order("updated_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as { id: string; case_number: string; subject: string; status: string }[];
    },
  });

  const rows = casesQ.data ?? [];

  const assigneeIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of rows) {
      if (c.assigned_to) s.add(c.assigned_to);
    }
    return [...s];
  }, [rows]);

  const assigneeNamesQ = useQuery({
    queryKey: ["hq-support-assignee-names", assigneeIds],
    enabled: assigneeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", assigneeIds);
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

  const unreadIds = useMemo(() => {
    const staff = staffIdsQ.data ?? new Set<string>();
    const reads = readStateQ.data ?? {};
    const last = lastMessagesQ.data ?? {};
    const out = new Set<string>();
    for (const c of rows) {
      const lm = last[c.id];
      if (!lm?.sender_id) continue;
      if (staff.has(lm.sender_id)) continue;
      const readAt = reads[c.id];
      const t = new Date(lm.created_at).getTime();
      const r = readAt ? new Date(readAt).getTime() : 0;
      if (t > r) out.add(c.id);
    }
    return out;
  }, [rows, readStateQ.data, lastMessagesQ.data, staffIdsQ.data]);

  const kpis = useMemo(() => {
    const sevenMs = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - sevenMs;
    return {
      open: rows.filter((c) => c.status === "open").length,
      inProgress: rows.filter((c) => c.status === "in_progress").length,
      pendingClient: rows.filter((c) => c.status === "pending_client").length,
      resolved: rows.filter((c) => c.status === "resolved").length,
      unassigned: rows.filter(
        (c) => !c.assigned_to && c.status !== "resolved",
      ).length,
      unreadClient: unreadIds.size,
      new7d: rows.filter(
        (c) => new Date(c.created_at).getTime() >= cutoff,
      ).length,
      slaBreached: rows.filter(
        (c) =>
          c.status !== "resolved" &&
          (c.sla_response_breached || c.sla_resolution_breached),
      ).length,
      escalated: rows.filter(
        (c) => c.status !== "resolved" && (c.escalation_level ?? 0) > 0,
      ).length,
      avgFirstResponse: (() => {
        const withResponse = rows.filter(
          (c) => (c as Record<string, unknown>).first_responded_at && c.created_at,
        );
        if (withResponse.length === 0) return "—";
        const totalMs = withResponse.reduce((sum, c) => {
          const created = new Date(c.created_at).getTime();
          const responded = new Date((c as Record<string, unknown>).first_responded_at as string).getTime();
          return sum + (responded - created);
        }, 0);
        const avgMin = Math.round(totalMs / withResponse.length / 60000);
        if (avgMin < 60) return `${avgMin}m`;
        const h = Math.floor(avgMin / 60);
        const m = avgMin % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
      })(),
    };
  }, [rows, unreadIds]);

  const filtered = useMemo(() => {
    let out = rows;
    const q = search.trim().toLowerCase();

    if (quickView === "my_open" && myId) {
      out = out.filter(
        (c) => c.assigned_to === myId && c.status !== "resolved",
      );
    } else if (quickView === "unassigned") {
      out = out.filter((c) => !c.assigned_to && c.status !== "resolved");
    } else if (quickView === "unread") {
      out = out.filter((c) => unreadIds.has(c.id));
    }

    if (statusFilter !== "all") {
      out = out.filter((c) => c.status === statusFilter);
    }
    if (unreadOnly) {
      out = out.filter((c) => unreadIds.has(c.id));
    }
    if (tenantFilter !== "all") {
      if (tenantFilter === "__prospect__") {
        out = out.filter((c) => c.tenant_id == null);
      } else {
        out = out.filter((c) => c.tenant_id === tenantFilter);
      }
    }
    if (assigneeFilter !== "all") {
      if (assigneeFilter === "unassigned") {
        out = out.filter((c) => !c.assigned_to);
      } else {
        out = out.filter((c) => c.assigned_to === assigneeFilter);
      }
    }
    if (priorityFilter !== "all") {
      out = out.filter((c) => c.priority === priorityFilter);
    }
    if (slaAtRiskOnly) {
      out = out.filter(
        (c) =>
          c.status !== "resolved" &&
          (c.sla_response_breached || c.sla_resolution_breached),
      );
    }

    if (q.length >= 2 && ftsQ.data) {
      const ids = new Set(ftsQ.data);
      out = out.filter((c) => ids.has(c.id));
    } else if (q) {
      out = out.filter((c) => {
        const company = c.tenants?.company_name?.toLowerCase() ?? "";
        const rq = c.support_requesters;
        const blob = [
          company,
          rq?.organization_name,
          rq?.email,
          rq?.phone,
          [rq?.contact_first_name, rq?.contact_last_name]
            .filter(Boolean)
            .join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (
          (c.case_number ?? "").toLowerCase().includes(q) ||
          (c.subject ?? "").toLowerCase().includes(q) ||
          blob.includes(q)
        );
      });
    }
    return out;
  }, [
    rows,
    quickView,
    myId,
    statusFilter,
    unreadOnly,
    tenantFilter,
    assigneeFilter,
    priorityFilter,
    slaAtRiskOnly,
    search,
    ftsQ.data,
    unreadIds,
  ]);

  const sorted = useMemo(
    () =>
      sortSupportCases(
        filtered,
        sortField,
        sortDir,
        assigneeNamesQ.data ?? {},
      ),
    [filtered, sortField, sortDir, assigneeNamesQ.data],
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  const safePage = Math.min(page, pageCount - 1);
  const paged = useMemo(() => {
    const start = safePage * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, safePage]);

  const sortLabel = (field: SupportCaseSortField) => {
    const key = `chaster.hq.support.sort_${field}` as const;
    return translate(key);
  };

  const applyInsightsFilter = (view: "my_open" | "unassigned" | "unread" | "sla") => {
    setPage(0);
    setSlaAtRiskOnly(view === "sla");
    if (view === "sla") {
      setQuickView("all");
      setStatusFilter("all");
      setUnreadOnly(false);
      return;
    }
    setSlaAtRiskOnly(false);
    setQuickView(view);
    setStatusFilter("all");
    setUnreadOnly(false);
  };

  const createMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "hq_create_support_case",
        {
          p_tenant_id: newTenantId,
          p_subject: newSubject.trim(),
          p_category: newCategory,
          p_description: newDescription.trim(),
          p_priority: newPriority,
          p_assign_to_self: newAssignSelf,
          p_attachments: [],
          p_initial_message: newMessage.trim(),
          p_source: newSource,
          p_tags: newTags,
          p_follow_up_at: newFollowUp ? new Date(newFollowUp).toISOString() : null,
          p_internal_note: newInternalNote.trim() || null,
          p_related_case_id: selectedRelatedCaseId || null,
          p_assign_to:
            newAssignTo && newAssignTo !== CHASTER_SELECT_NONE ? newAssignTo : null,
          p_leave_unassigned:
            !newAssignSelf &&
            (!newAssignTo || newAssignTo === CHASTER_SELECT_NONE),
          p_support_requester_id: selectedRequesterId || null,
        },
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: (caseId) => {
      notify(translate("chaster.hq.support.new_case_created"), {
        type: "success",
      });
      setNewOpen(false);
      setNewTenantId("");
      setNewSubject("");
      setNewMessage("");
      setNewCategory("other");
      setNewPriority("medium");
      setNewAssignSelf(true);
      setTenantQuery("");
      setShowProspectFields(false);
      setProspectOrg("");
      setProspectFirst("");
      setProspectLast("");
      setProspectEmail("");
      setProspectPhone("");
      setProspectNotes("");
      setNewSource("hq");
      setNewTags([]);
      setNewTagInput("");
      setNewFollowUp("");
      setNewInternalNote("");
      setNewAssignTo(CHASTER_SELECT_NONE);
      setNewDescription("");
      setNewAttachmentFiles([]);
      setRequesterSearchQ("");
      setRelatedCaseSearchQ("");
      setSelectedRequesterId("");
      setSelectedRelatedCaseId("");
      void qc.invalidateQueries({ queryKey: ["hq-support-cases"] });
      void qc.invalidateQueries({ queryKey: ["support-staff-unread-total"] });
      navigate(`/hq/support/cases/${caseId}`);
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const createProspectMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await getSupabaseClient().rpc(
        "hq_create_support_prospect_case",
        {
          p_organization_name: prospectOrg.trim(),
          p_contact_first_name: prospectFirst.trim(),
          p_contact_last_name: prospectLast.trim(),
          p_email: prospectEmail.trim() || null,
          p_phone: prospectPhone.trim() || null,
          p_subject: newSubject.trim(),
          p_category: newCategory,
          p_description: newMessage.trim(),
          p_priority: newPriority,
          p_assign_to_self: newAssignSelf,
          p_attachments: [],
          p_notes: prospectNotes.trim() || null,
        },
      );
      if (error) throw error;
      return data as string;
    },
    onSuccess: (caseId) => {
      notify(translate("chaster.hq.support.new_case_created"), {
        type: "success",
      });
      setNewOpen(false);
      setNewTenantId("");
      setNewSubject("");
      setNewMessage("");
      setNewCategory("other");
      setNewPriority("medium");
      setNewAssignSelf(true);
      setTenantQuery("");
      setShowProspectFields(false);
      setProspectOrg("");
      setProspectFirst("");
      setProspectLast("");
      setProspectEmail("");
      setProspectPhone("");
      setProspectNotes("");
      setNewSource("hq");
      setNewTags([]);
      setNewTagInput("");
      setNewFollowUp("");
      setNewInternalNote("");
      setNewAssignTo(CHASTER_SELECT_NONE);
      setNewDescription("");
      setNewAttachmentFiles([]);
      setRequesterSearchQ("");
      setRelatedCaseSearchQ("");
      setSelectedRequesterId("");
      setSelectedRelatedCaseId("");
      void qc.invalidateQueries({ queryKey: ["hq-support-cases"] });
      void qc.invalidateQueries({ queryKey: ["support-staff-unread-total"] });
      navigate(`/hq/support/cases/${caseId}`);
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const onCreateCase = () => {
    if (!newSubject.trim()) {
      notify(translate("chaster.portal.support.validation_subject"), {
        type: "warning",
      });
      return;
    }
    if (!newMessage.trim()) {
      notify(translate("chaster.hq.support.validation_case_description"), {
        type: "warning",
      });
      return;
    }
    if (showProspectFields) {
      if (!prospectOrg.trim()) {
        notify(translate("chaster.hq.support.validation_prospect_org"), {
          type: "warning",
        });
        return;
      }
      if (!prospectEmail.trim() && !prospectPhone.trim()) {
        notify(translate("chaster.hq.support.validation_prospect_contact"), {
          type: "warning",
        });
        return;
      }
      createProspectMut.mutate();
      return;
    }
    if (!newTenantId) {
      notify(translate("chaster.hq.support.validation_tenant"), {
        type: "warning",
      });
      return;
    }
    createMut.mutate();
  };

  const pickerTenants = useMemo(() => {
    const list = [...(dirQ.data ?? [])].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const q = tenantQuery.trim().toLowerCase();
    if (!q) return list.slice(0, 50);
    return list
      .filter(
        (t) =>
          t.company_name.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          (t.primary_contact_email?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 50);
  }, [dirQ.data, tenantQuery]);

  const selectedTenantName =
    (dirQ.data ?? []).find((t) => t.id === newTenantId)?.company_name ?? "";

  const assigneeOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [
      { id: "all", label: translate("chaster.hq.support.filter_assignee_all") },
      {
        id: "unassigned",
        label: translate("chaster.hq.support.unassigned"),
      },
    ];
    for (const id of assigneeIds) {
      opts.push({
        id,
        label: assigneeNamesQ.data?.[id] ?? id.slice(0, 8),
      });
    }
    return opts;
  }, [assigneeIds, assigneeNamesQ.data, translate]);

  const filtersDefault =
    quickView === "all" &&
    statusFilter === "all" &&
    !unreadOnly &&
    tenantFilter === "all" &&
    assigneeFilter === "all" &&
    priorityFilter === "all" &&
    !slaAtRiskOnly &&
    !search.trim();

  const activeFilterCount = [
    statusFilter !== "all",
    tenantFilter !== "all",
    assigneeFilter !== "all",
    priorityFilter !== "all",
    unreadOnly,
    slaAtRiskOnly,
  ].filter(Boolean).length;

  const metricsActiveKey = slaAtRiskOnly
    ? "sla"
    : quickView === "unassigned"
      ? "unassigned"
      : quickView === "unread"
        ? "unread"
        : statusFilter === "open" && quickView === "all"
          ? "open"
          : null;

  const tenantFilterOptions = useMemo(
    () => (dirQ.data ?? []).map((t) => ({ id: t.id, label: t.company_name })),
    [dirQ.data],
  );

  const selectCase = (id: string) => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSearchParams((prev) => {
        const n = new URLSearchParams(prev);
        n.set("caseId", id);
        return n;
      });
    } else {
      navigate(`/hq/support/cases/${id}`);
    }
  };

  const clearCaseSelection = () => {
    setSearchParams((prev) => {
      const n = new URLSearchParams(prev);
      n.delete("caseId");
      return n;
    });
  };

  const clearAllFilters = () => {
    setQuickView("all");
    setStatusFilter("all");
    setUnreadOnly(false);
    setTenantFilter("all");
    setAssigneeFilter("all");
    setPriorityFilter("all");
    setSlaAtRiskOnly(false);
    setSearch("");
    setPage(0);
  };

  const onMetricSelect = (
    key: "open" | "unassigned" | "unread" | "sla" | "new7d" | null,
  ) => {
    setPage(0);
    if (!key) {
      clearAllFilters();
      return;
    }
    if (key === "sla") {
      applyInsightsFilter("sla");
      return;
    }
    setSlaAtRiskOnly(false);
    setStatusFilter("all");
    setUnreadOnly(false);
    if (key === "open") {
      setQuickView("all");
      setStatusFilter("open");
    } else if (key === "unassigned") {
      setQuickView("unassigned");
    } else if (key === "unread") {
      setQuickView("unread");
    } else if (key === "new7d") {
      setQuickView("all");
    }
  };

  if (casesQ.isError) {
    return (
      <ChasterHQGuard>
        <PermissionGate permission="hq.support.cases.read">
          <div className="mx-auto max-w-lg space-y-4 p-8 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {casesQ.error instanceof Error
                ? casesQ.error.message
                : translate("chaster.hq.support.load_error")}
            </p>
            <Button type="button" variant="outline" onClick={() => void casesQ.refetch()}>
              {translate("ra.action.refresh")}
            </Button>
          </div>
        </PermissionGate>
      </ChasterHQGuard>
    );
  }

  return (
    <ChasterHQGuard>
      <PermissionGate permission="hq.support.cases.read">
        <div className="flex min-h-0 flex-1 flex-col">
        <ErrorBoundary
          onError={(error, info) => logCrmError("HqSupportCasesPage", error, info)}
          fallbackRender={({ error, resetErrorBoundary }) => (
            <div className="mx-auto max-w-lg space-y-4 p-8 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
              <p className="text-sm font-medium">Support console error</p>
              <p className="text-xs text-muted-foreground break-words">
                {error instanceof Error ? error.message : String(error)}
              </p>
              <Button type="button" variant="outline" onClick={resetErrorBoundary}>
                {translate("ra.action.refresh")}
              </Button>
            </div>
          )}
        >
        <SupportViewportShell>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-2 sm:px-4 sm:py-3">
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <Headphones className="h-6 w-6 shrink-0 text-primary" />
              <h1 className="text-lg font-semibold tracking-tight">
                {translate("chaster.hq.support.cases_title")}
              </h1>
              <UnreadBadge count={staffUnread.data ?? 0} />
              <p className="hidden w-full text-xs text-muted-foreground sm:block sm:w-auto sm:pl-1">
                {translate("chaster.hq.support.console_subtitle")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {can("hq.support.cases.manage") ? (
                <Button type="button" size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
                  <Plus className="h-4 w-4" />
                  {translate("chaster.hq.support.new_case")}
                </Button>
              ) : null}
              {can("hq.support.faqs.manage") ? (
                <Button asChild variant="outline" size="sm">
                  <Link to="/hq/support/faqs">{translate("chaster.hq.support.faqs_title")}</Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to="/hq/support/sla-policies">
                  <Shield className="h-3.5 w-3.5" />
                  SLA
                </Link>
              </Button>
            </div>
          </header>

          <div className="shrink-0">
          <HqSupportMetricsStrip
            metrics={{
              open: kpis.open + kpis.inProgress + kpis.pendingClient,
              unassigned: kpis.unassigned,
              unread: kpis.unreadClient,
              slaBreached: kpis.slaBreached,
              new7d: kpis.new7d,
            }}
            activeKey={metricsActiveKey}
            onSelect={onMetricSelect}
          />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border/80 bg-background lg:flex-row">
            <section className="flex min-h-0 w-full flex-col border-b border-border/80 lg:w-[380px] lg:max-w-[42%] lg:shrink-0 lg:border-b-0 lg:border-r">
              <div className="shrink-0 space-y-3 border-b border-border/80 p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-9 pl-8"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    placeholder={translate("chaster.hq.support.search_placeholder")}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ["all", "chaster.hq.support.quick_all"],
                      ["my_open", "chaster.hq.support.quick_my_open"],
                      ["unassigned", "chaster.hq.support.quick_unassigned"],
                      ["unread", "chaster.hq.support.quick_unread"],
                    ] as const
                  ).map(([view, labelKey]) => (
                    <Button
                      key={view}
                      type="button"
                      size="sm"
                      variant={quickView === view ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => {
                        setQuickView(view);
                        setSlaAtRiskOnly(false);
                        setPage(0);
                      }}
                    >
                      {translate(labelKey)}
                    </Button>
                  ))}
                  <HqSupportFilterSheet
                    open={filterSheetOpen}
                    onOpenChange={setFilterSheetOpen}
                    statusFilter={statusFilter}
                    onStatusFilter={(v) => {
                      setStatusFilter(v);
                      setPage(0);
                    }}
                    tenantFilter={tenantFilter}
                    onTenantFilter={(v) => {
                      setTenantFilter(v);
                      setPage(0);
                    }}
                    assigneeFilter={assigneeFilter}
                    onAssigneeFilter={(v) => {
                      setAssigneeFilter(v);
                      setPage(0);
                    }}
                    priorityFilter={priorityFilter}
                    onPriorityFilter={(v) => {
                      setPriorityFilter(v);
                      setPage(0);
                    }}
                    sortField={sortField}
                    sortDir={sortDir}
                    onSortChange={(field, dir) => {
                      setSortField(field);
                      setSortDir(dir);
                      setPage(0);
                    }}
                    assigneeOptions={assigneeOptions}
                    tenantOptions={tenantFilterOptions}
                    sortLabel={sortLabel}
                    activeFilterCount={activeFilterCount}
                    onClear={clearAllFilters}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {translate("chaster.hq.support.queue_results", {
                    shown: paged.length,
                    total: sorted.length,
                    all: rows.length,
                  })}
                </p>
              </div>

              <div className={cn(supportScrollAreaClass, "flex-1 p-2")}>
                {casesQ.isPending ? (
                  <div className="space-y-2 p-2">
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                ) : paged.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                    <Inbox className="h-10 w-10 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      {rows.length === 0
                        ? translate("chaster.hq.support.empty_no_cases")
                        : translate("chaster.hq.support.empty")}
                    </p>
                    {rows.length === 0 && filtersDefault && can("hq.support.cases.manage") ? (
                      <Button type="button" size="sm" onClick={() => setNewOpen(true)}>
                        {translate("chaster.hq.support.empty_create_cta")}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {paged.map((c) => {
                      const lm = lastMessagesQ.data?.[c.id];
                      return (
                        <li key={c.id}>
                          <HqSupportCaseListItem
                            row={c}
                            active={selectedCaseId === c.id}
                            unread={unreadIds.has(c.id)}
                            assigneeName={
                              c.assigned_to
                                ? assigneeNamesQ.data?.[c.assigned_to]
                                : undefined
                            }
                            preview={lm?.body ? previewText(lm.body) : undefined}
                            onSelect={() => selectCase(c.id)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {pageCount > 1 ? (
                <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/80 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">
                    {translate("chaster.hq.support.pagination_page", {
                      page: safePage + 1,
                      total: pageCount,
                    })}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={safePage <= 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                    >
                      {translate("chaster.hq.support.pagination_prev")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7"
                      disabled={safePage >= pageCount - 1}
                      onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    >
                      {translate("chaster.hq.support.pagination_next")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="hidden min-h-0 min-w-0 flex-1 flex-col lg:flex">
              {selectedCaseId ? (
                <HqSupportCasePreview caseId={selectedCaseId} onClose={clearCaseSelection} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                  <Inbox className="h-12 w-12 text-muted-foreground/40" />
                  <p className="text-sm font-medium text-foreground">
                    {translate("chaster.hq.support.inbox_select_case")}
                  </p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    {translate("chaster.hq.support.inbox_select_case_hint")}
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>

        </SupportViewportShell>

        <Dialog
            open={newOpen}
            onOpenChange={(o) => {
              setNewOpen(o);
              if (!o) {
                setShowProspectFields(false);
                setTenantPickerOpen(false);
                setProspectOrg("");
                setProspectFirst("");
                setProspectLast("");
                setProspectEmail("");
                setProspectPhone("");
                setProspectNotes("");
              }
            }}
          >
            <DialogContent className="flex max-h-[min(92vh,900px)] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-full">
              <DialogHeader className="shrink-0 space-y-1.5 px-6 pt-6 pr-14 text-left">
                <DialogTitle>
                  {translate("chaster.hq.support.new_case_title")}
                </DialogTitle>
                <DialogDescription>
                  {translate("chaster.hq.support.new_case_desc_unified")}
                </DialogDescription>
              </DialogHeader>
              <div
                className={cn(
                  "min-h-0 flex-1 space-y-8 overflow-y-auto overscroll-contain px-8 py-5",
                  "[scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]",
                  "[&::-webkit-scrollbar]:w-2",
                  "[&::-webkit-scrollbar-track]:bg-transparent",
                  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70",
                  "[&::-webkit-scrollbar-thumb]:hover:bg-border",
                )}
              >
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="hq-case-tenant-search">
                      {translate("chaster.hq.support.new_case_tenant")}
                    </Label>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                      <div className="w-full min-w-0 max-w-md flex-1 space-y-2">
                        <div ref={tenantPickerRef} className="relative w-full">
                          <Search
                            className={cn(
                              "pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-muted-foreground",
                              showProspectFields && "opacity-40",
                            )}
                          />
                          <Input
                            id="hq-case-tenant-search"
                            className="pl-9"
                            value={tenantQuery}
                            disabled={showProspectFields}
                            placeholder={translate(
                              "chaster.hq.support.tenant_search_placeholder",
                            )}
                            onChange={(e) => {
                              setTenantQuery(e.target.value);
                              setTenantPickerOpen(true);
                            }}
                            onFocus={() => {
                              if (!showProspectFields) setTenantPickerOpen(true);
                            }}
                            autoComplete="off"
                          />
                          {!showProspectFields && tenantPickerOpen ? (
                            <div
                              className={cn(
                                "absolute left-0 right-0 top-full z-[60] mt-1.5 overflow-hidden rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-md",
                                "animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-100",
                              )}
                            >
                              <div className="border-b border-border/60 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {translate(
                                  "chaster.hq.support.tenant_picker_recent",
                                )}
                              </div>
                              <div
                                className={cn(
                                  "max-h-56 overflow-y-auto p-1",
                                  "[scrollbar-width:thin] [scrollbar-color:hsl(var(--border))_transparent]",
                                  "[&::-webkit-scrollbar]:w-1.5",
                                  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/60",
                                )}
                              >
                                {pickerTenants.length === 0 ? (
                                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                                    {translate(
                                      "chaster.hq.support.tenant_picker_empty",
                                    )}
                                  </p>
                                ) : (
                                  pickerTenants.map((t) => (
                                    <button
                                      key={t.id}
                                      type="button"
                                      className={cn(
                                        "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/80",
                                        newTenantId === t.id && "bg-muted",
                                      )}
                                      onClick={() => {
                                        setNewTenantId(t.id);
                                        setTenantQuery(t.company_name);
                                        setTenantPickerOpen(false);
                                      }}
                                    >
                                      <span className="font-medium leading-tight">
                                        {t.company_name}
                                      </span>
                                      {t.primary_contact_email ? (
                                        <span className="text-xs text-muted-foreground">
                                          {t.primary_contact_email}
                                        </span>
                                      ) : null}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          ) : null}
                        </div>
                        {!showProspectFields && newTenantId && selectedTenantName ? (
                          <p className="text-xs text-muted-foreground">
                            {translate(
                              "chaster.hq.support.tenant_selected_label",
                              { name: selectedTenantName },
                            )}
                          </p>
                        ) : null}
                        {showProspectFields ? (
                          <p className="text-xs text-amber-700/90 dark:text-amber-200/90">
                            {translate(
                              "chaster.hq.support.new_case_prospect_mode_note",
                            )}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex w-full shrink-0 flex-col justify-start gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 lg:w-56 lg:min-w-[14rem]">
                        <p className="text-xs leading-snug text-muted-foreground">
                          {translate(
                            "chaster.hq.support.new_case_prospect_cta_hint",
                          )}
                        </p>
                        {!showProspectFields ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="gap-2 font-semibold shadow-sm"
                            onClick={() => {
                              setShowProspectFields(true);
                              setNewTenantId("");
                              setTenantQuery("");
                              setTenantPickerOpen(false);
                            }}
                          >
                            <UserPlus className="h-4 w-4 shrink-0" />
                            {translate("chaster.hq.support.new_case_add_prospect")}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2 font-medium"
                            onClick={() => {
                              setShowProspectFields(false);
                              setProspectOrg("");
                              setProspectFirst("");
                              setProspectLast("");
                              setProspectEmail("");
                              setProspectPhone("");
                              setProspectNotes("");
                            }}
                          >
                            <X className="h-4 w-4 shrink-0" />
                            {translate(
                              "chaster.hq.support.new_case_hide_prospect",
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {showProspectFields ? (
                    <div
                      className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-4"
                      id="hq-case-prospect-panel"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium"
                        onClick={() => {
                          setShowProspectFields(false);
                          setProspectOrg("");
                          setProspectFirst("");
                          setProspectLast("");
                          setProspectEmail("");
                          setProspectPhone("");
                          setProspectNotes("");
                        }}
                      >
                        <span className="flex items-center gap-2">
                          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                          {translate(
                            "chaster.hq.support.new_case_prospect_section_title",
                          )}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {translate(
                            "chaster.hq.support.new_case_hide_prospect_short",
                          )}
                        </span>
                      </button>
                      <p className="text-xs text-muted-foreground">
                        {translate("chaster.hq.support.new_case_prospect_hint")}
                      </p>
                      <div className="space-y-1">
                        <Label>
                          {translate("chaster.hq.support.prospect_organization")}
                        </Label>
                        <Input
                          value={prospectOrg}
                          onChange={(e) => setProspectOrg(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label>
                            {translate("chaster.hq.support.prospect_first_name")}
                          </Label>
                          <Input
                            value={prospectFirst}
                            onChange={(e) => setProspectFirst(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>
                            {translate("chaster.hq.support.prospect_last_name")}
                          </Label>
                          <Input
                            value={prospectLast}
                            onChange={(e) => setProspectLast(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>
                          {translate("chaster.hq.support.prospect_email")}
                        </Label>
                        <Input
                          type="email"
                          value={prospectEmail}
                          onChange={(e) => setProspectEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>
                          {translate("chaster.hq.support.prospect_phone")}
                        </Label>
                        <Input
                          value={prospectPhone}
                          onChange={(e) => setProspectPhone(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>
                          {translate("chaster.hq.support.prospect_notes")}
                        </Label>
                        <Textarea
                          rows={2}
                          value={prospectNotes}
                          onChange={(e) => setProspectNotes(e.target.value)}
                          className="resize-y"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* Section 2: Case Details */}
                <section className="space-y-5 rounded-xl border border-border/60 bg-muted/10 p-5 sm:p-6">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    Case details
                  </h3>
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
                    <div className="space-y-1.5 lg:col-span-2">
                      <Label>{translate("chaster.hq.support.new_case_subject")}</Label>
                      <Input
                        value={newSubject}
                        onChange={(e) => setNewSubject(e.target.value)}
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5 lg:col-span-2">
                      <Label>Description</Label>
                      <p className="text-xs text-muted-foreground">
                        Brief summary of the case (separate from the initial message)
                      </p>
                      <Input
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="Short summary..."
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{translate("chaster.hq.support.new_case_category")}</Label>
                    <Select
                      value={newCategory}
                      onValueChange={(v) =>
                        setNewCategory(v as SupportCaseCategory)
                      }
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          [
                            "billing",
                            "technical",
                            "account",
                            "ai_kb",
                            "widget",
                            "other",
                          ] as SupportCaseCategory[]
                        ).map((k) => (
                          <SelectItem key={k} value={k}>
                            {translate(categoryLabelKey(k))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{translate("chaster.hq.support.new_case_priority")}</Label>
                    <Select
                      value={newPriority}
                      onValueChange={(v) =>
                        setNewPriority(v as SupportCasePriority)
                      }
                    >
                      <SelectTrigger className="h-10">
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
                  <div className="space-y-1.5">
                    <Label>Case origin / source</Label>
                    <Select value={newSource} onValueChange={(v) => setNewSource(v as SupportCaseSource)}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
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
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label>Tags</Label>
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {newTags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                          {tag}
                          <button type="button" className="ml-0.5 h-3.5 w-3.5 rounded-full hover:bg-muted inline-flex items-center justify-center" onClick={() => setNewTags((t) => t.filter((x) => x !== tag))}>
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)} placeholder="Add tag..." className="flex-1" onKeyDown={(e) => { if (e.key === "Enter" && newTagInput.trim()) { e.preventDefault(); const t = newTagInput.trim().toLowerCase(); if (!newTags.includes(t)) setNewTags((p) => [...p, t]); setNewTagInput(""); } }} />
                      <Button type="button" variant="outline" size="sm" disabled={!newTagInput.trim()} onClick={() => { const t = newTagInput.trim().toLowerCase(); if (t && !newTags.includes(t)) setNewTags((p) => [...p, t]); setNewTagInput(""); }}>Add</Button>
                    </div>
                  </div>
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label>Related case</Label>
                    <Input value={relatedCaseSearchQ} onChange={(e) => { setRelatedCaseSearchQ(e.target.value); if (!e.target.value) setSelectedRelatedCaseId(""); }} placeholder="Search by case number or subject..." />
                    {relatedCaseResultsQ.data && relatedCaseResultsQ.data.length > 0 && relatedCaseSearchQ.trim().length >= 2 && !selectedRelatedCaseId ? (
                      <div className="rounded-md border bg-popover p-1 max-h-40 overflow-y-auto">
                        {relatedCaseResultsQ.data.map((rc) => (
                          <button key={rc.id} type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted" onClick={() => { setSelectedRelatedCaseId(rc.id); setRelatedCaseSearchQ(`${rc.case_number} - ${rc.subject}`); }}>
                            <span className="font-mono text-xs">{rc.case_number}</span>
                            <span className="truncate">{rc.subject}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {selectedRelatedCaseId ? <p className="text-xs text-green-600">Related case linked</p> : null}
                  </div>
                  </div>
                </section>

                {/* Section 3: Contact / Requester */}
                {!showProspectFields ? (
                  <section className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-5 sm:p-6">
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">
                      Contact / requester
                    </h3>
                    <Input value={requesterSearchQ} onChange={(e) => { setRequesterSearchQ(e.target.value); if (!e.target.value) setSelectedRequesterId(""); }} placeholder="Search contacts by name or email..." />
                    {requesterResultsQ.data && requesterResultsQ.data.length > 0 && requesterSearchQ.trim().length >= 2 && !selectedRequesterId ? (
                      <div className="rounded-md border bg-popover p-1 max-h-40 overflow-y-auto">
                        {requesterResultsQ.data.map((r) => (
                          <button key={r.id} type="button" className="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-sm hover:bg-muted text-left" onClick={() => { setSelectedRequesterId(r.id); setRequesterSearchQ([r.contact_first_name, r.contact_last_name].filter(Boolean).join(" ") || r.email || r.organization_name || ""); }}>
                            <span className="font-medium">{[r.contact_first_name, r.contact_last_name].filter(Boolean).join(" ") || r.organization_name || "Unknown"}</span>
                            {r.email ? <span className="text-xs text-muted-foreground">{r.email}</span> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {selectedRequesterId ? <p className="text-xs text-green-600">Contact linked</p> : null}
                  </section>
                ) : null}

                {/* Section 4: Message & Notes */}
                <section className="space-y-4 rounded-xl border border-border/60 bg-muted/10 p-5 sm:p-6">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    Message &amp; notes
                  </h3>
                  <div className="space-y-1.5">
                    <Label>Initial message *</Label>
                    <Textarea rows={6} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} className="min-h-[9rem] resize-y" placeholder="Describe the issue..." />
                  </div>
                  <div className="space-y-1">
                    <Label>Attachments</Label>
                    <Input type="file" multiple onChange={(e) => setNewAttachmentFiles(Array.from(e.target.files ?? []))} />
                    {newAttachmentFiles.length > 0 ? <p className="text-xs text-muted-foreground">{newAttachmentFiles.length} file(s) selected</p> : null}
                  </div>
                  <div className="space-y-1">
                    <Label>Internal Note (staff only)</Label>
                    <Textarea rows={3} value={newInternalNote} onChange={(e) => setNewInternalNote(e.target.value)} className="min-h-[5rem] resize-y" placeholder="Private note visible only to staff..." />
                  </div>
                </section>

                {/* Section 5: Assignment & Scheduling */}
                <section className="space-y-4 rounded-xl border border-border/60 bg-muted/10 p-5 sm:p-6">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground">
                    Assignment &amp; scheduling
                  </h3>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={newAssignSelf} onChange={(e) => { setNewAssignSelf(e.target.checked); if (e.target.checked) setNewAssignTo(CHASTER_SELECT_NONE); }} />
                    {translate("chaster.hq.support.new_case_assign_self")}
                  </label>
                  {!newAssignSelf ? (
                    <div className="space-y-1">
                      <Label>Assign to Agent</Label>
                      <Select
                        value={newAssignTo || CHASTER_SELECT_NONE}
                        onValueChange={setNewAssignTo}
                      >
                        <SelectTrigger><SelectValue placeholder="Select agent..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CHASTER_SELECT_NONE}>
                            {translate("chaster.hq.support.unassigned")}
                          </SelectItem>
                          {(staffListQ.data ?? []).map((s) => (
                            <SelectItem key={s.user_id} value={s.user_id}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="space-y-1.5">
                    <Label>Follow-up / due date</Label>
                    <Input
                      type="datetime-local"
                      value={newFollowUp}
                      onChange={(e) => setNewFollowUp(e.target.value)}
                      className="h-10 max-w-sm"
                    />
                  </div>
                </section>
              </div>
              <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-muted/15 px-6 py-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewOpen(false)}
                >
                  {translate("chaster.hq.support.new_case_cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={createMut.isPending || createProspectMut.isPending}
                  onClick={() => void onCreateCase()}
                >
                  {createMut.isPending || createProspectMut.isPending
                    ? translate("chaster.hq.support.new_case_submitting")
                    : translate("chaster.hq.support.new_case_submit")}
                </Button>
              </DialogFooter>
            </DialogContent>
        </Dialog>
        </ErrorBoundary>
        </div>
      </PermissionGate>
    </ChasterHQGuard>
  );
}
