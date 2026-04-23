import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatMessageListTime } from "../utils/formatMessageTime";
import { UnreadBadge } from "./UnreadBadge";
import type { PresenceInfo } from "../hooks/usePresence";

type Props = {
  title: string;
  subtitle?: string | null;
  preview: string | null;
  timeIso: string | null;
  unread: number;
  active: boolean;
  onClick: () => void;
  isChaster?: boolean;
  presence?: PresenceInfo | null;
};

export function ConversationListItem({
  title,
  subtitle,
  preview,
  timeIso,
  unread,
  active,
  onClick,
  isChaster,
  presence,
}: Props) {
  const initial = title.slice(0, 2).toUpperCase();
  const online = presence?.online;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left flex gap-3 px-3 py-2.5 rounded-lg transition-colors",
        active ? "bg-accent" : "hover:bg-muted/80",
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="h-11 w-11">
          <AvatarFallback
            className={cn(
              "text-xs",
              isChaster && "bg-primary text-primary-foreground font-semibold",
            )}
          >
            {isChaster ? "C" : initial}
          </AvatarFallback>
        </Avatar>
        {online ? (
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium truncate text-sm">{title}</span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {formatMessageListTime(timeIso)}
          </span>
        </div>
        {subtitle ? (
          <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>
        ) : null}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground truncate">
            {preview ?? "—"}
          </span>
          <UnreadBadge count={unread} />
        </div>
      </div>
    </button>
  );
}
