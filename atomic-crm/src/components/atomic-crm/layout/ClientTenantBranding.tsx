import { useEffect } from "react";
import { useChasterAccess } from "../access/chasterAccessContext";
import { getSupabaseClient } from "../providers/supabase/supabase";
import {
  useConfigurationUpdater,
  type ConfigurationContextValue,
} from "../root/ConfigurationContext";
import { defaultConfiguration } from "../root/defaultConfiguration";

const ownerTitle = "Chaster HQ";

/**
 * Phase 1.2: client users see "{Company} CRM" in header + document title;
 * Chaster staff see "Chaster HQ".
 */
export function ClientTenantBranding() {
  const { isOwnerSide, tenantId, isLoading } = useChasterAccess();
  const updateConfiguration = useConfigurationUpdater();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const applyTitle = (title: string) => {
      document.title = title;
      updateConfiguration(
        (prev: ConfigurationContextValue | undefined) => ({
          ...defaultConfiguration,
          ...prev,
          title,
        }),
      );
    };

    if (isOwnerSide) {
      applyTitle(ownerTitle);
      return;
    }

    if (!tenantId) {
      applyTitle(defaultConfiguration.title);
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data, error } = await getSupabaseClient()
        .from("tenants")
        .select("company_name")
        .eq("id", tenantId)
        .maybeSingle();

      if (cancelled || error || !data?.company_name) {
        if (!cancelled) {
          applyTitle(defaultConfiguration.title);
        }
        return;
      }

      applyTitle(`${data.company_name} CRM`);
    })();

    return () => {
      cancelled = true;
    };
  }, [isOwnerSide, tenantId, isLoading, updateConfiguration]);

  return null;
}
