import { useTranslate } from "ra-core";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { SupportCaseRow, SupportRequesterRow } from "../supportTypes";
import {
  formatRelativeTime,
  supportPriorityAccent,
  supportPriorityLabelKey,
  supportStatusLabelKey,
  tenantDisplayName,
} from "../lib/supportDisplay";

export type HqCaseListRow = SupportCaseRow & {
  tenants?: { company_name: string } | null;
  support_requesters?: SupportRequesterRow | null;
};

export function HqSupportCaseListItem({
  row,
  active,
  unread,
  assigneeName,
  preview,
  onSelect,
}: {
  row: HqCaseListRow;
  active?: boolean;
  unread?: boolean;
  assigneeName?: string;
  preview?: string;
  onSelect: () => void;
}) {
  const translate = useTranslate();
  const company = tenantDisplayName(row) || translate("chaster.hq.support.prospect_no_tenant");
  const status = row.status ?? "open";
  const priority = row.priority ?? "medium";
  const slaRisk =
    status !== "resolved" &&
    (row.sla_response_breached || row.sla_resolution_breached);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full rounded-lg border border-l-[3px] px-3 py-2.5 text-left transition-all",
        supportPriorityAccent(row.priority),
        active
          ? "border-primary/40 bg-primary/5 shadow-sm ring-1 ring-primary/25"
          : "border-border/70 bg-card hover:border-border hover:bg-muted/30",
        unread && !active && "bg-primary/[0.03]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium leading-snug text-foreground">
              {row.subject}
            </span>
            {unread ? (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-primary"
                aria-label={translate("chaster.hq.support.filter_unread")}
              />
            ) : null}
          </div>
          <p className="truncate text-xs text-muted-foreground">{company}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground/90">
              {row.case_number}
            </span>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
              {translate(supportStatusLabelKey(status))}
            </Badge>
            {(priority === "high" || priority === "urgent") && (
              <Badge
                variant={priority === "urgent" ? "destructive" : "outline"}
                className="h-5 px-1.5 text-[10px] font-normal"
              >
                {translate(supportPriorityLabelKey(priority))}
              </Badge>
            )}
            {slaRisk ? (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px] font-normal">
                SLA
              </Badge>
            ) : null}
            {(row.escalation_level ?? 0) > 0 ? (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                L{row.escalation_level}
              </Badge>
            ) : null}
          </div>
          {preview ? (
            <p className="line-clamp-1 text-[11px] text-muted-foreground/90">{preview}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {formatRelativeTime(row.updated_at)}
          </span>
          <span className="max-w-[5.5rem] truncate text-[10px] text-muted-foreground">
            {row.assigned_to
              ? assigneeName ?? "…"
              : translate("chaster.hq.support.unassigned")}
          </span>
        </div>
        </div>
    </button>
  );
}
