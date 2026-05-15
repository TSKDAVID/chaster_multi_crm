import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslate } from "ra-core";
import { ErrorBoundary } from "react-error-boundary";
import { ExternalLink, X } from "lucide-react";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SupportCaseThread } from "./SupportCaseThread";
import { SupportStatusPill } from "./SupportStatusPill";
import type { SupportCaseRow, SupportRequesterRow } from "../supportTypes";
import { tenantDisplayName } from "../lib/supportDisplay";

function normalizeCase(r: Record<string, unknown>): SupportCaseRow & {
  tenants: { company_name: string } | null;
  support_requesters: SupportRequesterRow | null;
} {
  const row = r as SupportCaseRow & {
    tenants?: { company_name: string } | null;
    support_requesters?: SupportRequesterRow | null;
  };
  const sr = row.support_requesters;
  return {
    ...row,
    priority: row.priority ?? "medium",
    source: row.source ?? "portal",
    support_requesters:
      sr && typeof sr === "object" && !Array.isArray(sr) ? sr : null,
  };
}

export function HqSupportCasePreview({
  caseId,
  onClose,
}: {
  caseId: string;
  onClose?: () => void;
}) {
  const translate = useTranslate();

  const caseQ = useQuery({
    queryKey: ["support-case", caseId],
    queryFn: async () => {
      const { data, error } = await getSupabaseClient()
        .from("support_cases")
        .select("*, tenants(company_name), support_requesters(*)")
        .eq("id", caseId)
        .maybeSingle();
      if (error) throw error;
      return data ? normalizeCase(data as Record<string, unknown>) : null;
    },
  });

  const c = caseQ.data;

  if (caseQ.isPending) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  if (!c) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {translate("chaster.hq.support.load_error")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/80 bg-muted/15 px-4 py-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {c.case_number}
            </span>
            <SupportStatusPill status={c.status} priority={c.priority} />
          </div>
          <h2 className="text-base font-semibold leading-snug">{c.subject}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {tenantDisplayName(c) || translate("chaster.hq.support.prospect_no_tenant")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="outline" size="sm" asChild className="h-8 gap-1">
            <Link to={`/hq/support/cases/${caseId}`}>
              <ExternalLink className="h-3.5 w-3.5" />
              {translate("chaster.hq.support.open_full_case")}
            </Link>
          </Button>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
              aria-label={translate("ra.action.close")}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <ErrorBoundary
          fallbackRender={({ resetErrorBoundary }) => (
            <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <p>{translate("chaster.hq.support.thread_load_error")}</p>
              <Button type="button" size="sm" variant="outline" onClick={resetErrorBoundary}>
                {translate("ra.action.refresh")}
              </Button>
            </div>
          )}
        >
          <SupportCaseThread caseId={caseId} variant="hq" caseRow={c} />
        </ErrorBoundary>
      </div>
    </div>
  );
}
