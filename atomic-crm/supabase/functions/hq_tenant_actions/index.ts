import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { UserMiddleware } from "../_shared/authentication.ts";
import { inviteRedirectTo } from "../_shared/inviteRedirect.ts";

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
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (staffErr || !staff) {
        return createErrorResponse(403, "Chaster team access required");
      }
      const staffRole = staff.role as string;
      if (staffRole !== "admin" && staffRole !== "super_admin") {
        return createErrorResponse(
          403,
          "Chaster admin or super admin required for this action",
        );
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return createErrorResponse(400, "Invalid JSON body");
      }

      const action = String(body.action ?? "");
      if (action !== "send_member_password_reset") {
        return createErrorResponse(400, "Unknown action");
      }

      const tenant_id = String(body.tenant_id ?? "").trim();
      const target_user_id = String(body.target_user_id ?? "").trim();
      if (!tenant_id || !target_user_id) {
        return createErrorResponse(
          400,
          "tenant_id and target_user_id are required",
        );
      }

      const { data: membership, error: memErr } = await supabaseAdmin
        .from("tenant_members")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("user_id", target_user_id)
        .maybeSingle();

      if (memErr || !membership) {
        return createErrorResponse(
          404,
          "User is not a member of this company",
        );
      }

      const { data: authData, error: authErr } =
        await supabaseAdmin.auth.admin.getUserById(target_user_id);
      if (authErr || !authData?.user?.email) {
        return createErrorResponse(404, "Could not resolve user email");
      }

      const redirectTo = inviteRedirectTo();
      const { error: resetErr } =
        await supabaseAdmin.auth.resetPasswordForEmail(
          authData.user.email,
          redirectTo ? { redirectTo } : undefined,
        );

      if (resetErr) {
        console.error("resetPasswordForEmail:", resetErr);
        return createErrorResponse(500, resetErr.message);
      }

      await supabaseAdmin.from("audit_logs").insert({
        tenant_id,
        actor_user_id: user.id,
        action: "hq_member_password_reset_sent",
        target_user_id,
        metadata: {},
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }),
  ),
);
