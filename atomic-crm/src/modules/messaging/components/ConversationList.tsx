import { useTranslate } from "ra-core";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ConversationListItem } from "./ConversationListItem";
import type { PresenceInfo } from "../hooks/usePresence";

export type ListRow = {
  id: string;
  title: string;
  preview: string | null;
  timeIso: string | null;
  unread: number;
  isChaster?: boolean;
  otherUserId?: string | null;
  subtitle?: string | null;
};

type Props = {
  loading: boolean;
  sections: { label: string; rows: ListRow[] }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  presenceByUserId?: Map<string, PresenceInfo>;
};

const shimmer =
  "animate-pulse bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:200%_100%]";

export function ConversationList({
  loading,
  sections,
  selectedId,
  onSelect,
  presenceByUserId,
}: Props) {
  const translate = useTranslate();

  if (loading) {
    return (
      <div className="p-3 space-y-3" aria-busy>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 items-center">
            <Skeleton className={cn("h-11 w-11 rounded-full", shimmer)} />
            <div className="flex-1 space-y-2">
              <Skeleton className={cn("h-3 w-2/3", shimmer)} />
              <Skeleton className={cn("h-2 w-full", shimmer)} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const empty = sections.every((s) => s.rows.length === 0);

  if (empty) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {translate("chaster.messages.no_conversations")}
      </div>
    );
  }

  return (
    <div className="py-2 space-y-4 overflow-y-auto flex-1 min-h-0">
      {sections.map((sec) =>
        sec.rows.length === 0 ? null : (
          <div key={sec.label}>
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {sec.label}
            </div>
            <div className="space-y-0.5 px-1">
              {sec.rows.map((row) => (
                <ConversationListItem
                  key={row.id}
                  title={row.title}
                  subtitle={row.subtitle}
                  preview={row.preview}
                  timeIso={row.timeIso}
                  unread={row.unread}
                  active={selectedId === row.id}
                  onClick={() => onSelect(row.id)}
                  isChaster={row.isChaster}
                  presence={
                    row.otherUserId ? presenceByUserId?.get(row.otherUserId) : undefined
                  }
                />
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
