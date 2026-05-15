import { useTranslate } from "ra-core";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SupportCasePriority, SupportCaseStatus } from "../supportTypes";

function statusLabelKey(status: SupportCaseStatus): string {
  switch (status) {
    case "open":
      return "chaster.portal.support.case_open";
    case "in_progress":
      return "chaster.portal.support.case_in_progress";
    case "pending_client":
      return "chaster.portal.support.case_pending_client";
    case "resolved":
      return "chaster.portal.support.case_resolved";
    default:
      return "chaster.portal.support.case_open";
  }
}

function priorityClass(priority: SupportCasePriority): string {
  switch (priority) {
    case "urgent":
      return "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300";
    case "high":
      return "border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-300";
    case "low":
      return "border-border bg-muted/50 text-muted-foreground";
    default:
      return "border-border bg-background";
  }
}

export function SupportStatusPill({
  status,
  priority,
  className,
}: {
  status: SupportCaseStatus;
  priority?: SupportCasePriority;
  className?: string;
}) {
  const translate = useTranslate();
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Badge variant="secondary" className="font-normal">
        {translate(statusLabelKey(status))}
      </Badge>
      {priority ? (
        <Badge variant="outline" className={cn("font-normal", priorityClass(priority))}>
          {translate(`chaster.hq.support.priority_${priority}`)}
        </Badge>
      ) : null}
    </div>
  );
}
