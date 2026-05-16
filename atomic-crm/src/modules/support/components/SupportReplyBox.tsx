import { useCallback, useEffect, useRef } from "react";
import { Paperclip } from "lucide-react";
import { useTranslate } from "ra-core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const COMPOSER_MAX_HEIGHT_PX = 128;
const COMPOSER_MIN_HEIGHT_PX = 36;

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
    el.style.height = `${COMPOSER_MIN_HEIGHT_PX}px`;
    const next = Math.min(
      Math.max(el.scrollHeight, COMPOSER_MIN_HEIGHT_PX),
      COMPOSER_MAX_HEIGHT_PX,
    );
    el.style.height = `${next}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [body, resizeTextarea]);

  const textareaClass = cn(
    "w-full resize-none overflow-y-auto rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs outline-none transition-[color,box-shadow]",
    "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "[field-sizing:fixed]",
    embedded ? "min-h-9" : "min-h-16",
  );

  if (embedded) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/10 p-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          onInput={resizeTextarea}
          placeholder={translate("chaster.portal.support.thread_placeholder")}
          rows={1}
          disabled={disabled || sending}
          className={textareaClass}
          style={{ height: COMPOSER_MIN_HEIGHT_PX, maxHeight: COMPOSER_MAX_HEIGHT_PX }}
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <input
              type="file"
              multiple
              className="hidden"
              disabled={disabled}
              onChange={(e) => onFilesChange(Array.from(e.target.files ?? []))}
            />
            <span className="hidden sm:inline">
              {translate("chaster.portal.support.form_attachments")}
            </span>
          </label>
          <div className="flex min-w-0 items-center gap-2">
            {files.length > 0 ? (
              <span className="max-w-[8rem] truncate text-[10px] text-muted-foreground sm:max-w-[12rem]">
                {files.map((f) => f.name).join(", ")}
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 px-3"
              onClick={onSend}
              disabled={disabled || sending}
            >
              {translate("chaster.portal.support.thread_send")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/80 bg-card p-3 shadow-sm">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => onBodyChange(e.target.value)}
        onInput={resizeTextarea}
        placeholder={translate("chaster.portal.support.thread_placeholder")}
        rows={1}
        disabled={disabled || sending}
        className={textareaClass}
        style={{ maxHeight: COMPOSER_MAX_HEIGHT_PX }}
      />
      <div className="mt-2 flex flex-col gap-2 border-t border-border/50 pt-2 sm:flex-row sm:items-center sm:justify-between">
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
