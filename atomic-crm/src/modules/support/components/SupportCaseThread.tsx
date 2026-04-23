import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import { Paperclip } from "lucide-react";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { useAuthUserId } from "@/components/atomic-crm/access/useAuthUserId";
import { useChasterAccess } from "@/components/atomic-crm/access/chasterAccessContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  SupportAttachmentMeta,
  SupportCaseMessageRow,
  SupportCaseRow,
  SupportCaseStatus,
} from "../supportTypes";

type Variant = "portal" | "hq";

function formatThreadTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function parseMessages(rows: unknown[]): SupportCaseMessageRow[] {
  return rows.map((r) => {
    const o = r as Record<string, unknown>;
    return {
      id: String(o.id),
      case_id: String(o.case_id),
      sender_id: o.sender_id == null ? null : String(o.sender_id),
      body: typeof o.body === "string" ? o.body : "",
      is_system: Boolean(o.is_system),
      metadata:
        o.metadata && typeof o.metadata === "object" && !Array.isArray(o.metadata)
          ? (o.metadata as Record<string, unknown>)
          : {},
      attachments: Array.isArray(o.attachments)
        ? (o.attachments as SupportAttachmentMeta[])
        : [],
      created_at: String(o.created_at ?? ""),
    };
  });
}

function SupportAttachmentLinks({ items }: { items: SupportAttachmentMeta[] }) {
  const signedQ = useQuery({
    queryKey: ["support-attachment-urls", items.map((i) => i.storage_path)],
    enabled: items.length > 0,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      const entries = await Promise.all(
        items.map(async (a) => {
          const { data, error } = await supabase.storage
            .from("support-attachments")
            .createSignedUrl(a.storage_path, 3600);
          if (error) return { a, url: null as string | null };
          return { a, url: data?.signedUrl ?? null };
        }),
      );
      return entries;
    },
  });

  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      {(signedQ.data ?? []).map(({ a, url }) => {
        const isImage = a.mime_type.startsWith("image/");
        return (
          <div key={a.storage_path} className="text-xs">
            {isImage && url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="mb-1 inline-block max-w-[min(100%,18rem)] overflow-hidden rounded-lg border bg-muted/30"
              >
                <img
                  src={url}
                  alt=""
                  className="max-h-40 w-full object-cover"
                />
              </a>
            ) : null}
            <div>
              <a
                href={url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                {a.file_name}
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

export function SupportCaseThread({
  caseId,
  variant,
}: {
  caseId: string;
  variant: Variant;
}) {
  const translate = useTranslate();
  const notify = useNotify();
  const qc = useQueryClient();
  const { data: myId } = useAuthUserId();
  const { tenantId } = useChasterAccess();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const caseQ = useQuery({
    queryKey: ["support-case", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("support_cases")
        .select("*")
        .eq("id", caseId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as Record<string, unknown>;
      return {
        ...(data as SupportCaseRow),
        priority: (row.priority as SupportCaseRow["priority"]) ?? "medium",
        source: (row.source as SupportCaseRow["source"]) ?? "portal",
      };
    },
  });

  const messagesQ = useQuery({
    queryKey: ["support-messages", caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("support_case_messages")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return parseMessages(data ?? []);
    },
  });

  const nameIds = useMemo(() => {
    const s = new Set<string>();
    const c = caseQ.data;
    if (c?.assigned_to) s.add(c.assigned_to);
    for (const m of messagesQ.data ?? []) {
      if (m.sender_id) s.add(m.sender_id);
    }
    const meta = messagesQ.data?.flatMap((m) => {
      const actor = m.metadata?.actor_id;
      return typeof actor === "string" ? [actor] : [];
    });
    for (const id of meta ?? []) s.add(id);
    return [...s];
  }, [caseQ.data, messagesQ.data]);

  const namesQ = useQuery({
    queryKey: ["support-sales-names", nameIds],
    enabled: nameIds.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await getSupabaseClient()
        .from("sales")
        .select("user_id, first_name, last_name, email")
        .in("user_id", nameIds);
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

  const displayName = (userId: string | null | undefined) => {
    if (!userId) return translate("chaster.portal.support.thread_awaiting");
    if (userId === myId) return translate("chaster.portal.support.thread_you");
    return namesQ.data?.[userId] ?? userId.slice(0, 8);
  };

  useEffect(() => {
    if (!caseId || !myId) return;
    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`support-thread-${caseId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_case_messages",
          filter: `case_id=eq.${caseId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["support-messages", caseId] });
          void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "support_cases",
          filter: `id=eq.${caseId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [caseId, myId, qc]);

  useEffect(() => {
    if (!caseId || !myId) return;
    const mark = async () => {
      const rpc =
        variant === "portal"
          ? "mark_support_case_read_portal"
          : "mark_support_case_read_staff";
      const { error } = await getSupabaseClient().rpc(rpc, {
        p_case_id: caseId,
      });
      if (error) {
        notify(translate("chaster.portal.support.thread_mark_read_error"), {
          type: "warning",
        });
        return;
      }
      void qc.invalidateQueries({ queryKey: ["support-portal-unread-total"] });
      void qc.invalidateQueries({ queryKey: ["support-staff-unread-total"] });
      void qc.invalidateQueries({ queryKey: ["hq-support-cases"] });
      void qc.invalidateQueries({ queryKey: ["support-cases-portal"] });
      void qc.invalidateQueries({
        queryKey: ["support-case-read-state-portal"],
      });
    };
    void mark();
  }, [caseId, myId, variant, qc, notify, translate]);

  const sendMut = useMutation({
    mutationFn: async (payload: {
      body: string;
      attachments: SupportAttachmentMeta[];
    }) => {
      const { error } = await getSupabaseClient().from("support_case_messages").insert({
        case_id: caseId,
        sender_id: myId!,
        body: payload.body.trim(),
        is_system: false,
        attachments: payload.attachments,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      setFiles([]);
      void qc.invalidateQueries({ queryKey: ["support-messages", caseId] });
      notify(translate("chaster.portal.support.message_sent"), {
        type: "success",
      });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const reopenMut = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseClient().rpc("reopen_support_case", {
        p_case_id: caseId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
      void qc.invalidateQueries({ queryKey: ["support-messages", caseId] });
      notify(translate("chaster.portal.support.case_reopened"), {
        type: "success",
      });
    },
    onError: (e: Error) => notify(e.message, { type: "error" }),
  });

  const uploadAttachments = async (): Promise<SupportAttachmentMeta[]> => {
    const row = caseQ.data;
    if (!row) return [];
    const tid = row.tenant_id ?? tenantId ?? null;
    const folderPrefix =
      tid != null
        ? `${tid}/${caseId}`
        : variant === "hq"
          ? `prospect/${caseId}`
          : null;
    if (folderPrefix == null) return [];
    const out: SupportAttachmentMeta[] = [];
    const supabase = getSupabaseClient();
    for (const file of files) {
      const objectPath = `${folderPrefix}/${crypto.randomUUID()}_${file.name}`;
      const { error } = await supabase.storage
        .from("support-attachments")
        .upload(objectPath, file, { contentType: file.type || undefined });
      if (error) throw error;
      out.push({
        storage_path: objectPath,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        size: file.size,
      });
    }
    return out;
  };

  const c = caseQ.data;
  const resolved = c?.status === "resolved";

  const onSend = async () => {
    if (!myId || !c) return;
    if (variant === "portal" && c.status === "resolved") return;
    let atts: SupportAttachmentMeta[] = [];
    try {
      atts = await uploadAttachments();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), { type: "error" });
      return;
    }
    const text = body.trim();
    if (text.length === 0 && atts.length === 0) return;
    sendMut.mutate({ body: text || " ", attachments: atts });
  };

  const renderSystem = (m: SupportCaseMessageRow) => {
    const kind = m.metadata?.kind;
    if (kind === "status_changed") {
      const from = String(m.metadata?.from_status ?? "");
      const to = String(m.metadata?.to_status ?? "");
      return (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {translate("chaster.portal.support.thread_system_status", {
            from: translate(statusLabelKey(from as SupportCaseStatus)),
            to: translate(statusLabelKey(to as SupportCaseStatus)),
          })}
        </p>
      );
    }
    if (kind === "assignment_changed") {
      const toAssignee = m.metadata?.to_assignee;
      const name =
        typeof toAssignee === "string" && toAssignee
          ? displayName(toAssignee)
          : translate("chaster.hq.support.unassigned");
      return (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {translate("chaster.portal.support.thread_system_assign")}: {name}
        </p>
      );
    }
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        {translate("chaster.portal.support.thread_system_assign")}
      </p>
    );
  };

  const showCaseMeta = variant === "portal";
  const messages = messagesQ.data ?? [];

  if (caseQ.isPending || !c) {
    return (
      <div className="flex min-h-[280px] flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="flex flex-1 flex-col gap-3 rounded-xl border bg-muted/15 p-4">
          <Skeleton className="h-16 w-[min(100%,20rem)] rounded-2xl" />
          <Skeleton className="ml-auto h-12 w-[min(100%,14rem)] rounded-2xl" />
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  }

  const composer = (
    <div className="rounded-xl border border-border/80 bg-muted/20 p-3 sm:p-4">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={translate("chaster.portal.support.thread_placeholder")}
        rows={3}
        className="min-h-[5.5rem] resize-y bg-background"
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <Paperclip className="h-4 w-4 shrink-0" />
          <input
            type="file"
            multiple
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          <span>{translate("chaster.portal.support.form_attachments")}</span>
        </label>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:min-w-0">
          {files.length > 0 ? (
            <span className="max-w-full truncate text-xs text-muted-foreground sm:mr-auto sm:max-w-[50%]">
              {files.map((f) => f.name).join(", ")}
            </span>
          ) : null}
          <Button
            type="button"
            onClick={() => void onSend()}
            disabled={sendMut.isPending}
          >
            {translate("chaster.portal.support.thread_send")}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-[320px] flex-col gap-5">
      {showCaseMeta ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              {c.case_number}
            </Badge>
            <Badge className="font-normal">
              {translate(statusLabelKey(c.status))}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {c.assigned_to
              ? translate("chaster.portal.support.thread_handled_by", {
                  name: displayName(c.assigned_to),
                })
              : translate("chaster.portal.support.thread_awaiting")}
          </p>
        </div>
      ) : null}

      <div
        className={cn(
          "flex max-h-[min(58vh,520px)] flex-col gap-3 overflow-y-auto rounded-xl border border-border/60 bg-muted/10 p-3 sm:p-4",
        )}
      >
        {messagesQ.isPending ? (
          <div className="flex flex-col gap-3 py-1">
            <Skeleton className="h-16 w-[min(100%,22rem)] rounded-2xl" />
            <Skeleton className="ml-auto h-14 w-[min(100%,16rem)] rounded-2xl" />
            <Skeleton className="h-12 w-[min(100%,18rem)] rounded-2xl" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {variant === "hq"
              ? translate("chaster.hq.support.thread_empty_conversation")
              : translate("chaster.portal.support.thread_empty")}
          </p>
        ) : (
          messages.map((m) =>
            m.is_system ? (
              <div key={m.id} className="flex justify-center px-2">
                <div className="max-w-lg rounded-full border border-border/50 bg-muted/50 px-4 py-2 text-center shadow-sm">
                  {renderSystem(m)}
                  {m.created_at ? (
                    <p className="mt-1 text-[10px] text-muted-foreground/80">
                      {formatThreadTime(m.created_at)}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div
                key={m.id}
                className={cn(
                  "flex w-full",
                  m.sender_id === myId ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[min(100%,28rem)] rounded-2xl border px-3.5 py-2.5 text-sm shadow-sm sm:px-4 sm:py-3",
                    m.sender_id === myId
                      ? "border-primary/25 bg-primary text-primary-foreground"
                      : "border-border/80 bg-background",
                  )}
                >
                  <div
                    className={cn(
                      "mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0",
                      m.sender_id === myId
                        ? "text-primary-foreground/85"
                        : "text-muted-foreground",
                    )}
                  >
                    <span className="text-xs font-medium">
                      {displayName(m.sender_id)}
                    </span>
                    {m.created_at ? (
                      <span className="text-[10px] opacity-80">
                        {formatThreadTime(m.created_at)}
                      </span>
                    ) : null}
                  </div>
                  {m.body.trim() ? (
                    <p
                      className={cn(
                        "whitespace-pre-wrap leading-relaxed",
                        m.sender_id === myId && "text-primary-foreground",
                      )}
                    >
                      {m.body}
                    </p>
                  ) : null}
                  {m.sender_id === myId ? (
                    <div className="[&_a]:text-primary-foreground [&_a]:underline">
                      <SupportAttachmentLinks items={m.attachments} />
                    </div>
                  ) : (
                    <SupportAttachmentLinks items={m.attachments} />
                  )}
                </div>
              </div>
            ),
          )
        )}
      </div>

      {variant === "portal" && resolved ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border/80 bg-muted/10 p-4">
          <p className="text-sm text-muted-foreground">
            {translate("chaster.portal.support.thread_resolved_hint")}
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={reopenMut.isPending}
            onClick={() => reopenMut.mutate()}
          >
            {reopenMut.isPending
              ? translate("chaster.portal.support.thread_reopening")
              : translate("chaster.portal.support.thread_reopen")}
          </Button>
        </div>
      ) : null}

      {variant === "portal" && !resolved ? composer : null}

      {variant === "hq" ? composer : null}
    </div>
  );
}
