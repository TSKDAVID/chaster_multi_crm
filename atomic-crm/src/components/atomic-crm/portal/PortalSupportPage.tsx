import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import { Plus, Search, X, HelpCircle, BookOpen, Inbox } from "lucide-react";
import { TenantPortalGuard } from "../access/TenantPortalGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useChasterAccess } from "../access/chasterAccessContext";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { PortalQuickNav } from "./PortalQuickNav";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type {
  SupportCaseCategory,
  SupportCasePriority,
  SupportCaseRow,
  SupportCaseStatus,
  SupportFaqRow,
} from "@/modules/support/supportTypes";
import { useSupportCaseSearch } from "@/modules/support/hooks/useSupportCaseSearch";
import { SupportInboxLayout } from "@/modules/support/layouts/SupportInboxLayout";
import { SupportCaseThread } from "@/modules/support/components/SupportCaseThread";
import { useAuthUserId } from "../access/useAuthUserId";
import { cn } from "@/lib/utils";

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

export function PortalSupportPageContent({
  showPortalQuickNav,
}: {
  showPortalQuickNav?: boolean;
}) {
  const translate = useTranslate();
  const notify = useNotify();
  const qc = useQueryClient();
  const { tenantId } = useChasterAccess();
  const { data: myId } = useAuthUserId();
  const [faqQ, setFaqQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<SupportCaseCategory>("other");
  const [description, setDescription] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [caseSearch, setCaseSearch] = useState("");
  const [debouncedCaseSearch, setDebouncedCaseSearch] = useState("");
  const [assignMode, setAssignMode] = useState<"me" | "pick" | "unassigned">("me");
  const [assignTo, setAssignTo] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCaseId = searchParams.get("caseId");
  const ftsQ = useSupportCaseSearch("portal", debouncedCaseSearch);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedCaseSearch(caseSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [caseSearch]);

  const faqsQ = useQuery({
    queryKey: ["support-faqs-active"],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("support_faq_entries")
        .select("*")
        .is("archived_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SupportFaqRow[];
    },
  });

  const casesQ = useQuery({
    queryKey: ["support-cases-portal", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("support_cases")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((raw) => {
        const row = raw as Record<string, unknown>;
        return {
          ...(raw as SupportCaseRow),
          priority: (row.priority as SupportCaseRow["priority"]) ?? "medium",
          source: (row.source as SupportCaseRow["source"]) ?? "portal",
        };
      });
    },
  });

  const readStateQ = useQuery({
    queryKey: ["support-case-read-state-portal", myId, casesQ.data?.map((c) => c.id)],
    enabled: !!myId && !!casesQ.data?.length,
    queryFn: async () => {
      const ids = casesQ.data!.map((c) => c.id);
      const { data, error } = await getSupabaseClient()
        .from("support_case_read_state")
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

  const lastMessagesQ = useQuery({
    queryKey: ["support-cases-last-msg-portal", casesQ.data?.map((c) => c.id)],
    enabled: !!casesQ.data?.length,
    queryFn: async () => {
      const ids = casesQ.data!.map((c) => c.id);
      const { data, error } = await getSupabaseClient()
        .from("support_case_messages")
        .select("case_id, sender_id, created_at, is_system")
        .in("case_id", ids)
        .eq("is_system", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const last: Record<
        string,
        { sender_id: string | null; created_at: string }
      > = {};
      for (const row of data ?? []) {
        const o = row as {
          case_id: string;
          sender_id: string | null;
          created_at: string;
        };
        if (!last[o.case_id]) last[o.case_id] = o;
      }
      return last;
    },
  });

  const unreadCaseIds = useMemo(() => {
    const staff = staffIdsQ.data ?? new Set<string>();
    const reads = readStateQ.data ?? {};
    const last = lastMessagesQ.data ?? {};
    const out = new Set<string>();
    for (const c of casesQ.data ?? []) {
      const lm = last[c.id];
      if (!lm?.sender_id) continue;
      if (!staff.has(lm.sender_id)) continue;
      const readAt = reads[c.id];
      const t = new Date(lm.created_at).getTime();
      const r = readAt ? new Date(readAt).getTime() : 0;
      if (t > r) out.add(c.id);
    }
    return out;
  }, [casesQ.data, readStateQ.data, lastMessagesQ.data, staffIdsQ.data]);

  const filteredFaqs = useMemo(() => {
    const q = faqQ.trim().toLowerCase();
    const rows = faqsQ.data ?? [];
    if (!q) return rows;
    return rows.filter(
      (f) =>
        f.question.toLowerCase().includes(q) ||
        f.answer.toLowerCase().includes(q),
    );
  }, [faqsQ.data, faqQ]);

  const groupedFaqs = useMemo(() => {
    const groups: Record<string, SupportFaqRow[]> = {};
    for (const faq of filteredFaqs) {
      const cat = (faq as any).category || "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(faq);
    }
    return groups;
  }, [filteredFaqs]);

  const membersQ = useQuery({
    queryKey: ["portal-support-assignees", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("tenant_members")
        .select("user_id, role, sales(first_name, last_name, email)")
        .eq("tenant_id", tenantId!)
        .in("role", ["member", "admin", "super_admin"]);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const r = row as {
          user_id: string;
          sales: { first_name: string | null; last_name: string | null; email: string | null } | null;
        };
        const fn = [r.sales?.first_name, r.sales?.last_name].filter(Boolean).join(" ").trim();
        return { id: r.user_id, label: fn || r.sales?.email || r.user_id.slice(0, 8) };
      });
    },
  });

  const filteredCases = useMemo(() => {
    let list = casesQ.data ?? [];
    const q = caseSearch.trim().toLowerCase();
    if (q.length >= 2 && ftsQ.data) {
      const ids = new Set(ftsQ.data);
      list = list.filter((c) => ids.has(c.id));
    } else if (q) {
      list = list.filter(
        (c) =>
          c.subject.toLowerCase().includes(q) ||
          c.case_number.toLowerCase().includes(q),
      );
    }
    return list;
  }, [casesQ.data, caseSearch, ftsQ.data]);

  const createMut = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const { data: caseId, error } = await supabase.rpc(
        "create_support_case",
        {
          p_subject: subject.trim(),
          p_category: category,
          p_priority: priority,
          p_body: description.trim(),
          p_attachments: [],
          p_tags: tags,
          p_assign_to: assignMode === "pick" && assignTo ? assignTo : null,
          p_leave_unassigned: assignMode === "unassigned",
        },
      );
      if (error) throw error;
      const id = caseId as string;
      const tid = tenantId!;
      const metas: {
        storage_path: string;
        file_name: string;
        mime_type: string;
        size: number;
      }[] = [];
      for (const file of newFiles) {
        const objectPath = `${tid}/${id}/${crypto.randomUUID()}_${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("support-attachments")
          .upload(objectPath, file, { contentType: file.type || undefined });
        if (upErr) throw upErr;
        metas.push({
          storage_path: objectPath,
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          size: file.size,
        });
      }
      if (metas.length > 0) {
        const { data: firstMsg, error: fmErr } = await supabase
          .from("support_case_messages")
          .select("id")
          .eq("case_id", id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (fmErr) throw fmErr;
        if (firstMsg?.id) {
          const { error: updErr } = await supabase
            .from("support_case_messages")
            .update({ attachments: metas })
            .eq("id", firstMsg.id);
          if (updErr) throw updErr;
        }
      }
      return id;
    },
    onSuccess: () => {
      notify(translate("chaster.portal.support.case_created"), {
        type: "success",
      });
      setNewOpen(false);
      setSubject("");
      setDescription("");
      setNewFiles([]);
      setCategory("other");
      setPriority("medium");
      setTags([]);
      setTagInput("");
      void qc.invalidateQueries({ queryKey: ["support-cases-portal"] });
      void qc.invalidateQueries({ queryKey: ["support-portal-unread-total"] });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const onCreate = () => {
    if (!subject.trim()) {
      notify(translate("chaster.portal.support.validation_subject"), {
        type: "warning",
      });
      return;
    }
    if (!description.trim() && newFiles.length === 0) {
      notify(translate("chaster.portal.support.validation_description"), {
        type: "warning",
      });
      return;
    }
    createMut.mutate();
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {showPortalQuickNav ? <PortalQuickNav /> : null}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/5 via-background to-primary/10 p-6 md:p-8">
        <div className="relative z-10 flex flex-col items-center text-center space-y-4 md:space-y-5">
          <div className="rounded-full bg-primary/10 p-3">
            <HelpCircle className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {translate("chaster.portal.support.title")}
            </h1>
            <p className="text-muted-foreground mt-2 max-w-md mx-auto">
              {translate("chaster.portal.support.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <PermissionGate permission="portal.support.create">
              <Button type="button" onClick={() => setNewOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                {translate("chaster.portal.support.cases_new")}
              </Button>
            </PermissionGate>
            <Button type="button" variant="outline" className="gap-2" onClick={() => document.getElementById("portal-faq-section")?.scrollIntoView({ behavior: "smooth" })}>
              <BookOpen className="h-4 w-4" />
              Browse FAQs
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="portal-faq-section" className="min-w-0">
          <CardHeader>
            <CardTitle>{translate("chaster.portal.support.faq_section")}</CardTitle>
            <CardDescription>
              {translate("chaster.portal.support.faq_search")}
            </CardDescription>
            <div className="relative pt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                value={faqQ}
                onChange={(e) => setFaqQ(e.target.value)}
                placeholder={translate("chaster.portal.support.faq_search")}
              />
            </div>
          </CardHeader>
          <CardContent>
            {faqsQ.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : filteredFaqs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {faqQ.trim()
                  ? translate("chaster.portal.support.faq_empty")
                  : translate("chaster.portal.support.faq_none")}
              </p>
            ) : (
              <>
                {Object.entries(groupedFaqs).map(([category, faqs]) => (
                  <div key={category}>
                    {Object.keys(groupedFaqs).length > 1 ? (
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 mt-3 first:mt-0">{category}</h3>
                    ) : null}
                    <Accordion type="single" collapsible className="w-full">
                      {faqs.map((f) => (
                        <AccordionItem key={f.id} value={f.id}>
                          <AccordionTrigger className="text-left text-sm">{f.question}</AccordionTrigger>
                          <AccordionContent className="text-sm text-muted-foreground whitespace-pre-wrap">{f.answer}</AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>{translate("chaster.portal.support.cases_title")}</CardTitle>
            <CardDescription>
              {translate("chaster.portal.support.list_last_activity")}
            </CardDescription>
            <div className="relative pt-2">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={caseSearch}
                onChange={(e) => setCaseSearch(e.target.value)}
                placeholder={translate("chaster.support.search_cases")}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {casesQ.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : filteredCases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <div className="rounded-full bg-muted p-3">
                  <Inbox className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">
                  {translate("chaster.portal.support.cases_empty")}
                </p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  No support cases yet. Create your first case and our team will help you out.
                </p>
                <PermissionGate permission="portal.support.create">
                  <Button type="button" size="sm" variant="outline" onClick={() => setNewOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create your first case
                  </Button>
                </PermissionGate>
              </div>
            ) : (
              <SupportInboxLayout
                toolbar={null}
                queue={
              <ul className="space-y-2 p-2">
                {filteredCases.map((c) => {
                  const statusColor = c.status === "open" ? "border-l-blue-500" : c.status === "in_progress" ? "border-l-yellow-500" : c.status === "pending_client" ? "border-l-orange-500" : "border-l-green-500";
                  const active = selectedCaseId === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchParams({ caseId: c.id });
                        }}
                        className={cn(
                          "block w-full rounded-lg border border-l-4 px-4 py-3 text-left transition-all hover:shadow-sm hover:bg-muted/30",
                          statusColor,
                          unreadCaseIds.has(c.id) && "bg-primary/5 ring-1 ring-primary/20",
                          active && "ring-2 ring-primary/40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{c.subject}</span>
                              {unreadCaseIds.has(c.id) ? <span className="h-2 w-2 rounded-full bg-primary shrink-0" /> : null}
                            </div>
                            <div className="flex flex-wrap gap-2 mt-1.5">
                              <Badge variant="outline" className="text-[10px]">{c.case_number}</Badge>
                              <Badge variant="secondary" className="text-[10px]">{translate(statusLabelKey(c.status))}</Badge>
                              {c.priority === "high" || c.priority === "urgent" ? (
                                <Badge variant={c.priority === "urgent" ? "destructive" : "outline"} className={cn("text-[10px]", c.priority === "high" && "border-orange-400 text-orange-600")}>
                                  {c.priority === "urgent" ? "Urgent" : "High"}
                                </Badge>
                              ) : null}
                              {(c.escalation_level ?? 0) > 0 ? (
                                <Badge variant="destructive" className="text-[10px]">Escalated</Badge>
                              ) : null}
                              {(c as any).tags?.length > 0 ? (
                                ((c as any).tags as string[]).slice(0, 2).map((tag: string) => (
                                  <Badge key={tag} variant="outline" className="text-[10px] bg-muted/50">{tag}</Badge>
                                ))
                              ) : null}
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{new Date(c.updated_at).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {translate(categoryLabelKey(c.category))} · {new Date(c.updated_at).toLocaleString()}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
                }
                detail={
                  selectedCaseId ? (
                    <div className="flex h-full min-h-[320px] flex-col p-4">
                      <SupportCaseThread caseId={selectedCaseId} variant="portal" />
                    </div>
                  ) : (
                    <p className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                      {translate("chaster.support.inbox_empty_detail")}
                    </p>
                  )
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{translate("chaster.portal.support.cases_new")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{translate("chaster.portal.support.form_subject")}</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{translate("chaster.portal.support.form_category")}</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as SupportCaseCategory)}
              >
                <SelectTrigger>
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
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as SupportCasePriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-gray-400" />Low</span>
                  </SelectItem>
                  <SelectItem value="medium">
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" />Medium</span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" />High</span>
                  </SelectItem>
                  <SelectItem value="urgent">
                    <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" />Urgent</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                    {tag}
                    <button type="button" className="ml-0.5 h-3.5 w-3.5 rounded-full hover:bg-muted inline-flex items-center justify-center" onClick={() => setTags((t) => t.filter((x) => x !== tag))}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add a tag..." className="flex-1" onKeyDown={(e) => { if (e.key === "Enter" && tagInput.trim()) { e.preventDefault(); const t = tagInput.trim().toLowerCase(); if (!tags.includes(t)) setTags((p) => [...p, t]); setTagInput(""); } }} />
                <Button type="button" variant="outline" size="sm" disabled={!tagInput.trim()} onClick={() => { const t = tagInput.trim().toLowerCase(); if (t && !tags.includes(t)) setTags((p) => [...p, t]); setTagInput(""); }}>Add</Button>
              </div>
            </div>
            <div className="space-y-2 border-t pt-3">
              <Label>{translate("chaster.hq.support.new_case_assign_self")}</Label>
              <Select value={assignMode} onValueChange={(v) => setAssignMode(v as typeof assignMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">{translate("chaster.support.assign_to_me")}</SelectItem>
                  <SelectItem value="pick">{translate("chaster.support.assign_pick")}</SelectItem>
                  <SelectItem value="unassigned">{translate("chaster.support.assign_unassigned")}</SelectItem>
                </SelectContent>
              </Select>
              {assignMode === "pick" ? (
                <Select value={assignTo} onValueChange={setAssignTo}>
                  <SelectTrigger>
                    <SelectValue placeholder={translate("chaster.support.assign_pick")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(membersQ.data ?? []).map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>{translate("chaster.portal.support.form_description")}</Label>
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>{translate("chaster.portal.support.form_attachments")}</Label>
              <Input
                type="file"
                multiple
                onChange={(e) =>
                  setNewFiles(Array.from(e.target.files ?? []))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewOpen(false)}
            >
              {translate("chaster.portal.support.form_cancel")}
            </Button>
            <Button
              type="button"
              disabled={createMut.isPending}
              onClick={() => void onCreate()}
            >
              {createMut.isPending
                ? translate("chaster.portal.support.form_submitting")
                : translate("chaster.portal.support.form_submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PortalSupportPage() {
  return (
    <TenantPortalGuard>
      <PermissionGate
        permission="portal.support.view"
        fallback={
          <div className="p-6 text-sm text-muted-foreground">
            Access denied.
          </div>
        }
      >
        <PortalSupportPageContent showPortalQuickNav />
      </PermissionGate>
    </TenantPortalGuard>
  );
}
