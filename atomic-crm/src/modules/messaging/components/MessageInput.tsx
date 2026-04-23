import { useCallback, useState } from "react";
import { useTranslate } from "ra-core";
import { ArrowUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX = 2000;
const WARN = 1800;

type Props = {
  disabled?: boolean;
  replyingToPreview?: string | null;
  onCancelReply?: () => void;
  onSend: (text: string) => void;
  onTyping?: () => void;
};

export function MessageInput({
  disabled,
  replyingToPreview,
  onCancelReply,
  onSend,
  onTyping,
}: Props) {
  const translate = useTranslate();
  const [value, setValue] = useState("");

  const submit = useCallback(() => {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t.slice(0, MAX));
    setValue("");
  }, [value, disabled, onSend]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onChange = (v: string) => {
    if (v.length <= MAX) setValue(v);
    onTyping?.();
  };

  const len = value.length;
  const showCounter = len >= WARN;

  return (
    <div className="border-t border-border p-3 shrink-0 bg-background/95 backdrop-blur-sm">
      {replyingToPreview ? (
        <div className="flex items-start gap-2 mb-2 rounded-md border bg-muted/40 px-2 py-1.5 text-xs">
          <span className="flex-1 line-clamp-2 text-muted-foreground">{replyingToPreview}</span>
          {onCancelReply ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={onCancelReply}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex gap-2 items-end">
        <div className="flex-1 min-w-0">
          <Textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={translate("chaster.messages.type_a_message")}
            disabled={disabled}
            rows={1}
            className={cn(
              "min-h-[44px] max-h-[120px] resize-none",
              showCounter && "border-amber-500/60",
            )}
          />
          {showCounter ? (
            <div className="text-[11px] text-muted-foreground mt-1 text-right">
              {translate("chaster.messages.char_limit_warning", {
                remaining: MAX - len,
              })}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          disabled={disabled || !value.trim()}
          onClick={submit}
          aria-label={translate("chaster.messages.send")}
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
