export type ModuleSelection = {
  crmEnabled: boolean;
  widgetEnabled: boolean;
};

export type ProvisionPayload = {
  companyName: string;
  email: string;
  firstName: string;
  lastName: string;
  notes?: string;
  selection: ModuleSelection;
};

type ProvisionResult = {
  tenant?: {
    company_name: string;
    slug: string;
  };
  invite_email_sent?: boolean;
};

function env(name: "VITE_SUPABASE_URL" | "VITE_CHASTER_PROVISIONING_SECRET"): string {
  const value = import.meta.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Configure your .env file.`);
  }
  return value;
}

export async function provisionTenant(payload: ProvisionPayload): Promise<ProvisionResult> {
  const endpoint = `${env("VITE_SUPABASE_URL")}/functions/v1/provision_tenant`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env("VITE_CHASTER_PROVISIONING_SECRET")}`,
    },
    body: JSON.stringify({
      email: payload.email.trim().toLowerCase(),
      company_name: payload.companyName.trim(),
      first_name: payload.firstName.trim() || "Owner",
      last_name: payload.lastName.trim() || "User",
      notes: payload.notes?.trim() || null,
      status: "active",
      subscription_tier:
        payload.selection.crmEnabled && payload.selection.widgetEnabled
          ? "enterprise"
          : "starter",
      enable_crm_module: payload.selection.crmEnabled,
      enable_widget_module: payload.selection.widgetEnabled,
      create_crm_company: payload.selection.crmEnabled,
    }),
  });

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(json.error ?? json.message ?? "Provisioning failed"));
  }

  return json as ProvisionResult;
}
