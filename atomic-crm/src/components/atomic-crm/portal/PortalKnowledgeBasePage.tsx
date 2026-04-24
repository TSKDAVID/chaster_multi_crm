import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import { FileText, HelpCircle, Trash2, Upload } from "lucide-react";
import { PortalQuickNav } from "./PortalQuickNav";
import { TenantPortalGuard } from "../access/TenantPortalGuard";
import { PermissionGate } from "../access/PermissionGate";
import { useCurrentUserRole } from "../access/useCurrentUserRole";
import { useChasterAccess } from "../access/chasterAccessContext";
import { logAuditEvent } from "../access/logAuditEvent";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { uploadFileViaSignedPut } from "./kbUploadWithProgress";

const KB_BUCKET = "knowledge-base";
const KB_MAX_BYTES = 10 * 1024 * 1024;
const CHASTER_BRAIN_API_BASE_URL =
  import.meta.env.VITE_CHASTER_BRAIN_API_URL?.trim() ||
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  "http://127.0.0.1:8010";
const CHASTER_BRAIN_INDEX_TIMEOUT_MS = 45000;

type KbRow = {
  id: string;
  file_name: string;
  file_type: string;
  status: string;
  storage_path: string | null;
  uploaded_at: string;
  uploaded_by: string | null;
  file_size_bytes: number | null;
  content_json: Record<string, unknown> | null;
};

type FaqContent = { question: string; answer: string };

function inferFileType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "txt" || ext === "md") return "txt";
  return "pdf";
}

function isIndexableTextFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "txt" || ext === "md";
}

function isIndexableDocumentFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "pdf" || ext === "txt" || ext === "md";
}

async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = CHASTER_BRAIN_INDEX_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function parseFaqContent(row: KbRow): FaqContent | null {
  if (row.file_type !== "faq" || !row.content_json) return null;
  const q = row.content_json.question;
  const a = row.content_json.answer;
  if (typeof q !== "string" || typeof a !== "string") return null;
  return { question: q, answer: a };
}

function faqDisplayName(question: string): string {
  const t = question.trim();
  if (!t) return "FAQ";
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

export function PortalKnowledgeBasePageContent({
  showPortalQuickNav,
}: {
  showPortalQuickNav: boolean;
}) {
  const translate = useTranslate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { tenantId } = useChasterAccess();
  const { can } = useCurrentUserRole();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteId, setDeleteId] = useState<KbRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqQ, setFaqQ] = useState("");
  const [faqA, setFaqA] = useState("");
  const [faqSaving, setFaqSaving] = useState(false);
  const [previewFaq, setPreviewFaq] = useState<KbRow | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadIndeterminate, setUploadIndeterminate] = useState(false);

  const { data: rows = [], isPending } = useQuery({
    queryKey: ["portal-kb-docs", tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<KbRow[]> => {
      const { data, error } = await getSupabaseClient()
        .from("knowledge_base_documents")
        .select(
          "id, file_name, file_type, status, storage_path, uploaded_at, uploaded_by, file_size_bytes, content_json",
        )
        .eq("tenant_id", tenantId!)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as KbRow[];
    },
  });

  const uploaderIds = [...new Set(rows.map((r) => r.uploaded_by).filter(Boolean))] as string[];

  const { data: uploaderNames = {} } = useQuery({
    queryKey: ["portal-kb-uploaders", uploaderIds],
    enabled: uploaderIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await getSupabaseClient()
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", uploaderIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const s of data ?? []) {
        const row = s as {
          user_id: string;
          first_name: string | null;
          last_name: string | null;
          email: string;
        };
        const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
        map[row.user_id] = name || row.email;
      }
      return map;
    },
  });

  const onPickFile = () => fileInputRef.current?.click();

  const indexUploadedTextDocument = useCallback(
    async ({
      tenantId,
      userId,
      documentId,
      fileName,
      content,
    }: {
      tenantId: string;
      userId: string;
      documentId: string;
      fileName: string;
      content: string;
    }) => {
      const res = await fetchJsonWithTimeout(`${CHASTER_BRAIN_API_BASE_URL}/v1/control/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          source_type: "text",
          source_ref: documentId,
          requested_by: userId,
          payload: {
            title: fileName,
            content,
          },
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as
        | { detail?: string; message?: string }
        | Record<string, unknown>;
      if (!res.ok) {
        throw new Error(
          payload.detail || payload.message || "Failed to index uploaded text document.",
        );
      }
    },
    [],
  );

  const indexUploadedDocumentByRef = useCallback(
    async ({
      tenantId,
      userId,
      documentId,
    }: {
      tenantId: string;
      userId: string;
      documentId: string;
    }) => {
      const res = await fetchJsonWithTimeout(`${CHASTER_BRAIN_API_BASE_URL}/v1/control/index`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          source_type: "document",
          source_ref: documentId,
          requested_by: userId,
          payload: {},
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as
        | { detail?: string; message?: string }
        | Record<string, unknown>;
      if (!res.ok) {
        throw new Error(payload.detail || payload.message || "Failed to index uploaded document.");
      }
    },
    [],
  );

  const uploadKbFile = useCallback(
    async (file: File) => {
      if (!tenantId || !can("portal.kb.upload")) return;

      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["pdf", "txt", "md"].includes(ext)) {
        notify(translate("chaster.portal.kb_error_type"), { type: "error" });
        return;
      }
      if (file.size > KB_MAX_BYTES) {
        notify(translate("chaster.portal.kb_error_size"), { type: "error" });
        return;
      }

      const supabase = getSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        notify(translate("chaster.portal.kb_error_upload"), { type: "error" });
        return;
      }

      const storagePath = `${tenantId}/${crypto.randomUUID()}-${file.name.replace(/[/\\]/g, "_")}`;
      const shouldIndexDocument = isIndexableDocumentFile(file.name);
      const shouldIndexText = isIndexableTextFile(file.name);
      const textContent = shouldIndexText ? (await file.text()).trim() : "";
      if (shouldIndexText && !textContent) {
        notify("Text file is empty. Add content before uploading for indexing.", {
          type: "warning",
        });
        return;
      }

      setUploading(true);
      setUploadIndeterminate(false);
      setUploadProgress(0);
      try {
        const signed = await supabase.storage
          .from(KB_BUCKET)
          .createSignedUploadUrl(storagePath);

        if (!signed.error && signed.data?.signedUrl) {
          await uploadFileViaSignedPut(
            signed.data.signedUrl,
            file,
            (pct) => setUploadProgress(Math.min(90, Math.round(pct * 0.9))),
          );
        } else {
          setUploadIndeterminate(true);
          setUploadProgress(null);
          const { error: upErr } = await supabase.storage
            .from(KB_BUCKET)
            .upload(storagePath, file, { cacheControl: "3600", upsert: false });
          if (upErr) throw upErr;
          setUploadIndeterminate(false);
          setUploadProgress(90);
        }

        setUploadProgress(92);
        const { data: docRow, error: insErr } = await supabase
          .from("knowledge_base_documents")
          .insert({
            tenant_id: tenantId,
            file_name: file.name,
            file_type: inferFileType(file.name),
            storage_path: storagePath,
            status: shouldIndexDocument ? "processing" : "ready",
            uploaded_by: user.id,
            file_size_bytes: file.size,
          })
          .select("id")
          .single();
        if (insErr || !docRow?.id) {
          await supabase.storage.from(KB_BUCKET).remove([storagePath]);
          throw insErr;
        }

        if (shouldIndexDocument) {
          try {
            if (shouldIndexText) {
              await indexUploadedTextDocument({
                tenantId,
                userId: user.id,
                documentId: docRow.id,
                fileName: file.name,
                content: textContent,
              });
            } else {
              await indexUploadedDocumentByRef({
                tenantId,
                userId: user.id,
                documentId: docRow.id,
              });
            }
            const { error: readyErr } = await supabase
              .from("knowledge_base_documents")
              .update({ status: "ready" })
              .eq("id", docRow.id)
              .eq("tenant_id", tenantId);
            if (readyErr) throw readyErr;
          } catch (indexErr) {
            const { error: failedErr } = await supabase
              .from("knowledge_base_documents")
              .update({ status: "failed" })
              .eq("id", docRow.id)
              .eq("tenant_id", tenantId);
            if (failedErr) console.warn("kb index failed status update:", failedErr);
            throw indexErr;
          }
        }

        setUploadProgress(100);

        await logAuditEvent({
          action: "knowledge_document_uploaded",
          tenantId,
          metadata: { file_name: file.name, storage_path: storagePath },
        });

        await queryClient.invalidateQueries({ queryKey: ["portal-kb-docs", tenantId] });
        await queryClient.invalidateQueries({ queryKey: ["portal-stat-kb", tenantId] });
        notify(
          shouldIndexText
            ? "Upload complete and text indexed successfully."
            : shouldIndexDocument
              ? "Upload complete and document indexed successfully."
            : translate("chaster.portal.kb_upload_success"),
          { type: "success" },
        );
      } catch (err) {
        console.error(err);
        notify(
          err instanceof Error ? err.message : translate("chaster.portal.kb_error_upload"),
          { type: "error" },
        );
      } finally {
        setUploading(false);
        setUploadIndeterminate(false);
        setTimeout(() => setUploadProgress(null), 600);
      }
    },
    [
      tenantId,
      can,
      notify,
      translate,
      queryClient,
      indexUploadedTextDocument,
      indexUploadedDocumentByRef,
    ],
  );

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadKbFile(file);
  };

  const onKbDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await uploadKbFile(file);
  };

  const submitFaq = async () => {
    const q = faqQ.trim();
    const a = faqA.trim();
    if (!q || !a) {
      notify(translate("chaster.portal.kb_faq_error_required"), { type: "warning" });
      return;
    }
    if (!tenantId) return;

    const supabase = getSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      notify(translate("chaster.portal.kb_error_upload"), { type: "error" });
      return;
    }

    const content_json = { question: q, answer: a };
    const payload = JSON.stringify(content_json);
    const file_size_bytes = new TextEncoder().encode(payload).length;

    setFaqSaving(true);
    try {
      const { error: insErr } = await supabase.from("knowledge_base_documents").insert({
        tenant_id: tenantId,
        file_name: faqDisplayName(q),
        file_type: "faq",
        storage_path: null,
        status: "ready",
        uploaded_by: user.id,
        file_size_bytes,
        content_json,
      });
      if (insErr) throw insErr;

      await logAuditEvent({
        action: "knowledge_faq_created",
        tenantId,
        metadata: { file_name: faqDisplayName(q) },
      });

      await queryClient.invalidateQueries({ queryKey: ["portal-kb-docs", tenantId] });
      await queryClient.invalidateQueries({ queryKey: ["portal-stat-kb", tenantId] });
      notify(translate("chaster.portal.kb_faq_success"), { type: "success" });
      setFaqOpen(false);
      setFaqQ("");
      setFaqA("");
    } catch (err) {
      console.error(err);
      notify(translate("chaster.portal.kb_error_upload"), { type: "error" });
    } finally {
      setFaqSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId || !tenantId) return;
    setDeleting(true);
    const supabase = getSupabaseClient();
    try {
      if (deleteId.storage_path) {
        const { error: rmErr } = await supabase.storage
          .from(KB_BUCKET)
          .remove([deleteId.storage_path]);
        if (rmErr) console.warn("storage remove:", rmErr);
      }

      const { error: delErr } = await supabase
        .from("knowledge_base_documents")
        .delete()
        .eq("id", deleteId.id)
        .eq("tenant_id", tenantId);
      if (delErr) throw delErr;

      await logAuditEvent({
        action:
          deleteId.file_type === "faq"
            ? "knowledge_faq_deleted"
            : "knowledge_document_deleted",
        tenantId,
        metadata: { file_name: deleteId.file_name, id: deleteId.id },
      });

      await queryClient.invalidateQueries({ queryKey: ["portal-kb-docs", tenantId] });
      await queryClient.invalidateQueries({ queryKey: ["portal-stat-kb", tenantId] });
      notify(translate("ra.notification.deleted", { smart_count: 1 }), {
        type: "success",
      });
      setDeleteId(null);
    } catch (err) {
      console.error(err);
      notify(translate("chaster.portal.kb_error_delete"), { type: "error" });
    } finally {
      setDeleting(false);
    }
  };

  const openPreview = async (row: KbRow) => {
    if (row.file_type === "faq") {
      setPreviewFaq(row);
      return;
    }
    if (!row.storage_path) {
      notify(translate("chaster.portal.kb_error_upload"), { type: "error" });
      return;
    }
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(KB_BUCKET)
      .createSignedUrl(row.storage_path, 60);
    if (error || !data?.signedUrl) {
      notify(translate("chaster.portal.kb_error_upload"), { type: "error" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const previewParsed = previewFaq ? parseFaqContent(previewFaq) : null;

  return (
    <div className="max-w-screen-xl mx-auto p-4 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText className="h-7 w-7" />
            {translate("chaster.portal.kb_title")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {translate("chaster.portal.kb_desc")}
          </p>
        </div>

        {showPortalQuickNav ? <PortalQuickNav /> : null}

        <Card
          className={cn(
            can("portal.kb.upload") &&
              dropActive &&
              "ring-2 ring-primary ring-offset-2 ring-offset-background",
          )}
          onDragOver={
            can("portal.kb.upload")
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }
              : undefined
          }
          onDragEnter={
            can("portal.kb.upload")
              ? (e) => {
                  e.preventDefault();
                  setDropActive(true);
                }
              : undefined
          }
          onDragLeave={
            can("portal.kb.upload")
              ? (e) => {
                  e.preventDefault();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDropActive(false);
                  }
                }
              : undefined
          }
          onDrop={can("portal.kb.upload") ? onKbDrop : undefined}
        >
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="text-base">
                {translate("chaster.portal.kb_title")}
              </CardTitle>
              <CardDescription>
                {translate("chaster.portal.kb_card_formats", {
                  max: formatBytes(KB_MAX_BYTES),
                })}
                {can("portal.kb.upload")
                  ? ` ${translate("chaster.portal.kb_drop_hint")}`
                  : ""}
              </CardDescription>
            </div>
            <PermissionGate permission="portal.kb.upload">
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md"
                  className="hidden"
                  onChange={onFileChange}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!tenantId}
                  onClick={() => setFaqOpen(true)}
                >
                  <HelpCircle className="h-4 w-4 mr-2" />
                  {translate("chaster.portal.kb_add_faq")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={uploading || !tenantId}
                  onClick={onPickFile}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading
                    ? translate("chaster.portal.kb_uploading")
                    : translate("chaster.portal.kb_upload")}
                </Button>
              </div>
            </PermissionGate>
          </CardHeader>
          {uploading ? (
            <div className="px-6 space-y-2">
              {uploadIndeterminate ? (
                <div
                  className="h-2 w-full rounded-full bg-muted overflow-hidden"
                  role="progressbar"
                  aria-label={translate("chaster.portal.kb_upload_progress_label")}
                >
                  <div className="h-full w-1/3 bg-primary motion-safe:animate-pulse" />
                </div>
              ) : uploadProgress != null ? (
                <>
                  <Progress value={uploadProgress} />
                  <p className="text-xs text-muted-foreground">
                    {translate("chaster.portal.kb_upload_progress_pct", {
                      pct: uploadProgress,
                    })}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
          <CardContent>
            {can("portal.kb.upload") && !can("portal.kb.delete") ? (
              <p className="text-xs text-muted-foreground mb-3">
                {translate("chaster.portal.kb_member_delete_hint")}
              </p>
            ) : null}
            {isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                {translate("chaster.portal.kb_empty")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{translate("chaster.portal.kb_col_file")}</TableHead>
                    <TableHead>{translate("chaster.portal.kb_col_type")}</TableHead>
                    <TableHead>{translate("chaster.portal.kb_col_size")}</TableHead>
                    <TableHead>{translate("chaster.portal.kb_col_status")}</TableHead>
                    <TableHead>{translate("chaster.portal.kb_col_uploaded")}</TableHead>
                    <TableHead>{translate("chaster.portal.kb_col_by")}</TableHead>
                    <TableHead className="text-right">
                      {translate("chaster.portal.kb_preview")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium max-w-[240px] truncate">
                        {row.file_name}
                      </TableCell>
                      <TableCell>
                        {row.file_type === "faq" ? (
                          <Badge variant="secondary">
                            {translate("chaster.portal.kb_type_faq")}
                          </Badge>
                        ) : (
                          row.file_type
                        )}
                      </TableCell>
                      <TableCell>{formatBytes(row.file_size_bytes)}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(row.uploaded_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.uploaded_by
                          ? (uploaderNames[row.uploaded_by] ?? "—")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void openPreview(row)}
                        >
                          {translate("chaster.portal.kb_preview")}
                        </Button>
                        <PermissionGate permission="portal.kb.delete">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleteId(row)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </PermissionGate>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={faqOpen} onOpenChange={(o) => !o && setFaqOpen(false)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{translate("chaster.portal.kb_faq_title")}</DialogTitle>
              <DialogDescription>
                {translate("chaster.portal.kb_faq_desc")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="faq-q">{translate("chaster.portal.kb_faq_question")}</Label>
                <Textarea
                  id="faq-q"
                  value={faqQ}
                  onChange={(e) => setFaqQ(e.target.value)}
                  rows={2}
                  className="resize-y min-h-[60px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="faq-a">{translate("chaster.portal.kb_faq_answer")}</Label>
                <Textarea
                  id="faq-a"
                  value={faqA}
                  onChange={(e) => setFaqA(e.target.value)}
                  rows={5}
                  className="resize-y min-h-[120px]"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFaqOpen(false)}
                disabled={faqSaving}
              >
                {translate("chaster.portal.kb_faq_cancel")}
              </Button>
              <Button
                type="button"
                disabled={faqSaving}
                onClick={() => void submitFaq()}
              >
                {faqSaving
                  ? translate("chaster.portal.kb_faq_saving")
                  : translate("chaster.portal.kb_faq_save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!previewFaq} onOpenChange={(o) => !o && setPreviewFaq(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{translate("chaster.portal.kb_faq_preview_title")}</DialogTitle>
            </DialogHeader>
            {previewParsed ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {translate("chaster.portal.kb_faq_question")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{previewParsed.question}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {translate("chaster.portal.kb_faq_answer")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {previewParsed.answer}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {translate("chaster.portal.kb_error_upload")}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setPreviewFaq(null)}>
                {translate("chaster.portal.kb_faq_cancel")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{translate("chaster.portal.kb_confirm_title")}</DialogTitle>
              <DialogDescription>
                {translate("chaster.portal.kb_confirm_desc")}
                {deleteId ? (
                  <span className="block mt-2 font-medium text-foreground">
                    {deleteId.file_name}
                  </span>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteId(null)}
                disabled={deleting}
              >
                {translate("chaster.portal.kb_confirm_cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {translate("chaster.portal.kb_confirm_delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
  );
}

export function PortalKnowledgeBasePage() {
  return (
    <TenantPortalGuard>
      <PortalKnowledgeBasePageContent showPortalQuickNav />
    </TenantPortalGuard>
  );
}
