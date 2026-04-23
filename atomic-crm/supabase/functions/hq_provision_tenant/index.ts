import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { UserMiddleware } from "../_shared/authentication.ts";
import { inviteRedirectTo } from "../_shared/inviteRedirect.ts";
import {
  insertCrmCompanyForTenant,
  wantsCrmCompany,
} from "../_shared/crmCompanyForTenant.ts";

/**
 * Chaster HQ: create a client tenant + invite super admin (same as provision_tenant)
 * but authenticated as a user in chaster_team (JWT), not the provisioning secret.
 */
function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return s || "company";
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    UserMiddleware(req, async (req, user) => {
      if (req.method !== "POST") {
        return createErrorResponse(405, "Method Not Allowed");
      }
      if (!user?.id) {
        return createErrorResponse(401, "Unauthorized");
      }

      const { data: staff, error: staffErr } = await supabaseAdmin
        .from("chaster_team")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (staffErr || !staff) {
        return createErrorResponse(403, "Chaster team access required");
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return createErrorResponse(400, "Invalid JSON body");
      }

      const email = String(body.email ?? "").trim().toLowerCase();
      const company_name = String(body.company_name ?? "").trim();
      if (!email || !company_name) {
        return createErrorResponse(400, "email and company_name are required");
      }

      const first_name = String(body.first_name ?? "Pending").trim() || "Pending";
      const last_name = String(body.last_name ?? "Pending").trim() || "Pending";
      const subscription_tier =
        String(body.subscription_tier ?? "starter").trim() || "starter";
      const status = String(body.status ?? "trial").trim() || "trial";
      const slugInput = body.slug != null ? String(body.slug).trim() : "";
      const slugBase = slugInput || slugify(company_name);
      const slug =
        `${slugify(slugBase)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

      let notes: string | null = null;
      if (body.notes != null) {
        notes = String(body.notes).slice(0, 2000);
      }

      const trial_ends_at =
        body.trial_ends_at != null && String(body.trial_ends_at).trim() !== ""
          ? String(body.trial_ends_at).trim()
          : null;

      const { data: tenant, error: tErr } = await supabaseAdmin
        .from("tenants")
        .insert({
          company_name,
          slug,
          status,
          subscription_tier,
          notes,
          primary_contact_email: email,
          ...(trial_ends_at ? { trial_ends_at } : {}),
        })
        .select("id, slug, company_name, status, subscription_tier, trial_ends_at")
        .single();

      if (tErr || !tenant) {
        console.error("hq_provision_tenant insert tenant:", tErr);
        return createErrorResponse(
          500,
          tErr?.message ?? "Failed to create tenant",
        );
      }

      const { error: tsErr } = await supabaseAdmin.from("tenant_settings").insert({
        tenant_id: tenant.id,
      });
      if (tsErr) {
        console.error("hq_provision_tenant tenant_settings:", tsErr);
        await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
        return createErrorResponse(500, "Failed to create tenant settings");
      }

      const redirectTo = inviteRedirectTo();
      const { data: invData, error: invErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: {
            first_name,
            last_name,
            provisioned_tenant_id: tenant.id,
            provisioned_tenant_role: "super_admin",
          },
          ...(redirectTo ? { redirectTo } : {}),
        });

      if (invErr) {
        console.error("hq_provision_tenant invite:", invErr);
        await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
        return createErrorResponse(
          invErr.status ?? 502,
          invErr.message ??
            "Failed to send invitation email; tenant was rolled back.",
          { code: invErr.code },
        );
      }

      const ownerId = invData?.user?.id ?? null;
      if (ownerId) {
        await supabaseAdmin
          .from("tenants")
          .update({ owner_user_id: ownerId })
          .eq("id", tenant.id);
      }

      await supabaseAdmin.from("audit_logs").insert({
        tenant_id: tenant.id,
        actor_user_id: user.id,
        action: "hq_tenant_created",
        metadata: {
          company_name,
          invite_email: email,
          subscription_tier,
          status,
        },
      });

      const payload: Record<string, unknown> = {
        tenant,
        invite_email_sent: true,
        auth_user_id: ownerId,
      };
      if (wantsCrmCompany(body)) {
        const crm = await insertCrmCompanyForTenant(
          supabaseAdmin,
          tenant.id,
          company_name,
        );
        payload.crm_company_created = crm.ok;
        if (crm.errorMessage) payload.crm_company_error = crm.errorMessage;
        if (crm.ok) {
          await supabaseAdmin.from("audit_logs").insert({
            tenant_id: tenant.id,
            actor_user_id: user.id,
            action: "hq_crm_company_created_for_tenant",
            metadata: { company_name },
          });
        }
      }

      return new Response(JSON.stringify(payload), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }),
  ),
);
