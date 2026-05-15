import type {
  SupportCasePriority,
  SupportCaseRow,
  SupportCaseStatus,
} from "../supportTypes";

export type SupportCaseSortField =
  | "updated_at"
  | "created_at"
  | "case_number"
  | "subject"
  | "tenant"
  | "priority"
  | "status"
  | "assigned";

export type SupportCaseSortDir = "asc" | "desc";

type SortableCase = SupportCaseRow & {
  tenants?: { company_name: string } | null;
  support_requesters?: { organization_name?: string | null } | null;
};

const PRIORITY_RANK: Record<SupportCasePriority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const STATUS_RANK: Record<SupportCaseStatus, number> = {
  open: 1,
  in_progress: 2,
  pending_client: 3,
  resolved: 4,
};

function tenantLabel(c: SortableCase): string {
  return (
    c.tenants?.company_name?.trim() ||
    c.support_requesters?.organization_name?.trim() ||
    ""
  ).toLowerCase();
}

function compareCaseNumber(a: string, b: string): number {
  const na = a.match(/(\d+)\s*$/);
  const nb = b.match(/(\d+)\s*$/);
  if (na && nb) {
    const diff = Number(na[1]) - Number(nb[1]);
    if (diff !== 0) return diff;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function compareSupportCases(
  a: SortableCase,
  b: SortableCase,
  field: SupportCaseSortField,
  dir: SupportCaseSortDir,
  assigneeNames: Record<string, string>,
): number {
  let cmp = 0;

  switch (field) {
    case "updated_at":
      cmp =
        new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
      break;
    case "created_at":
      cmp =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      break;
    case "case_number":
      cmp = compareCaseNumber(a.case_number, b.case_number);
      break;
    case "subject":
      cmp = a.subject.localeCompare(b.subject, undefined, {
        sensitivity: "base",
      });
      break;
    case "tenant":
      cmp = tenantLabel(a).localeCompare(tenantLabel(b), undefined, {
        sensitivity: "base",
      });
      break;
    case "priority":
      cmp =
        (PRIORITY_RANK[a.priority] ?? 0) - (PRIORITY_RANK[b.priority] ?? 0);
      break;
    case "status":
      cmp = (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0);
      break;
    case "assigned": {
      const la = a.assigned_to
        ? (assigneeNames[a.assigned_to] ?? a.assigned_to).toLowerCase()
        : "\uffff";
      const lb = b.assigned_to
        ? (assigneeNames[b.assigned_to] ?? b.assigned_to).toLowerCase()
        : "\uffff";
      cmp = la.localeCompare(lb, undefined, { sensitivity: "base" });
      break;
    }
    default:
      cmp = 0;
  }

  return dir === "asc" ? cmp : -cmp;
}

export function sortSupportCases<T extends SortableCase>(
  cases: T[],
  field: SupportCaseSortField,
  dir: SupportCaseSortDir,
  assigneeNames: Record<string, string> = {},
): T[] {
  return [...cases].sort((a, b) =>
    compareSupportCases(a, b, field, dir, assigneeNames),
  );
}
