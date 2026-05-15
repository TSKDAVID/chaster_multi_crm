import { Paperclip, Sparkles } from "lucide-react";
import { useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SnippetPicker } from "./SnippetPicker";
import { SnippetManageDialog } from "./SnippetManageDialog";
import type { SupportReplySnippetRow } from "../supportTypes";

export function SupportComposer({
  body,
  onBodyChange,
  files,
  onFilesChange,
  onSend,
  sending,
  suggestPending,
  onSuggest,
  snippets,
  canManageSnippets,
  snippetManageProps,
  disabled,
}: {
  body: string;
  onBodyChange: (v: string) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onSend: () => void;
  sending?: boolean;
  suggestPending?: boolean;
  onSuggest?: () => void;
  snippets: SupportReplySnippetRow[];
  canManageSnippets?: boolean;
  snippetManageProps?: { tenantId: string | null; allowGlobal: boolean };
  disabled?: boolean;
}) {
  const translate = useTranslate();

  return (
    <div className="rounded-xl border border-border/80 bg-muted/20 p-3 sm:p-4">
      <div className="relative">
        <Textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder={translate("chaster.portal.support.thread_placeholder")}
          rows={3}
          disabled={disabled || suggestPending}
          className={cn(
            "min-h-[5.5rem] resize-y bg-background",
            suggestPending && "opacity-60",
          )}
        />
        {suggestPending ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/40">
            <Skeleton className="h-4 w-32" />
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {onSuggest ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || suggestPending}
              onClick={onSuggest}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {translate("chaster.support.suggest_reply")}
            </Button>
          ) : null}
          <SnippetPicker
            snippets={snippets}
            disabled={disabled || suggestPending}
            onInsert={(text) =>
              onBodyChange(body.trim() ? `${body.trim()}\n\n${text}` : text)
            }
          />
          {canManageSnippets && snippetManageProps ? (
            <SnippetManageDialog
              snippets={snippets}
              tenantId={snippetManageProps.tenantId}
              allowGlobal={snippetManageProps.allowGlobal}
            />
          ) : null}
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <Paperclip className="h-4 w-4 shrink-0" />
            <input
              type="file"
              multiple
              className="hidden"
              disabled={disabled}
              onChange={(e) => onFilesChange(Array.from(e.target.files ?? []))}
            />
            <span>{translate("chaster.portal.support.form_attachments")}</span>
          </label>
        </div>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:min-w-0">
          {files.length > 0 ? (
            <span className="max-w-full truncate text-xs text-muted-foreground sm:mr-auto sm:max-w-[50%]">
              {files.map((f) => f.name).join(", ")}
            </span>
          ) : null}
          <Button type="button" onClick={onSend} disabled={disabled || sending || suggestPending}>
            {translate("chaster.portal.support.thread_send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
