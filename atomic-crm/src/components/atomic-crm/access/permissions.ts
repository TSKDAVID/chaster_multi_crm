/**
 * Client-side permission keys (defense in depth; RLS remains authoritative).
 *
 * **Chaster HQ (owner side):** companies, billing ops, CRM users, support views.
 * **Business portal (`portal.*`):** always from the **client tenant** membership,
 * even if the user is also on `chaster_team` — so staff testing a client org see
 * the same portal capabilities as that org’s role.
 *
 * **Knowledge base:** clients add content in Portal (member+). HQ company detail
 * KB tab is read-only support. Delete KB rows / Storage objects: admin+ (RLS).
 */
export type HqRole =
  | "hq_owner"
  | "hq_ops_admin"
  | "hq_support_lead"
  | "hq_support_agent"
  | "hq_developer"
  | "hq_analyst";
export type WorkspaceRole =
  | "workspace_owner"
  | "workspace_admin"
  | "workspace_manager"
  | "workspace_member"
  | "workspace_viewer";

export type ChasterAccessSnapshot = {
  isOwnerSide: boolean;
  chasterTeamRole: HqRole | null;
  tenantId: string | null;
  tenantMemberRole: WorkspaceRole | null;
};

export function normalizeHqRole(
  r: string | null | undefined,
): HqRole | null {
  switch (r) {
    case "hq_owner":
      return "hq_owner";
    case "hq_ops_admin":
      return "hq_ops_admin";
    case "hq_support_lead":
      return "hq_support_lead";
    case "hq_support_agent":
      return "hq_support_agent";
    case "hq_developer":
      return "hq_developer";
    case "hq_analyst":
      return "hq_analyst";
    // legacy compatibility
    case "super_admin":
      return "hq_owner";
    case "admin":
      return "hq_ops_admin";
    case "staff":
      return "hq_support_agent";
    default:
      return null;
  }
}

export function normalizeWorkspaceRole(
  r: string | null | undefined,
): WorkspaceRole | null {
  switch (r) {
    case "workspace_owner":
      return "workspace_owner";
    case "workspace_admin":
      return "workspace_admin";
    case "workspace_manager":
      return "workspace_manager";
    case "workspace_member":
      return "workspace_member";
    case "workspace_viewer":
      return "workspace_viewer";
    // legacy compatibility
    case "super_admin":
      return "workspace_owner";
    case "admin":
      return "workspace_admin";
    case "member":
      return "workspace_member";
    default:
      return null;
  }
}

function canPortalTenantPermission(
  tenantMemberRole: WorkspaceRole | null,
  permission: string,
): boolean {
  const tr = normalizeWorkspaceRole(tenantMemberRole) ?? "workspace_member";

  switch (permission) {
    case "portal.view":
      return true;
    case "portal.subscription":
    case "portal.company.delete":
      return tr === "workspace_owner";
    case "portal.team.invite":
    case "workspace.members.view_directory":
    case "workspace.members.invite_email":
    case "portal.team.remove_member":
    case "portal.team.role_update":
    case "portal.settings.widget":
    case "portal.tenant_settings":
      return (
        tr === "workspace_admin" ||
        tr === "workspace_owner" ||
        tr === "workspace_manager"
      );
    case "portal.kb.upload":
      return tr !== "workspace_viewer";
    case "portal.kb.delete":
      return tr === "workspace_admin" || tr === "workspace_owner";
    case "portal.team.promote":
      return tr === "workspace_owner";
    case "portal.messages.view":
    case "portal.messages.send":
    case "portal.messages.delete_own":
      return tr !== "workspace_viewer";
    case "portal.messages.delete_any":
      return tr === "workspace_admin" || tr === "workspace_owner";
    case "portal.messages.hq_thread":
      return tr === "workspace_owner";
    case "portal.support.view":
    case "portal.support.create":
      return tr !== "workspace_viewer";
    default:
      return false;
  }
}

export function canPermission(
  ctx: ChasterAccessSnapshot,
  permission: string,
): boolean {
  if (permission.startsWith("portal.") && ctx.tenantId) {
    return canPortalTenantPermission(ctx.tenantMemberRole, permission);
  }

  if (ctx.isOwnerSide) {
    const r = normalizeHqRole(ctx.chasterTeamRole) ?? "hq_support_agent";
    switch (permission) {
      case "hq.view":
      case "hq.companies.read":
        return true;
      case "hq.companies.write":
      case "hq.provision":
        return r === "hq_owner" || r === "hq_ops_admin";
      case "hq.team.manage":
      case "crm.users.delete":
        return r === "hq_owner";
      case "hq.messages.view":
      case "hq.messages.send":
        return (
          r === "hq_owner" ||
          r === "hq_ops_admin" ||
          r === "hq_support_lead" ||
          r === "hq_support_agent"
        );
      case "hq.support.cases.read":
        return (
          r === "hq_owner" ||
          r === "hq_ops_admin" ||
          r === "hq_support_lead" ||
          r === "hq_support_agent"
        );
      case "hq.support.cases.manage":
      case "hq.support.faqs.manage":
        return (
          r === "hq_owner" ||
          r === "hq_ops_admin" ||
          r === "hq_support_lead"
        );
      case "crm.use":
        return true;
      default:
        return false;
    }
  }

  if (!ctx.tenantId) return false;

  switch (permission) {
    case "crm.use":
      return true;
    default:
      return false;
  }
}
