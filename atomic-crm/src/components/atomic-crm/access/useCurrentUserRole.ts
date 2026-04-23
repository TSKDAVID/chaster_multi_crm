import { useChasterAccess } from "./chasterAccessContext";

/**
 * Phase 3 hook: Chaster HQ vs client portal, team roles, and permission checks.
 * Data comes from `chaster_team`, `tenant_members`, and RPCs `is_chaster_staff` / `get_my_tenant_id`.
 */
export function useCurrentUserRole() {
  const ctx = useChasterAccess();
  return {
    isLoading: ctx.isLoading,
    isOwnerSide: ctx.isOwnerSide,
    /** Role in `chaster_team` when `isOwnerSide`; null otherwise. */
    chasterTeamRole: ctx.chasterTeamRole,
    tenantId: ctx.tenantId,
    /** Role in `tenant_members` for `tenantId`; null if none. */
    tenantMemberRole: ctx.tenantMemberRole,
    can: ctx.can,
    refetch: ctx.refetch,
  };
}
