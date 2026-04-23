import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import { Plus, Search } from "lucide-react";
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
  SupportCaseRow,
  SupportCaseStatus,
  SupportFaqRow,
} from "@/modules/support/supportTypes";
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

  const createMut = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const { data: caseId, error } = await supabase.rpc(
        "create_support_case",
        {
          p_subject: subject.trim(),
          p_category: category,
          p_body: description.trim(),
          p_attachments: [],
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
      <div>
        <h1 className="text-2xl font-semibold">
          {translate("chaster.portal.support.title")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {translate("chaster.portal.support.subtitle")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
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
              <Accordion type="single" collapsible className="w-full">
                {filteredFaqs.map((f) => (
                  <AccordionItem key={f.id} value={f.id}>
                    <AccordionTrigger className="text-left text-sm">
                      {f.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {f.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>{translate("chaster.portal.support.cases_title")}</CardTitle>
              <CardDescription>
                {translate("chaster.portal.support.list_last_activity")}
              </CardDescription>
            </div>
            <PermissionGate permission="portal.support.create">
              <Button type="button" size="sm" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                {translate("chaster.portal.support.cases_new")}
              </Button>
            </PermissionGate>
          </CardHeader>
          <CardContent className="space-y-2">
            {casesQ.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : (casesQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {translate("chaster.portal.support.cases_empty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {(casesQ.data ?? []).map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/portal/support/cases/${c.id}`}
                      className={cn(
                        "block rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50",
                        unreadCaseIds.has(c.id) && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.subject}</span>
                        {unreadCaseIds.has(c.id) ? (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                        <Badge variant="outline">{c.case_number}</Badge>
                        <Badge variant="secondary">
                          {translate(statusLabelKey(c.status))}
                        </Badge>
                        <span>
                          {translate(categoryLabelKey(c.category))} ·{" "}
                          {new Date(c.updated_at).toLocaleString()}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
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
