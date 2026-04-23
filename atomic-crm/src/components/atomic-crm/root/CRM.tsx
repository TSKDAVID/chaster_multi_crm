import type {
  CoreAdminProps,
  AuthProvider,
  DashboardComponent,
  LayoutComponent,
} from "ra-core";
import { CustomRoutes, localStorageStore, Resource } from "ra-core";
import { useEffect, useMemo } from "react";
import { Route } from "react-router";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { Admin } from "@/components/admin/admin";
import { ForgotPasswordPage } from "@/components/supabase/forgot-password-page";
import { SetPasswordPage } from "@/components/supabase/set-password-page";
import { resolveChasterPostAuthPath } from "../auth/chasterPostAuthPath";
import { AuthInviteErrorPage } from "../auth/AuthInviteErrorPage";
import { SetPasswordRoute } from "../auth/SetPasswordRoute";
import { OAuthConsentPage } from "@/components/supabase/oauth-consent-page";

import { ChasterHQGuard } from "../access/ChasterHQGuard";
import companies from "../companies";
import contacts from "../contacts";
import { RoleHomeRedirect } from "../dashboard/RoleHomeRedirect";
import deals from "../deals";
import { HqDashboardPage } from "../hq/HqDashboardPage";
import { HqNewTenantPage } from "../hq/HqNewTenantPage";
import { HqTenantDetailPage } from "../hq/HqTenantDetailPage";
import { Layout } from "../layout/Layout";
import { MobileLayout } from "../layout/MobileLayout";
import { SignupPage } from "../login/SignupPage";
import { ConfirmationRequired } from "../login/ConfirmationRequired";
import { ImportPage } from "../misc/ImportPage";
import {
  getAuthProvider as defaultAuthProviderBuilder,
  getDataProvider as defaultDataProviderBuilder,
} from "../providers/supabase";
import sales from "../sales";
import { SettingsPageMobile } from "../settings/SettingsPageMobile";
import { ProfilePage } from "../settings/ProfilePage";
import { SettingsPage } from "../settings/SettingsPage";
import {
  CONFIGURATION_STORE_KEY,
  type ConfigurationContextValue,
} from "./ConfigurationContext";
import type { CrmDataProvider } from "../providers/types";
import {
  defaultCompanySectors,
  defaultCurrency,
  defaultDarkModeLogo,
  defaultDealCategories,
  defaultDealPipelineStatuses,
  defaultDealStages,
  defaultLightModeLogo,
  defaultNoteStatuses,
  defaultTaskTypes,
  defaultTitle,
} from "./defaultConfiguration";
import { i18nProvider as defaulti18nProvider } from "../providers/commons/i18nProvider";
import { StartPage } from "../login/StartPage.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { MobileTasksList } from "../tasks/MobileTasksList.tsx";
import { ContactListMobile } from "../contacts/ContactList.tsx";
import { ContactShow } from "../contacts/ContactShow.tsx";
import { CompanyShow } from "../companies/CompanyShow.tsx";
import { NoteShowPage } from "../notes/NoteShowPage.tsx";
import { PortalHomePage } from "../portal/PortalHomePage";
import { PortalKnowledgeBasePage } from "../portal/PortalKnowledgeBasePage";
import { PortalSubscriptionPage } from "../portal/PortalSubscriptionPage";
import { PortalTeamPage } from "../portal/PortalTeamPage";
import { PortalTenantSettingsPage } from "../portal/PortalTenantSettingsPage";
import { PortalMessagesPage } from "../portal/PortalMessagesPage";
import { PortalSupportPage } from "../portal/PortalSupportPage";
import { PortalSupportCasePage } from "../portal/PortalSupportCasePage";
import { HqMessagesPage } from "../hq/HqMessagesPage";
import { HqSupportCasesPage } from "../hq/HqSupportCasesPage";
import { HqSupportCaseDetailPage } from "../hq/HqSupportCaseDetailPage";
import { HqSupportFaqsPage } from "../hq/HqSupportFaqsPage";
import { HqWorkspaceTeamPage } from "../hq/HqWorkspaceTeamPage";
import { HqWorkspaceKnowledgeBasePage } from "../hq/HqWorkspaceKnowledgeBasePage";
import { HqPlatformTeamPage } from "../hq/HqPlatformTeamPage";
import { LandingTestPage } from "../public-test/LandingTestPage";
import { CheckoutTestPage } from "../public-test/CheckoutTestPage";
import { CheckoutSuccessPage } from "../public-test/CheckoutSuccessPage";
const defaultStore = localStorageStore(undefined, "CRM");

function mergeLoginRedirect<T>(result: T, redirectTo: string) {
  if (result && typeof result === "object" && result !== null && "redirectTo" in result) {
    return result;
  }
  const base =
    result && typeof result === "object" && result !== null ? { ...(result as object) } : {};
  return { ...base, redirectTo };
}

export type CRMProps = {
  dataProvider?: CrmDataProvider;
  authProvider?: AuthProvider;
  i18nProvider?: CoreAdminProps["i18nProvider"];
  disableTelemetry?: boolean;
  store?: CoreAdminProps["store"];
  dashboard?: DashboardComponent;
  layout?: LayoutComponent;
} & Partial<ConfigurationContextValue>;

/**
 * CRM Component
 *
 * This component sets up and renders the main CRM application using `ra-core`. It provides
 * default configurations and themes but allows for customization through props. The component
 * seeds the store with any custom prop values for backwards compatibility.
 *
 * @param {LabeledValue[]} companySectors - The list of company sectors used in the application.
 * @param {string} currency - The ISO 4217 currency code used to format monetary values (e.g. "USD", "EUR", "GBP").
 * @param {RaThemeOptions} darkTheme - The theme to use when the application is in dark mode.
 * @param {LabeledValue[]} dealCategories - The categories of deals used in the application.
 * @param {string[]} dealPipelineStatuses - The statuses of deals in the pipeline used in the application.
 * @param {DealStage[]} dealStages - The stages of deals used in the application.
 * @param {RaThemeOptions} lightTheme - The theme to use when the application is in light mode.
 * @param {string} logo - The logo used in the CRM application.
 * @param {NoteStatus[]} noteStatuses - The statuses of notes used in the application.
 * @param {LabeledValue[]} taskTypes - The types of tasks used in the application.
 * @param {string} title - The title of the CRM application.
 *
 * @returns {JSX.Element} The rendered CRM application.
 *
 * @example
 * // Basic usage of the CRM component
 * import { CRM } from '@/components/atomic-crm/dashboard/CRM';
 *
 * const App = () => (
 *     <CRM
 *         logo="/path/to/logo.png"
 *         title="My Custom CRM"
 *         lightTheme={{
 *             ...defaultTheme,
 *             palette: {
 *                 primary: { main: '#0000ff' },
 *             },
 *         }}
 *     />
 * );
 *
 * export default App;
 */
export const CRM = ({
  companySectors = defaultCompanySectors,
  currency = defaultCurrency,
  dealCategories = defaultDealCategories,
  dealPipelineStatuses = defaultDealPipelineStatuses,
  dealStages = defaultDealStages,
  darkModeLogo = defaultDarkModeLogo,
  lightModeLogo = defaultLightModeLogo,
  noteStatuses = defaultNoteStatuses,
  taskTypes = defaultTaskTypes,
  title = defaultTitle,
  dataProvider = defaultDataProviderBuilder(),
  authProvider = defaultAuthProviderBuilder(),
  i18nProvider = defaulti18nProvider,
  store = defaultStore,
  googleWorkplaceDomain = import.meta.env.VITE_GOOGLE_WORKPLACE_DOMAIN,
  disableEmailPasswordAuthentication = import.meta.env
    .VITE_DISABLE_EMAIL_PASSWORD_AUTHENTICATION === "true",
  disableTelemetry,
  ...rest
}: CRMProps) => {
  useEffect(() => {
    if (
      disableTelemetry ||
      process.env.NODE_ENV !== "production" ||
      typeof window === "undefined" ||
      typeof window.location === "undefined" ||
      typeof Image === "undefined"
    ) {
      return;
    }
    const img = new Image();
    img.src = `https://atomic-crm-telemetry.marmelab.com/atomic-crm-telemetry?domain=${window.location.hostname}`;
  }, [disableTelemetry]);

  // Seed the store with CRM prop values if not already stored
  // (backwards compatibility for prop-based config)
  useEffect(() => {
    if (!store.getItem(CONFIGURATION_STORE_KEY)) {
      store.setItem(CONFIGURATION_STORE_KEY, {
        companySectors,
        currency,
        dealCategories,
        dealPipelineStatuses,
        dealStages,
        noteStatuses,
        taskTypes,
        title,
        darkModeLogo,
        lightModeLogo,
        googleWorkplaceDomain,
        disableEmailPasswordAuthentication,
      } satisfies ConfigurationContextValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const isMobile = useIsMobile();

  // on login, pre-fetch the configuration to avoid a flickering
  // when accessing the app for the first time
  const wrappedAuthProvider = useMemo<AuthProvider>(
    () => ({
      ...authProvider,
      login: async (params: any) => {
        if (params?.ssoDomain) {
          return authProvider.login(params);
        }
        const result = await authProvider.login(params);
        try {
          const config = await dataProvider.getConfiguration();
          if (Object.keys(config).length > 0) {
            store.setItem(CONFIGURATION_STORE_KEY, config);
          }
        } catch {
          // Non-critical: config will load via useConfigurationLoader
        }
        const redirectTo = await resolveChasterPostAuthPath();
        return mergeLoginRedirect(result, redirectTo);
      },
      handleCallback: async (params: any) => {
        if (!authProvider.handleCallback) {
          throw new Error(
            "handleCallback is not implemented in the authProvider",
          );
        }
        const result = await authProvider.handleCallback(params);
        try {
          const config = await dataProvider.getConfiguration();
          if (Object.keys(config).length > 0) {
            store.setItem(CONFIGURATION_STORE_KEY, config);
          }
        } catch {
          // Non-critical: config will load via useConfigurationLoader
        }
        if (
          result &&
          typeof result === "object" &&
          "redirectTo" in result &&
          (result as { redirectTo?: unknown }).redirectTo !== undefined &&
          (result as { redirectTo?: unknown }).redirectTo !== false
        ) {
          return result;
        }
        const redirectTo = await resolveChasterPostAuthPath();
        return mergeLoginRedirect(result, redirectTo);
      },
      logout: async (params: any) => {
        try {
          store.removeItem(CONFIGURATION_STORE_KEY);
        } catch {
          // Ignore
        }
        return authProvider.logout(params);
      },
    }),
    [authProvider, dataProvider, store],
  );

  const ResponsiveAdmin = isMobile ? MobileAdmin : DesktopAdmin;

  return (
    <ResponsiveAdmin
      dataProvider={dataProvider}
      authProvider={wrappedAuthProvider}
      i18nProvider={i18nProvider}
      store={store}
      loginPage={StartPage}
      requireAuth
      disableTelemetry
      {...rest}
    />
  );
};

const DesktopAdmin = (
  props: CoreAdminProps & {
    dashboard?: DashboardComponent;
    layout?: LayoutComponent;
  },
) => {
  return (
    <Admin
      layout={props.layout ?? Layout}
      dashboard={props.dashboard ?? RoleHomeRedirect}
      {...props}
    >
      <CustomRoutes noLayout>
        <Route path={SignupPage.path} element={<SignupPage />} />
        <Route
          path={ConfirmationRequired.path}
          element={<ConfirmationRequired />}
        />
        <Route path={SetPasswordPage.path} element={<SetPasswordRoute />} />
        <Route path="/auth/invite-error" element={<AuthInviteErrorPage />} />
        <Route
          path={ForgotPasswordPage.path}
          element={<ForgotPasswordPage />}
        />
        <Route path={OAuthConsentPage.path} element={<OAuthConsentPage />} />
        <Route path="/landing-test" element={<LandingTestPage />} />
        <Route path="/checkout/test" element={<CheckoutTestPage />} />
        <Route path="/checkout/test/success" element={<CheckoutSuccessPage />} />
      </CustomRoutes>

      <CustomRoutes>
        <Route path={ProfilePage.path} element={<ProfilePage />} />
        <Route path={SettingsPage.path} element={<SettingsPage />} />
        <Route path={ImportPage.path} element={<ImportPage />} />
        <Route
          path="/hq"
          element={
            <ChasterHQGuard>
              <HqDashboardPage />
            </ChasterHQGuard>
          }
        />
        <Route
          path="/hq/companies/new"
          element={
            <ChasterHQGuard>
              <HqNewTenantPage />
            </ChasterHQGuard>
          }
        />
        <Route
          path="/hq/companies/:tenantId"
          element={
            <ChasterHQGuard>
              <HqTenantDetailPage />
            </ChasterHQGuard>
          }
        />
        <Route
          path="/hq/messages"
          element={
            <ChasterHQGuard>
              <HqMessagesPage />
            </ChasterHQGuard>
          }
        />
        <Route
          path="/hq/support/cases"
          element={<HqSupportCasesPage />}
        />
        <Route
          path="/hq/support/cases/:caseId"
          element={<HqSupportCaseDetailPage />}
        />
        <Route path="/hq/support/faqs" element={<HqSupportFaqsPage />} />
        <Route path="/hq/workspace/team" element={<HqWorkspaceTeamPage />} />
        <Route
          path="/hq/platform-team"
          element={<HqPlatformTeamPage />}
        />
        <Route
          path="/hq/workspace/knowledge-base"
          element={<HqWorkspaceKnowledgeBasePage />}
        />
        <Route path="/portal" element={<PortalHomePage />} />
        <Route
          path="/portal/knowledge-base"
          element={<PortalKnowledgeBasePage />}
        />
        <Route path="/portal/team" element={<PortalTeamPage />} />
        <Route
          path="/portal/settings"
          element={<PortalTenantSettingsPage />}
        />
        <Route
          path="/portal/subscription"
          element={<PortalSubscriptionPage />}
        />
        <Route path="/portal/messages" element={<PortalMessagesPage />} />
        <Route path="/portal/support" element={<PortalSupportPage />} />
        <Route
          path="/portal/support/cases/:caseId"
          element={<PortalSupportCasePage />}
        />
      </CustomRoutes>
      <Resource name="deals" {...deals} />
      <Resource name="contacts" {...contacts} />
      <Resource name="companies" {...companies} />
      <Resource name="contact_notes" />
      <Resource name="deal_notes" />
      <Resource name="tasks" />
      <Resource name="sales" {...sales} />
      <Resource name="tags" />
    </Admin>
  );
};

const MobileAdmin = (
  props: CoreAdminProps & {
    dashboard?: DashboardComponent;
    layout?: LayoutComponent;
  },
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 1000 * 60 * 60 * 24, // 24 hours
        networkMode: "offlineFirst",
      },
      mutations: {
        networkMode: "offlineFirst",
      },
    },
  });
  const asyncStoragePersister = createAsyncStoragePersister({
    storage: localStorage,
  });

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: asyncStoragePersister }}
    >
      <Admin
        queryClient={queryClient}
        layout={props.layout ?? MobileLayout}
        dashboard={props.dashboard ?? RoleHomeRedirect}
        {...props}
      >
        <CustomRoutes noLayout>
          <Route path={SignupPage.path} element={<SignupPage />} />
          <Route
            path={ConfirmationRequired.path}
            element={<ConfirmationRequired />}
          />
          <Route path={SetPasswordPage.path} element={<SetPasswordRoute />} />
          <Route path="/auth/invite-error" element={<AuthInviteErrorPage />} />
          <Route
            path={ForgotPasswordPage.path}
            element={<ForgotPasswordPage />}
          />
          <Route path={OAuthConsentPage.path} element={<OAuthConsentPage />} />
          <Route path="/landing-test" element={<LandingTestPage />} />
          <Route path="/checkout/test" element={<CheckoutTestPage />} />
          <Route path="/checkout/test/success" element={<CheckoutSuccessPage />} />
        </CustomRoutes>
        <CustomRoutes>
          <Route
            path={SettingsPageMobile.path}
            element={<SettingsPageMobile />}
          />
          <Route
            path="/hq"
            element={
              <ChasterHQGuard>
                <HqDashboardPage />
              </ChasterHQGuard>
            }
          />
          <Route
            path="/hq/companies/new"
            element={
              <ChasterHQGuard>
                <HqNewTenantPage />
              </ChasterHQGuard>
            }
          />
          <Route
            path="/hq/companies/:tenantId"
            element={
              <ChasterHQGuard>
                <HqTenantDetailPage />
              </ChasterHQGuard>
            }
          />
          <Route
            path="/hq/messages"
            element={
              <ChasterHQGuard>
                <HqMessagesPage />
              </ChasterHQGuard>
            }
          />
          <Route
            path="/hq/support/cases"
            element={<HqSupportCasesPage />}
          />
          <Route
            path="/hq/support/cases/:caseId"
            element={<HqSupportCaseDetailPage />}
          />
          <Route path="/hq/support/faqs" element={<HqSupportFaqsPage />} />
          <Route path="/hq/workspace/team" element={<HqWorkspaceTeamPage />} />
          <Route
            path="/hq/platform-team"
            element={<HqPlatformTeamPage />}
          />
          <Route
            path="/hq/workspace/knowledge-base"
            element={<HqWorkspaceKnowledgeBasePage />}
          />
          <Route path="/portal" element={<PortalHomePage />} />
          <Route
            path="/portal/knowledge-base"
            element={<PortalKnowledgeBasePage />}
          />
          <Route path="/portal/team" element={<PortalTeamPage />} />
          <Route path="/portal/messages" element={<PortalMessagesPage />} />
          <Route
            path="/portal/settings"
            element={<PortalTenantSettingsPage />}
          />
          <Route
            path="/portal/subscription"
            element={<PortalSubscriptionPage />}
          />
          <Route path="/portal/support" element={<PortalSupportPage />} />
          <Route
            path="/portal/support/cases/:caseId"
            element={<PortalSupportCasePage />}
          />
        </CustomRoutes>
        <Resource
          name="contacts"
          list={ContactListMobile}
          show={ContactShow}
          recordRepresentation={contacts.recordRepresentation}
        >
          <Route path=":id/notes/:noteId" element={<NoteShowPage />} />
        </Resource>
        <Resource name="companies" show={CompanyShow} />
        <Resource name="tasks" list={MobileTasksList} />
      </Admin>
    </PersistQueryClientProvider>
  );
};
