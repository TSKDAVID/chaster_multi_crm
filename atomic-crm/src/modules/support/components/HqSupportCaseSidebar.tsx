import { useState } from "react";
import { Link } from "react-router";
import { useNotify, useTranslate } from "ra-core";
import { CalendarClock, Link2, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { PermissionGate } from "@/components/atomic-crm/access/PermissionGate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CsatPrompt } from "./CsatPrompt";
import { HqSupportSidebarSection } from "./HqSupportSidebarSection";
import type { HqCaseWorkspaceRow } from "./HqSupportCaseWorkspace";
import {
  supportPriorityLabelKey,
  supportSourceLabelKey,
} from "../lib/supportDisplay";
import type {
  SupportCasePriority,
  SupportCaseSource,
  SupportCaseStatus,
} from "../supportTypes";

type RelatedCase = {
  id: string;
  subject: string;
  case_number: string;
  status: string;
};

type SupportNote = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
};

function TagInput({
  caseId,
  currentTags,
  onUpdate,
}: {
  caseId: string;
  currentTags: string[];
  onUpdate: () => void;
}) {
  const [input, setInput] = useState("");
  const notify = useNotify();
  const addTag = async () => {
    const tag = input.trim().toLowerCase();
    if (!tag || currentTags.includes(tag)) return;
    const { error } = await getSupabaseClient()
      .from("support_cases")
      .update({ tags: [...currentTags, tag] })
      .eq("id", caseId);
    if (error) notify(error.message, { type: "error" });
    else {
      setInput("");
      onUpdate();
    }
  };
  return (
    <div className="flex gap-1.5">
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Add tag..."
        className="h-7 text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void addTag();
          }
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={!input.trim()}
        onClick={() => void addTag()}
      >
        Add
      </Button>
    </div>
  );
}

export function HqSupportCaseSidebar({
  caseRow: c,
  caseId,
  isProspectCase,
  caseTags,
  safeStatus,
  safePriority,
  safeSource,
  setStatus,
  setPriority,
  setSource,
  relatedCase,
  reqOrg,
  setReqOrg,
  reqFirst,
  setReqFirst,
  reqLast,
  setReqLast,
  reqEmail,
  setReqEmail,
  reqPhone,
  setReqPhone,
  reqNotes,
  setReqNotes,
  onSaveRequester,
  requesterSavePending,
  onOpenProvision,
  assignSelf,
  onSave,
  savePending,
  onOpenAssign,
  notes,
  authorNames,
  noteBody,
  setNoteBody,
  onAddNote,
  notePending,
  onCaseInvalidate,
}: {
  caseRow: HqCaseWorkspaceRow;
  caseId: string;
  isProspectCase: boolean;
  caseTags: string[];
  safeStatus: SupportCaseStatus;
  safePriority: SupportCasePriority;
  safeSource: SupportCaseSource;
  setStatus: (v: SupportCaseStatus) => void;
  setPriority: (v: SupportCasePriority) => void;
  setSource: (v: SupportCaseSource) => void;
  relatedCase?: RelatedCase | null;
  reqOrg: string;
  setReqOrg: (v: string) => void;
  reqFirst: string;
  setReqFirst: (v: string) => void;
  reqLast: string;
  setReqLast: (v: string) => void;
  reqEmail: string;
  setReqEmail: (v: string) => void;
  reqPhone: string;
  setReqPhone: (v: string) => void;
  reqNotes: string;
  setReqNotes: (v: string) => void;
  onSaveRequester: () => void;
  requesterSavePending: boolean;
  onOpenProvision: () => void;
  assignSelf: () => void;
  onSave: () => void;
  savePending: boolean;
  onOpenAssign: () => void;
  notes: SupportNote[];
  authorNames?: Record<string, string>;
  noteBody: string;
  setNoteBody: (v: string) => void;
  onAddNote: () => void;
  notePending: boolean;
  onCaseInvalidate: () => void;
}) {
  const translate = useTranslate();
  const notify = useNotify();

  return (
    <div className="space-y-1">
      {c.satisfaction_submitted_at ? (
        <HqSupportSidebarSection title="Customer satisfaction" variant="emphasis">
          <CsatPrompt
            caseId={c.id}
            readOnly
            rating={c.satisfaction_rating ?? null}
            comment={c.satisfaction_comment ?? null}
          />
        </HqSupportSidebarSection>
      ) : null}

      <HqSupportSidebarSection
        title={translate("chaster.hq.support.case_description_title")}
        description={translate("chaster.hq.support.case_description_hint")}
      >
        {c.description?.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {c.description.trim()}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {translate("chaster.hq.support.case_description_empty")}
          </p>
        )}
      </HqSupportSidebarSection>

      {c.related_case_id && relatedCase ? (
        <HqSupportSidebarSection title="Related case">
          <Link
            to={`/hq/support/cases/${relatedCase.id}`}
            className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/80 p-3 transition-colors hover:bg-muted/40"
          >
            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{relatedCase.subject}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{relatedCase.case_number}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {relatedCase.status}
                </Badge>
              </div>
            </div>
          </Link>
        </HqSupportSidebarSection>
      ) : null}

      {isProspectCase && c.support_requesters ? (
        <PermissionGate permission="hq.support.cases.manage">
          <HqSupportSidebarSection
            title={translate("chaster.hq.support.requester_card_title")}
            description={translate("chaster.hq.support.requester_card_hint")}
            variant="emphasis"
          >
            <div className="space-y-1">
              <Label className="text-xs">
                {translate("chaster.hq.support.prospect_organization")}
              </Label>
              <Input value={reqOrg} onChange={(e) => setReqOrg(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">
                  {translate("chaster.hq.support.prospect_first_name")}
                </Label>
                <Input value={reqFirst} onChange={(e) => setReqFirst(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  {translate("chaster.hq.support.prospect_last_name")}
                </Label>
                <Input value={reqLast} onChange={(e) => setReqLast(e.target.value)} />
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
              <Input value={reqPhone} onChange={(e) => setReqPhone(e.target.value)} />
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
              disabled={requesterSavePending}
              onClick={onSaveRequester}
            >
              {translate("chaster.hq.support.requester_save")}
            </Button>
            <Separator />
            <p className="text-sm text-muted-foreground">
              {translate("chaster.hq.support.create_tenant_from_case_desc")}
            </p>
            <Button type="button" onClick={onOpenProvision}>
              {translate("chaster.hq.support.create_tenant_from_case")}
            </Button>
          </HqSupportSidebarSection>
        </PermissionGate>
      ) : null}

      <PermissionGate permission="hq.support.cases.manage">
        <HqSupportSidebarSection
          title={translate("chaster.hq.support.case_detail")}
          description={`${translate("chaster.hq.support.status_label")}, ${translate("chaster.hq.support.record_priority")}, ${translate("chaster.hq.support.record_source")}`}
        >
          <div className="space-y-1">
            <Label className="text-xs">
              {translate("chaster.hq.support.status_label")}
            </Label>
            <Select
              value={safeStatus}
              onValueChange={(v) => setStatus(v as SupportCaseStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">
                  {translate("chaster.portal.support.case_open")}
                </SelectItem>
                <SelectItem value="in_progress">
                  {translate("chaster.portal.support.case_in_progress")}
                </SelectItem>
                <SelectItem value="pending_client">
                  {translate("chaster.portal.support.case_pending_client")}
                </SelectItem>
                <SelectItem value="resolved">
                  {translate("chaster.portal.support.case_resolved")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {translate("chaster.hq.support.record_priority")}
            </Label>
            <Select
              value={safePriority}
              onValueChange={(v) => setPriority(v as SupportCasePriority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["low", "medium", "high", "urgent"] as SupportCasePriority[]).map(
                  (k) => (
                    <SelectItem key={k} value={k}>
                      {translate(supportPriorityLabelKey(k))}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">
              {translate("chaster.hq.support.record_source")}
            </Label>
            <Select
              value={safeSource}
              onValueChange={(v) => setSource(v as SupportCaseSource)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  ["portal", "phone", "email", "hq", "other", "prospect"] as SupportCaseSource[]
                ).map((k) => (
                  <SelectItem key={k} value={k}>
                    {translate(supportSourceLabelKey(k))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Follow-up Date
            </Label>
            {c.follow_up_at ? (
              <div className="flex items-center gap-2">
                <p
                  className={cn(
                    "text-sm font-medium",
                    new Date(c.follow_up_at).getTime() < Date.now() &&
                      c.status !== "resolved" &&
                      "text-red-600",
                  )}
                >
                  {new Date(c.follow_up_at).toLocaleString()}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={async () => {
                    const { error } = await getSupabaseClient()
                      .from("support_cases")
                      .update({ follow_up_at: null })
                      .eq("id", caseId);
                    if (error) notify(error.message, { type: "error" });
                    else onCaseInvalidate();
                  }}
                >
                  Clear
                </Button>
              </div>
            ) : (
              <Input
                type="datetime-local"
                className="text-sm"
                onChange={async (e) => {
                  if (!e.target.value) return;
                  const { error } = await getSupabaseClient()
                    .from("support_cases")
                    .update({
                      follow_up_at: new Date(e.target.value).toISOString(),
                    })
                    .eq("id", caseId);
                  if (error) notify(error.message, { type: "error" });
                  else onCaseInvalidate();
                }}
              />
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Tags
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {caseTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1 text-xs">
                  {tag}
                  <button
                    type="button"
                    className="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-destructive/20"
                    onClick={async () => {
                      const updated = caseTags.filter((t) => t !== tag);
                      const { error } = await getSupabaseClient()
                        .from("support_cases")
                        .update({ tags: updated })
                        .eq("id", caseId);
                      if (error) notify(error.message, { type: "error" });
                      else onCaseInvalidate();
                    }}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <TagInput caseId={caseId} currentTags={caseTags} onUpdate={onCaseInvalidate} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={assignSelf}
              disabled={savePending}
            >
              {translate("chaster.hq.support.assign_self")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenAssign}
              disabled={savePending}
            >
              {translate("chaster.hq.support.assign_pick")}
            </Button>
            <Button type="button" size="sm" onClick={onSave} disabled={savePending}>
              {savePending
                ? translate("chaster.hq.support.saving")
                : translate("chaster.hq.support.save_actions")}
            </Button>
          </div>
        </HqSupportSidebarSection>
      </PermissionGate>

      <HqSupportSidebarSection
        title={translate("chaster.hq.support.internal_notes")}
        description={translate("chaster.hq.support.internal_notes_hint")}
      >
        <ul className="max-h-52 space-y-2 overflow-y-auto text-sm">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-border/60 bg-background/80 px-3 py-2.5"
            >
              <div className="text-xs text-muted-foreground">
                {authorNames?.[n.author_id] ?? n.author_id.slice(0, 8)} ·{" "}
                {new Date(n.created_at).toLocaleString()}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{n.body}</p>
            </li>
          ))}
        </ul>
        <Separator />
        <div className="space-y-2">
          <Label className="text-xs">{translate("chaster.hq.support.internal_add")}</Label>
          <Textarea
            rows={3}
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder={translate("chaster.hq.support.internal_add_placeholder")}
            className="resize-y bg-background"
          />
          <Button
            type="button"
            size="sm"
            disabled={!noteBody.trim() || notePending}
            onClick={onAddNote}
          >
            {translate("chaster.hq.support.internal_add")}
          </Button>
        </div>
      </HqSupportSidebarSection>
    </div>
  );
}
