import { useCallback, useEffect, useRef } from "react";
import { Paperclip } from "lucide-react";
import { useTranslate } from "ra-core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const COMPOSER_MAX_HEIGHT_PX = 160;

/** Minimal reply composer (HQ-safe: no snippets, popovers, or brain hooks). */
export function SupportReplyBox({
  body,
  onBodyChange,
  files,
  onFilesChange,
  onSend,
  sending,
  disabled,
  embedded = false,
}: {
  body: string;
  onBodyChange: (v: string) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onSend: () => void;
  sending?: boolean;
  disabled?: boolean;
  embedded?: boolean;
}) {
  const translate = useTranslate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX);
    el.style.height = `${next}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [body, resizeTextarea]);

  return (
    <div
      className={cn(
        embedded
          ? "rounded-lg border border-border/60 bg-muted/10 p-2.5"
          : "rounded-xl border border-border/80 bg-card p-3 shadow-sm",
      )}
    >
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        onInput={resizeTextarea}
        placeholder={translate("chaster.portal.support.thread_placeholder")}
        rows={1}
        disabled={disabled || sending}
        className={cn(
          "min-h-[2.5rem] resize-none overflow-y-auto border-0 bg-transparent px-0 py-2 shadow-none focus-visible:ring-0",
          embedded ? "text-sm" : "bg-background",
        )}
        style={{ maxHeight: COMPOSER_MAX_HEIGHT_PX }}
      />
      <div
        className={cn(
          "flex flex-col gap-2 border-t border-border/50 pt-2 sm:flex-row sm:items-center sm:justify-between",
          embedded && "pt-1.5",
        )}
      >
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground sm:text-sm">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
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
          <Button type="button" size="sm" onClick={onSend} disabled={disabled || sending}>
            {translate("chaster.portal.support.thread_send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
