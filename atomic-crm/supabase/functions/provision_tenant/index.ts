import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { inviteRedirectTo } from "../_shared/inviteRedirect.ts";
import {
  insertCrmCompanyForTenant,
  wantsCrmCompany,
} from "../_shared/crmCompanyForTenant.ts";

/**
 * Server-to-server: after checkout on your landing site, call this to create a client tenant
 * and email the buyer an invite to set their password (same email as checkout).
 *
 * Auth: Authorization: Bearer <CHASTER_PROVISIONING_SECRET> (Edge Function secret).
 */
function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return s || "company";
}

function verifyProvisioningSecret(req: Request): boolean {
  const secret = (Deno.env.get("CHASTER_PROVISIONING_SECRET") ?? "").trim();
  if (!secret) return false;
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return token === secret;
}

function readBoolean(input: unknown, fallback: boolean): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input === "string") {
    if (input.toLowerCase() === "true") return true;
    if (input.toLowerCase() === "false") return false;
  }
  return fallback;
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) => {
    if (req.method !== "POST") {
      return createErrorResponse(405, "Method Not Allowed");
    }
    if (!verifyProvisioningSecret(req)) {
      return createErrorResponse(
        401,
        "Missing or invalid CHASTER_PROVISIONING_SECRET (Bearer token).",
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return createErrorResponse(400, "Invalid JSON body");
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const auth_user_id =
      body.auth_user_id != null ? String(body.auth_user_id).trim() : "";
    const company_name = String(body.company_name ?? "").trim();
    if (!email || !company_name) {
      return createErrorResponse(400, "email and company_name are required");
    }

    const first_name = String(body.first_name ?? "Pending").trim() || "Pending";
    const last_name = String(body.last_name ?? "Pending").trim() || "Pending";
    const subscription_tier =
      String(body.subscription_tier ?? "starter").trim() || "starter";
    const status = String(body.status ?? "active").trim() || "active";
    const crm_module_enabled = readBoolean(body.enable_crm_module, true);
    const widget_module_enabled = readBoolean(body.enable_widget_module, true);
    const slugInput = body.slug != null ? String(body.slug).trim() : "";
    const slugBase = slugInput || slugify(company_name);
    const slug = `${slugify(slugBase)}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

    let notes: string | null = null;
    if (body.notes != null) {
      notes = String(body.notes).slice(0, 2000);
    }
    if (body.external_ref != null) {
      const ref = String(body.external_ref).slice(0, 500);
      notes = notes ? `${notes}\nexternal_ref: ${ref}` : `external_ref: ${ref}`;
    }

    if (auth_user_id) {
      const { data: existingTenant } = await supabaseAdmin
        .from("tenants")
        .select("id, slug, company_name, status, subscription_tier")
        .eq("owner_user_id", auth_user_id)
        .eq("primary_contact_email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existingTenant?.id) {
        await supabaseAdmin
          .from("tenant_settings")
          .upsert(
            {
              tenant_id: existingTenant.id,
              crm_module_enabled,
              widget_module_enabled,
            },
            { onConflict: "tenant_id" },
          );
        return new Response(
          JSON.stringify({
            tenant: existingTenant,
            invite_email_sent: false,
            auth_user_id,
          }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          },
        );
      }
    }

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        company_name,
        slug,
        status,
        subscription_tier,
        notes,
        primary_contact_email: email,
      })
      .select("id, slug, company_name, status, subscription_tier")
      .single();

    if (tErr || !tenant) {
      console.error("provision_tenant insert tenant:", tErr);
      return createErrorResponse(
        500,
        tErr?.message ?? "Failed to create tenant",
      );
    }

    const { error: tsErr } = await supabaseAdmin.from("tenant_settings").insert({
      tenant_id: tenant.id,
      crm_module_enabled,
      widget_module_enabled,
    });
    if (tsErr) {
      console.error("provision_tenant tenant_settings:", tsErr);
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
      return createErrorResponse(500, "Failed to create tenant settings");
    }

    let authUserId: string | null = null;
    let inviteEmailSent = false;
    if (auth_user_id) {
      const { error: memberErr } = await supabaseAdmin
        .from("tenant_members")
        .upsert(
          {
            tenant_id: tenant.id,
            user_id: auth_user_id,
            role: crm_module_enabled ? "workspace_owner" : "workspace_member",
          },
          { onConflict: "tenant_id,user_id" },
        );
      if (memberErr) {
        console.error("provision_tenant tenant_members:", memberErr);
        await supabaseAdmin.from("tenant_settings").delete().eq("tenant_id", tenant.id);
        await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
        return createErrorResponse(500, "Failed to link user to tenant membership");
      }
      if (crm_module_enabled) {
        await supabaseAdmin
          .from("tenants")
          .update({ owner_user_id: auth_user_id })
          .eq("id", tenant.id)
          .is("owner_user_id", null);
      }
      authUserId = auth_user_id;
    } else {
      const redirectTo = inviteRedirectTo();
      const { data: invData, error: invErr } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          data: {
            first_name,
            last_name,
            provisioned_tenant_id: tenant.id,
            provisioned_tenant_role: "workspace_owner",
          },
          ...(redirectTo ? { redirectTo } : {}),
        });
      if (invErr) {
        console.error("provision_tenant invite:", invErr);
        await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
        return createErrorResponse(
          invErr.status ?? 502,
          invErr.message ??
            "Failed to send invitation email; tenant was rolled back. Check Auth SMTP and logs.",
          { code: invErr.code },
        );
      }
      authUserId = invData?.user?.id ?? null;
      inviteEmailSent = true;
    }

    const payload: Record<string, unknown> = {
      tenant,
      invite_email_sent: inviteEmailSent,
      auth_user_id: authUserId,
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
          actor_user_id: null,
          action: "provision_crm_company_created_for_tenant",
          metadata: { company_name, source: "provision_tenant" },
        });
      }
    }

    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }),
);
