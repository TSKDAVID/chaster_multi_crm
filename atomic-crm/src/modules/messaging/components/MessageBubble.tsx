import { useState } from "react";
import { useTranslate } from "ra-core";
import { Pencil, Reply, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMessageDetailTime } from "../utils/formatMessageTime";
import type { MessageRow } from "../hooks/useMessages";

export type LocalMessage = MessageRow & {
  _local?: "sending" | "failed";
};

type Props = {
  message: LocalMessage;
  isOwn: boolean;
  showAvatar: boolean;
  showName: boolean;
  senderName: string;
  canDeleteAny: boolean;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
  quotedPreview?: string | null;
  onJumpQuote?: () => void;
};

export function MessageBubble({
  message,
  isOwn,
  showAvatar,
  showName,
  senderName,
  canDeleteAny,
  onReply,
  onEdit,
  onDelete,
  onRetry,
  quotedPreview,
  onJumpQuote,
}: Props) {
  const translate = useTranslate();
  const [hover, setHover] = useState(false);
  const deleted = message.is_deleted;
  const failed = message._local === "failed";
  const sending = message._local === "sending";

  return (
    <div
      className={cn(
        "group flex gap-2 px-3",
        isOwn ? "flex-row-reverse" : "flex-row",
        showAvatar ? "pb-1" : "pb-0.5",
      )}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="w-8 shrink-0 flex justify-center">
        {showAvatar && !isOwn ? (
          <Avatar className="h-8 w-8 mt-0.5">
            <AvatarFallback className="text-[10px]">
              {senderName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          !isOwn && <div className="w-8" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[min(100%,36rem)] min-w-0 flex flex-col",
          isOwn ? "items-end" : "items-start",
        )}
      >
        {showName && !isOwn ? (
          <span className="text-[11px] text-muted-foreground mb-0.5 px-1">{senderName}</span>
        ) : null}
        {quotedPreview && !deleted ? (
          <button
            type="button"
            onClick={onJumpQuote}
            className={cn(
              "mb-1 w-full text-left text-xs rounded-md border border-border/80 bg-muted/50 px-2 py-1 line-clamp-2",
              isOwn ? "mr-0" : "ml-0",
            )}
          >
            {quotedPreview}
          </button>
        ) : null}
        <div
          className={cn(
            "relative rounded-2xl px-3 py-2 text-sm shadow-sm",
            isOwn ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted",
            deleted && "italic text-muted-foreground bg-muted",
          )}
        >
          <p className="whitespace-pre-wrap break-words">
            {deleted ? translate("chaster.messages.message_deleted") : message.body}
          </p>
          <div
            className={cn(
              "flex items-center gap-2 mt-1 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity",
              isOwn ? "justify-end text-primary-foreground/80" : "text-muted-foreground",
              deleted && "hidden",
            )}
          >
            <span>{formatMessageDetailTime(message.created_at)}</span>
            {message.edited_at ? (
              <span>{translate("chaster.messages.edited")}</span>
            ) : null}
            {sending ? (
              <span className="inline-block h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : null}
            {failed ? (
              <button
                type="button"
                className="underline text-destructive font-medium"
                onClick={onRetry}
              >
                {translate("chaster.messages.failed_retry")}
              </button>
            ) : null}
            {!sending && !failed && isOwn && !deleted ? (
              <span className="opacity-80">{translate("chaster.messages.delivered")}</span>
            ) : null}
          </div>
          {hover && !deleted && !failed ? (
            <div
              className={cn(
                "absolute -top-8 flex gap-1 rounded-md border bg-background shadow-sm p-0.5 z-10",
                isOwn ? "right-0" : "left-0",
              )}
            >
              {onReply ? (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onReply}>
                  <Reply className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {isOwn && onEdit ? (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {(isOwn || canDeleteAny) && onDelete ? (
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
