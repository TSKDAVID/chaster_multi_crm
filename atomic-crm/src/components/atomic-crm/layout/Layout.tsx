import { Suspense, type ReactNode } from "react";
import { useLocation } from "react-router";
import { ErrorBoundary } from "react-error-boundary";
import { cn } from "@/lib/utils";
import { isSupportViewportRoute } from "@/modules/support/lib/supportLayout";
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
      <div className="flex min-h-dvh flex-col">
        <Header />
        <main
          id="main-content"
          className={cn(
            supportViewport
              ? "flex min-h-0 flex-1 flex-col overflow-hidden p-0"
              : "mx-auto w-full max-w-screen-xl flex-1 px-4 pt-4",
          )}
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
      </div>
      <CrmDebugPanel />
      <Notification />
    </ChasterAccessProvider>
  );
};
