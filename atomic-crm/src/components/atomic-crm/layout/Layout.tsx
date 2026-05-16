import { Suspense, type ReactNode } from "react";
import { useLocation } from "react-router";
import { ErrorBoundary } from "react-error-boundary";
import { cn } from "@/lib/utils";
import { isSupportViewportRoute, SUPPORT_VIEWPORT_HEIGHT } from "@/modules/support/lib/supportLayout";
import { Notification } from "@/components/admin/notification";
import { CrmErrorFallback } from "../debug/CrmErrorFallback";
import { CrmDebugPanel } from "../debug/CrmDebugPanel";
import { logCrmError } from "@/lib/crmDebugLog";
import { Skeleton } from "@/components/ui/skeleton";

import { SupabaseAuthHashRedirect } from "../auth/SupabaseAuthHashRedirect";
import { ChasterAccessProvider } from "../access/chasterAccessContext";
import { ClientTenantBranding } from "./ClientTenantBranding";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import Header from "./Header";

export const Layout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  const { pathname } = useLocation();
  const supportViewport = isSupportViewportRoute(pathname);

  return (
    <ChasterAccessProvider>
      <SupabaseAuthHashRedirect />
      <ClientTenantBranding />
      <Header />
      <main
        id="main-content"
        className={cn(
          supportViewport
            ? "flex max-w-none flex-col overflow-hidden p-0"
            : "mx-auto max-w-screen-xl px-4 pt-4",
        )}
        style={supportViewport ? { height: SUPPORT_VIEWPORT_HEIGHT } : undefined}
      >
        <ErrorBoundary
          FallbackComponent={CrmErrorFallback}
          onError={(error, info) => logCrmError("layout", error, info)}
        >
          <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
            <div
              className={supportViewport ? "flex min-h-0 flex-1 flex-col" : undefined}
            >
              {children}
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
      <CrmDebugPanel />
      <Notification />
    </ChasterAccessProvider>
  );
};
