import { useTranslate } from "ra-core";
import { Badge } from "@/components/ui/badge";
import { SupportStatusPill } from "./SupportStatusPill";
import type { SupportCasePriority, SupportCaseRow, SupportCaseStatus } from "../supportTypes";

export function SupportCaseHeader({
  caseRow,
  assigneeLabel,
  satisfactionRating,
}: {
  caseRow: Pick<
    SupportCaseRow,
    "case_number" | "subject" | "status" | "priority"
  >;
  assigneeLabel?: string | null;
  satisfactionRating?: number | null;
}) {
  const translate = useTranslate();

  return (
    <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/15 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {caseRow.case_number}
          </Badge>
          <SupportStatusPill
            status={caseRow.status as SupportCaseStatus}
            priority={caseRow.priority as SupportCasePriority}
          />
          {satisfactionRating != null ? (
            <Badge variant="secondary" className="font-normal">
              {translate("chaster.support.csat_badge", { rating: satisfactionRating })}
            </Badge>
          ) : null}
        </div>
        <h2 className="truncate text-base font-semibold">{caseRow.subject}</h2>
      </div>
      {assigneeLabel != null ? (
        <p className="text-sm text-muted-foreground">{assigneeLabel}</p>
      ) : null}
    </div>
  );
}
