import type { ReactNode } from "react";
import { Link } from "react-router";
import { useTranslate } from "ra-core";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SupportStatusPill } from "./SupportStatusPill";
import type { SupportCaseRow, SupportRequesterRow } from "../supportTypes";
import { tenantDisplayName } from "../lib/supportDisplay";

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
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-t border-border/80 bg-background">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/80 bg-background px-4 py-3 sm:px-5">
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
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 bg-muted/10 px-4 py-2 sm:px-5">
          {banners}
        </div>
      ) : null}

      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 min-w-0 flex-col border-b border-border/80 bg-background lg:border-b-0 lg:border-r">
          <div className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-5 sm:py-4">
            {conversation}
          </div>
        </section>
        <aside className="flex min-h-0 flex-col overflow-hidden bg-muted/10 lg:overflow-y-auto">
          <div className="sticky top-0 z-10 shrink-0 border-b border-border/60 bg-muted/10 px-4 py-2.5 backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {translate("chaster.hq.support.case_detail")}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
            {sidebar}
          </div>
        </aside>
      </div>
    </div>
  );
}
