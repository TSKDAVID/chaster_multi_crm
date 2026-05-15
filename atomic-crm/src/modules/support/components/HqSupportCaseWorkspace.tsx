import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslate } from "ra-core";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupportStatusPill } from "./SupportStatusPill";
import type { SupportCaseRow, SupportRequesterRow } from "../supportTypes";
import { tenantDisplayName } from "../lib/supportDisplay";
import { cn } from "@/lib/utils";

export type HqCaseWorkspaceRow = SupportCaseRow & {
  tenants?: { company_name: string } | null;
  support_requesters?: SupportRequesterRow | null;
};

export function HqSupportCaseWorkspace({
  caseRow,
  assigneeLabel,
  isProspect,
  toolbarActions,
  conversation,
  sidebar,
  banners,
}: {
  caseRow: HqCaseWorkspaceRow;
  assigneeLabel: string;
  isProspect?: boolean;
  toolbarActions?: ReactNode;
  conversation: ReactNode;
  sidebar: ReactNode;
  banners?: ReactNode;
}) {
  const translate = useTranslate();

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] min-h-[520px] max-w-[1600px] flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/80 bg-muted/15 px-4 py-3 sm:px-5">
        <Button variant="ghost" size="sm" asChild className="h-8 gap-1 px-2">
          <Link to="/hq/support/cases">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">
              {translate("chaster.hq.support.back_list")}
            </span>
          </Link>
        </Button>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {caseRow.case_number}
            </span>
            <SupportStatusPill status={caseRow.status} priority={caseRow.priority} />
            {isProspect ? (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-200">
                {translate("chaster.hq.support.prospect_badge")}
              </span>
            ) : null}
          </div>
          <h1 className="truncate text-base font-semibold sm:text-lg">
            {caseRow.subject}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {tenantDisplayName(caseRow) ||
              translate("chaster.hq.support.prospect_no_tenant")}
            <span className="mx-1.5 text-muted-foreground/50">·</span>
            {translate("chaster.hq.support.assignee_label")}: {assigneeLabel}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {caseRow.tenant_id ? (
            <Button variant="outline" size="sm" asChild className="h-8 gap-1">
              <Link to={`/hq/companies/${caseRow.tenant_id}`}>
                <ExternalLink className="h-3.5 w-3.5" />
                {translate("chaster.hq.support.open_tenant")}
              </Link>
            </Button>
          ) : null}
          {toolbarActions}
        </div>
      </header>

      {banners ? (
        <div className="shrink-0 space-y-2 border-b border-border/80 px-4 py-2 sm:px-5">
          {banners}
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex min-h-0 flex-col border-b border-border/80 lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-border/60 px-4 py-2 sm:px-5">
            <p className="text-xs font-medium text-muted-foreground">
              {translate("chaster.hq.support.conversation")}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{conversation}</div>
        </section>
        <aside
          className={cn(
            "min-h-0 overflow-y-auto bg-muted/10 p-4 sm:p-5",
            "max-h-[40vh] lg:max-h-none",
          )}
        >
          {sidebar}
        </aside>
      </div>
    </div>
  );
}
