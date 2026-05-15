import { Paperclip } from "lucide-react";
import { useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** Minimal reply composer (HQ-safe: no snippets, popovers, or brain hooks). */
export function SupportReplyBox({
  body,
  onBodyChange,
  files,
  onFilesChange,
  onSend,
  sending,
  disabled,
}: {
  body: string;
  onBodyChange: (v: string) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onSend: () => void;
  sending?: boolean;
  disabled?: boolean;
}) {
  const translate = useTranslate();

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-sm">
      <Textarea
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        placeholder={translate("chaster.portal.support.thread_placeholder")}
        rows={4}
        disabled={disabled || sending}
        className="min-h-[6rem] resize-y bg-background"
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
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
        <div className="flex items-center gap-2">
          {files.length > 0 ? (
            <span className="max-w-[12rem] truncate text-xs text-muted-foreground">
              {files.map((f) => f.name).join(", ")}
            </span>
          ) : null}
          <Button type="button" onClick={onSend} disabled={disabled || sending}>
            {translate("chaster.portal.support.thread_send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
