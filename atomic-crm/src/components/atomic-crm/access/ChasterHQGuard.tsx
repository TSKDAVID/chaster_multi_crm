import { useEffect, useRef, type ReactNode } from "react";
import { Navigate } from "react-router";
import { useNotify, useTranslate } from "ra-core";
import { useCurrentUserRole } from "./useCurrentUserRole";
import { Skeleton } from "@/components/ui/skeleton";

export function ChasterHQGuard({ children }: { children: ReactNode }) {
  const { isOwnerSide, isLoading } = useCurrentUserRole();
  const notify = useNotify();
  const translate = useTranslate();
  const warned = useRef(false);

  useEffect(() => {
    if (!isLoading && !isOwnerSide && !warned.current) {
      warned.current = true;
      notify(translate("chaster.access.hq_denied"), { type: "error" });
    }
  }, [isLoading, isOwnerSide, notify, translate]);

  if (isLoading) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!isOwnerSide) {
    return <Navigate to="/portal" replace />;
  }

  return children;
}
