import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { PresenceInfo } from "../hooks/usePresence";

type Props = {
  title: string;
  subtitle?: string | null;
  isChaster?: boolean;
  presence?: PresenceInfo | null;
};

export function ConversationHeader({ title, subtitle, isChaster, presence }: Props) {
  const initial = title.slice(0, 2).toUpperCase();
  const online = presence?.online;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarFallback
            className={cn(
              isChaster && "bg-primary text-primary-foreground font-semibold text-sm",
            )}
          >
            {isChaster ? "C" : initial}
          </AvatarFallback>
        </Avatar>
        {online ? (
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background"
            title="Online"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{title}</div>
        {subtitle ? <div className="text-xs text-muted-foreground truncate">{subtitle}</div> : null}
      </div>
    </div>
  );
}
