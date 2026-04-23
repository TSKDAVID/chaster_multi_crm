import { Link } from "react-router";
import { useTranslate } from "ra-core";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTenantWorkspaceCounts } from "./useTenantWorkspaceCounts";

type StatLinkScope = "portal" | "hq" | "none";

type Props = {
  tenantId: string;
  className?: string;
  /**
   * Where team/KB tiles navigate: client portal routes, HQ workspace routes, or no links.
   * @default portal
   */
  statLinkScope?: StatLinkScope;
};

/**
 * Live counts for portal / HQ “your org” snapshot: team, KB, placeholder product stats.
 */
export function TenantWorkspaceStats({
  tenantId,
  className,
  statLinkScope = "portal",
}: Props) {
  const translate = useTranslate();
  const { teamCount, kbCount } = useTenantWorkspaceCounts(tenantId);

  const teamTo =
    statLinkScope === "portal"
      ? "/portal/team"
      : statLinkScope === "hq"
        ? "/hq/workspace/team"
        : undefined;
  const kbTo =
    statLinkScope === "portal"
      ? "/portal/knowledge-base"
      : statLinkScope === "hq"
        ? "/hq/workspace/knowledge-base"
        : undefined;

  return (
    <div
      className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${className ?? ""}`}
    >
      <StatCard label={translate("chaster.portal.stat_conversations")} value="—" />
      <StatCard label={translate("chaster.portal.stat_ai_resolved")} value="—" />
      <StatCard
        label={translate("chaster.portal.stat_team")}
        value={String(teamCount)}
        to={teamTo}
      />
      <StatCard
        label={translate("chaster.portal.stat_kb")}
        value={String(kbCount)}
        to={kbTo}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  to,
}: {
  label: string;
  value: string;
  to?: string;
}) {
  const translate = useTranslate();
  const body = (
    <Card
      className={
        to
          ? "h-full transition-colors hover:bg-accent/40 hover:border-accent cursor-pointer"
          : undefined
      }
    >
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
        {to ? (
          <p className="text-xs text-muted-foreground pt-1">
            {translate("chaster.portal.stat_card_open")}
          </p>
        ) : null}
      </CardHeader>
    </Card>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    );
  }
  return body;
}
