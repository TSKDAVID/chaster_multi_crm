import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
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
  return (
    <ChasterAccessProvider>
      <SupabaseAuthHashRedirect />
      <ClientTenantBranding />
      <Header />
      <main className="max-w-screen-xl mx-auto pt-4 px-4" id="main-content">
        <ErrorBoundary
          FallbackComponent={CrmErrorFallback}
          onError={(error, info) => logCrmError("layout", error, info)}
        >
          <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
            {children}
          </Suspense>
        </ErrorBoundary>
      </main>
      <CrmDebugPanel />
      <Notification />
    </ChasterAccessProvider>
  );
};
