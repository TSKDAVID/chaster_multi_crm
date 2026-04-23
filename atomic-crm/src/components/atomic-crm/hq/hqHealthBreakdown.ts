import type { HqTenantDirectoryRow } from "./hqTypes";

export type HqHealthCriterionId =
  | "subscription"
  | "kb_ready"
  | "team"
  | "ai_customized"
  | "activity_7d";

export type HqHealthCriterion = {
  id: HqHealthCriterionId;
  points: number;
  maxPoints: number;
  met: boolean;
};

const MS_7D = 7 * 24 * 60 * 60 * 1000;

function activityWithin7Days(lastActivityAt: string): boolean {
  const t = new Date(lastActivityAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= MS_7D;
}

/** Mirrors `hq_get_tenant_directory` health_score components (ideas §4.1). */
export function hqHealthCriteriaFromDirectoryRow(
  row: HqTenantDirectoryRow,
): HqHealthCriterion[] {
  const subPts =
    row.status === "active" ? 30 : row.status === "trial" ? 20 : 0;
  const kbMet = row.kb_ready_count >= 1;
  const teamMet = row.member_count > 1;
  const activityMet = activityWithin7Days(row.last_activity_at);

  return [
    {
      id: "subscription",
      points: subPts,
      maxPoints: 30,
      met: subPts > 0,
    },
    {
      id: "kb_ready",
      points: kbMet ? 20 : 0,
      maxPoints: 20,
      met: kbMet,
    },
    {
      id: "team",
      points: teamMet ? 15 : 0,
      maxPoints: 15,
      met: teamMet,
    },
    {
      id: "ai_customized",
      points: row.ai_customized ? 15 : 0,
      maxPoints: 15,
      met: row.ai_customized,
    },
    {
      id: "activity_7d",
      points: activityMet ? 20 : 0,
      maxPoints: 20,
      met: activityMet,
    },
  ];
}

export function hqHealthScoreColor(score: number): "red" | "yellow" | "green" {
  if (score <= 40) return "red";
  if (score <= 70) return "yellow";
  return "green";
}
