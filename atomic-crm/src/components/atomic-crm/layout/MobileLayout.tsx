import { Error } from "@/components/admin/error";
import { Notification } from "@/components/admin/notification";
import { Skeleton } from "@/components/ui/skeleton";
import { Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";

import { SupabaseAuthHashRedirect } from "../auth/SupabaseAuthHashRedirect";
import { ChasterAccessProvider } from "../access/chasterAccessContext";
import { ClientTenantBranding } from "./ClientTenantBranding";
import { useConfigurationLoader } from "../root/useConfigurationLoader";
import { MobileNavigation } from "./MobileNavigation";

export const MobileLayout = ({ children }: { children: ReactNode }) => {
  useConfigurationLoader();
  return (
    <ChasterAccessProvider>
      <SupabaseAuthHashRedirect />
      <ClientTenantBranding />
      <ErrorBoundary FallbackComponent={Error}>
        <Suspense fallback={<Skeleton className="h-12 w-12 rounded-full" />}>
          {children}
        </Suspense>
      </ErrorBoundary>
      <MobileNavigation />
      <Notification mobileOffset={{ bottom: "72px" }} />
    </ChasterAccessProvider>
  );
};
