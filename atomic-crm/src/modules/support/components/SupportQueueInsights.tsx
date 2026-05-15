import { Link } from "react-router";
import { useTranslate } from "ra-core";
import { AlertTriangle, Clock, Inbox, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SupportCaseRow } from "../supportTypes";

type CaseRow = SupportCaseRow & {
  tenants?: { company_name: string } | null;
  support_requesters?: { organization_name?: string | null } | null;
};

function formatAge(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const hrs = Math.floor(ms / 3600000);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function InsightList({
  items,
  emptyLabel,
}: {
  items: { id: string; label: string; meta?: string }[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            to={`/hq/support/cases/${item.id}`}
            className="block rounded-md border border-border/60 bg-muted/15 px-2.5 py-2 text-sm transition-colors hover:bg-muted/40"
          >
            <span className="line-clamp-1 font-medium text-primary">
              {item.label}
            </span>
            {item.meta ? (
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {item.meta}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function SupportQueueInsights({
  cases,
  unreadIds,
  myId,
  onFilter,
}: {
  cases: CaseRow[];
  unreadIds: Set<string>;
  myId?: string;
  onFilter: (view: "my_open" | "unassigned" | "unread" | "sla") => void;
}) {
  const translate = useTranslate();

  const open = cases.filter((c) => c.status !== "resolved");
  const myOpen = myId
    ? open.filter((c) => c.assigned_to === myId).length
    : 0;
  const unassigned = open.filter((c) => !c.assigned_to).length;
  const slaBreached = open.filter(
    (c) => c.sla_response_breached || c.sla_resolution_breached,
  );

  const oldestOpen = [...open]
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      label: c.subject,
      meta: `${c.case_number} · ${formatAge(c.created_at)} ${translate("chaster.hq.support.insights_open_for")}`,
    }));

  const awaitingReply = cases
    .filter((c) => unreadIds.has(c.id))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      label: c.subject,
      meta: c.case_number,
    }));

  const slaItems = slaBreached.slice(0, 5).map((c) => ({
    id: c.id,
    label: c.subject,
    meta: c.case_number,
  }));

  return (
    <div className="space-y-4">
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            {translate("chaster.hq.support.insights_title")}
          </CardTitle>
          <CardDescription className="text-xs">
            {translate("chaster.hq.support.insights_desc")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-0.5 px-3 py-2.5 text-left"
            onClick={() => onFilter("my_open")}
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Inbox className="h-3.5 w-3.5" />
              {translate("chaster.hq.support.insights_my_queue")}
            </span>
            <span className="text-xl font-semibold tabular-nums">{myOpen}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto flex-col items-start gap-0.5 px-3 py-2.5 text-left"
            onClick={() => onFilter("unassigned")}
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5" />
              {translate("chaster.hq.support.insights_unassigned")}
            </span>
            <span className="text-xl font-semibold tabular-nums">{unassigned}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "h-auto flex-col items-start gap-0.5 px-3 py-2.5 text-left col-span-2",
              slaBreached.length > 0 && "border-red-500/40 bg-red-500/5",
            )}
            onClick={() => onFilter("sla")}
          >
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              {translate("chaster.hq.support.insights_sla")}
            </span>
            <span className="text-xl font-semibold tabular-nums">
              {slaBreached.length}
            </span>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            {translate("chaster.hq.support.insights_oldest_open")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InsightList
            items={oldestOpen}
            emptyLabel={translate("chaster.hq.support.insights_none_open")}
          />
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            {translate("chaster.hq.support.insights_awaiting_reply")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <InsightList
            items={awaitingReply}
            emptyLabel={translate("chaster.hq.support.insights_none_unread")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
