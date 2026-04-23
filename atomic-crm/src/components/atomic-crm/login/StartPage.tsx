import { useQuery } from "@tanstack/react-query";
import { useDataProvider } from "ra-core";
import { Navigate } from "react-router-dom";

import { SupabaseAuthHashRedirect } from "../auth/SupabaseAuthHashRedirect";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { CrmDataProvider } from "../providers/types";
import { LoginSkeleton } from "./LoginSkeleton";
import { LoginPage } from "./LoginPage";

export const StartPage = () => (
  <>
    <SupabaseAuthHashRedirect />
    <StartPageBody />
  </>
);

function StartPageBody() {
  const dataProvider = useDataProvider<CrmDataProvider>();
  const { disableEmailPasswordAuthentication } = useConfigurationContext();
  const {
    data: isInitialized,
    error,
    isPending,
  } = useQuery({
    queryKey: ["init"],
    queryFn: async () => {
      return dataProvider.isInitialized();
    },
  });

  const routeDecision = isPending
    ? "loading"
    : error
      ? "login_error_fallback"
      : isInitialized
        ? "login_initialized"
        : disableEmailPasswordAuthentication
          ? "login_email_password_disabled"
          : "redirect_sign_up";

  // #region agent log
  fetch("http://127.0.0.1:7612/ingest/62869ee2-e612-4032-a187-2f1d717a20f6", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "935e5d",
    },
    body: JSON.stringify({
      sessionId: "935e5d",
      runId: "signup-routing",
      hypothesisId: "H1_H2",
      location: "StartPage.tsx:StartPageBody",
      message: "Start page routing decision",
      data: {
        isPending,
        isInitialized: Boolean(isInitialized),
        hasError: Boolean(error),
        disableEmailPasswordAuthentication,
        routeDecision,
        pathname: window.location.pathname,
        hash: window.location.hash,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (isPending) return <LoginSkeleton />;
  if (error) return <LoginPage />;
  if (isInitialized) return <LoginPage />;
  if (disableEmailPasswordAuthentication) return <LoginPage />;

  return <Navigate to="/sign-up" />;
}
