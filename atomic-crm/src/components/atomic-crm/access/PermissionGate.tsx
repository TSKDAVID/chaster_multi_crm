import type { ReactNode } from "react";
import { useCurrentUserRole } from "./useCurrentUserRole";

type PermissionGateProps = {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
};

/** Renders `children` only if `can(permission)`; optional `fallback` otherwise. */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { can, isLoading } = useCurrentUserRole();
  if (isLoading) return fallback;
  if (!can(permission)) return fallback;
  return children;
}
