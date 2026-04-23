import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** JSON body flag from HQ UI or provision_tenant API */
export function wantsCrmCompany(body: Record<string, unknown>): boolean {
  const v = body.create_crm_company;
  return v === true || v === "true";
}

/**
 * One CRM `companies` row for the new tenant (service role; triggers keep explicit tenant_id).
 */
export async function insertCrmCompanyForTenant(
  admin: SupabaseClient,
  tenantId: string,
  companyName: string,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const { error } = await admin.from("companies").insert({
    name: companyName,
    tenant_id: tenantId,
  });
  if (error) {
    console.error("insertCrmCompanyForTenant:", error);
    return { ok: false, errorMessage: error.message };
  }
  return { ok: true };
}
