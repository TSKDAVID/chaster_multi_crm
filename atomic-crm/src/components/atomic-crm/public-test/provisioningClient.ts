import type { ProvisioningInput } from "./types";

type ProvisioningSuccess = {
  tenant?: {
    id: string;
    slug: string;
    company_name: string;
    subscription_tier: string;
    status: string;
  };
  invite_email_sent?: boolean;
  auth_user_id?: string | null;
  crm_company_created?: boolean;
  crm_company_error?: string;
};

function requiredEnv(name: string): string {
  const value = import.meta.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export async function provisionTenantForTestCheckout(
  input: ProvisioningInput,
): Promise<ProvisioningSuccess> {
  const supabaseUrl = requiredEnv("VITE_SUPABASE_URL");
  const provisioningSecret = requiredEnv("VITE_CHASTER_PROVISIONING_SECRET");
  const endpoint = `${supabaseUrl}/functions/v1/provision_tenant`;

  const body = {
    auth_user_id: input.authUserId,
    email: input.email,
    company_name: input.companyName,
    first_name: input.firstName,
    last_name: input.lastName,
    status: "active",
    subscription_tier:
      input.moduleSelection.crmEnabled && input.moduleSelection.widgetEnabled
        ? "enterprise"
        : "starter",
    notes: input.notes?.trim() || null,
    enable_crm_module: input.moduleSelection.crmEnabled,
    enable_widget_module: input.moduleSelection.widgetEnabled,
    create_crm_company: input.moduleSelection.crmEnabled,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provisioningSecret}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as
    | ProvisioningSuccess
    | { error?: string; message?: string };

  if (!response.ok) {
    const message =
      (payload as { error?: string; message?: string }).error ||
      (payload as { error?: string; message?: string }).message ||
      "Checkout simulation failed.";
    throw new Error(message);
  }

  return payload as ProvisioningSuccess;
}
