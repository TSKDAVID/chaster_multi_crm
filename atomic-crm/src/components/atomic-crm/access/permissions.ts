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
export type ChasterTeamRole = "staff" | "admin" | "super_admin";
export type TenantMemberRole = "member" | "admin" | "super_admin";

export type ChasterAccessSnapshot = {
  isOwnerSide: boolean;
  chasterTeamRole: ChasterTeamRole | null;
  tenantId: string | null;
  tenantMemberRole: TenantMemberRole | null;
};

function isChasterRole(
  r: string | null | undefined,
): r is ChasterTeamRole {
  return r === "staff" || r === "admin" || r === "super_admin";
}

function isTenantRole(
  r: string | null | undefined,
): r is TenantMemberRole {
  return r === "member" || r === "admin" || r === "super_admin";
}

function canPortalTenantPermission(
  tenantMemberRole: TenantMemberRole | null,
  permission: string,
): boolean {
  const tr = isTenantRole(tenantMemberRole) ? tenantMemberRole : "member";

  switch (permission) {
    case "portal.view":
      return true;
    case "portal.subscription":
    case "portal.company.delete":
      return tr === "super_admin";
    case "portal.team.invite":
    case "portal.team.remove_member":
    case "portal.team.role_update":
    case "portal.settings.widget":
    case "portal.tenant_settings":
      return tr === "admin" || tr === "super_admin";
    case "portal.kb.upload":
      return tr === "member" || tr === "admin" || tr === "super_admin";
    case "portal.kb.delete":
      return tr === "admin" || tr === "super_admin";
    case "portal.team.promote":
      return tr === "super_admin";
    case "portal.messages.view":
    case "portal.messages.send":
    case "portal.messages.delete_own":
      return tr === "member" || tr === "admin" || tr === "super_admin";
    case "portal.messages.delete_any":
      return tr === "admin" || tr === "super_admin";
    case "portal.messages.hq_thread":
      return tr === "super_admin";
    case "portal.support.view":
    case "portal.support.create":
      return tr === "member" || tr === "admin" || tr === "super_admin";
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
    const r = isChasterRole(ctx.chasterTeamRole)
      ? ctx.chasterTeamRole
      : "staff";
    switch (permission) {
      case "hq.view":
      case "hq.companies.read":
        return true;
      case "hq.companies.write":
      case "hq.provision":
        return r === "admin" || r === "super_admin";
      case "hq.team.manage":
      case "crm.users.delete":
        return r === "super_admin";
      case "hq.messages.view":
      case "hq.messages.send":
        return r === "staff" || r === "admin" || r === "super_admin";
      case "hq.support.cases.read":
        return r === "staff" || r === "admin" || r === "super_admin";
      case "hq.support.cases.manage":
      case "hq.support.faqs.manage":
        return r === "admin" || r === "super_admin";
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
