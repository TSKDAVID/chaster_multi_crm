import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { User } from "jsr:@supabase/supabase-js@2";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { inviteRedirectTo } from "../_shared/inviteRedirect.ts";

type WorkspaceRole =
  | "workspace_owner"
  | "workspace_admin"
  | "workspace_manager"
  | "workspace_member"
  | "workspace_viewer";

function normalizeRole(raw: string): WorkspaceRole {
  switch (raw) {
    case "workspace_owner":
      return "workspace_owner";
    case "workspace_admin":
      return "workspace_admin";
    case "workspace_manager":
      return "workspace_manager";
    case "workspace_member":
      return "workspace_member";
    case "workspace_viewer":
      return "workspace_viewer";
    // legacy compatibility
    case "super_admin":
      return "workspace_owner";
    case "admin":
      return "workspace_admin";
    default:
      return "workspace_member";
  }
}

async function getCallerTenantContext(
  userId: string,
): Promise<{ tenant_id: string; role: WorkspaceRole } | null> {
  const { data, error } = await supabaseAdmin
    .from("tenant_members")
    .select("tenant_id, role, joined_at")
    .eq("user_id", userId);
  if (error || !data?.length) return null;
  const sorted = [...data].sort(
    (a, b) =>
      new Date((a as { joined_at: string }).joined_at).getTime() -
      new Date((b as { joined_at: string }).joined_at).getTime(),
  );
  const row = sorted[0] as { tenant_id: string; role: string };
  return {
    tenant_id: row.tenant_id,
    role: normalizeRole(row.role),
  };
}

async function audit(
  tenantId: string,
  actorId: string,
  action: string,
  targetUserId: string | null,
  metadata: Record<string, unknown>,
) {
  await supabaseAdmin.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_user_id: actorId,
    action,
    target_user_id: targetUserId,
    metadata,
  });
}

async function inviteTenantMember(
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const ctx = await getCallerTenantContext(user.id);
  if (!ctx) {
    return createErrorResponse(403, "You are not a member of a client tenant.");
  }
  if (
    ctx.role !== "workspace_admin" &&
    ctx.role !== "workspace_owner" &&
    ctx.role !== "workspace_manager"
  ) {
    return createErrorResponse(403, "Only tenant admins can invite members.");
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return createErrorResponse(400, "email is required");
  }
  const normEmail = email.toLowerCase();

  const fn = String(body.first_name ?? "").trim() || "Pending";
  const ln = String(body.last_name ?? "").trim() || "Pending";
  let role = normalizeRole(String(body.role ?? "workspace_member"));
  if (role === "workspace_owner") {
    return createErrorResponse(400, "Cannot invite a workspace owner directly.");
  }
  if (
    ctx.role === "workspace_manager" &&
    role !== "workspace_member" &&
    role !== "workspace_viewer"
  ) {
    return createErrorResponse(
      403,
      "Workspace managers can only assign member or viewer roles.",
    );
  }
  if (
    ctx.role === "workspace_admin" &&
    role !== "workspace_member" &&
    role !== "workspace_manager" &&
    role !== "workspace_viewer"
  ) {
    return createErrorResponse(
      403,
      "Workspace admins can only assign member/manager/viewer roles.",
    );
  }

  const inviteData: Record<string, string> = {
    first_name: fn,
    last_name: ln,
    provisioned_tenant_id: ctx.tenant_id,
    provisioned_tenant_role: role,
  };

  const redirectTo = inviteRedirectTo();
  const { data: invData, error: invError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: inviteData,
      ...(redirectTo ? { redirectTo } : {}),
    });

  if (invError) {
    console.error("inviteTenantMember:", invError);
    return createErrorResponse(
      invError.status ?? 502,
      invError.message || "Failed to send invitation email.",
      { code: invError.code },
    );
  }

  const { error: rowErr } = await supabaseAdmin.from("tenant_invites").upsert(
    {
      tenant_id: ctx.tenant_id,
      email: normEmail,
      role,
      invited_by: user.id,
      auth_user_id: invData?.user?.id ?? null,
      cancelled_at: null,
      accepted_at: null,
    },
    { onConflict: "tenant_id,email" },
  );
  if (rowErr) {
    console.error("tenant_invites upsert:", rowErr);
    return createErrorResponse(500, rowErr.message);
  }

  await audit(ctx.tenant_id, user.id, "tenant_member_invited", null, {
    email: normEmail,
    role,
    invited_user_id: invData?.user?.id ?? null,
  });

  return new Response(JSON.stringify({ ok: true, invite_email_sent: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function addExistingTenantMember(
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const ctx = await getCallerTenantContext(user.id);
  if (!ctx) {
    return createErrorResponse(403, "You are not a member of a client tenant.");
  }
  if (
    ctx.role !== "workspace_admin" &&
    ctx.role !== "workspace_owner" &&
    ctx.role !== "workspace_manager"
  ) {
    return createErrorResponse(403, "Only workspace admins can add members.");
  }
  const targetUserId = typeof body.target_user_id === "string"
    ? body.target_user_id.trim()
    : "";
  if (!targetUserId) return createErrorResponse(400, "target_user_id is required");
  if (targetUserId === user.id) {
    return createErrorResponse(400, "You are already a member.");
  }

  const role = normalizeRole(String(body.role ?? "workspace_member"));
  if (role === "workspace_owner") {
    return createErrorResponse(400, "Use ownership transfer for workspace owner.");
  }

  const { error: upsertErr } = await supabaseAdmin.from("tenant_members").upsert(
    {
      tenant_id: ctx.tenant_id,
      user_id: targetUserId,
      role,
    },
    { onConflict: "tenant_id,user_id" },
  );
  if (upsertErr) return createErrorResponse(500, upsertErr.message);

  await audit(ctx.tenant_id, user.id, "tenant_member_added_existing", targetUserId, {
    role,
  });
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function resendTenantInvite(
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const ctx = await getCallerTenantContext(user.id);
  if (!ctx) {
    return createErrorResponse(403, "You are not a member of a client tenant.");
  }
  if (
    ctx.role !== "workspace_admin" &&
    ctx.role !== "workspace_owner" &&
    ctx.role !== "workspace_manager"
  ) {
    return createErrorResponse(403, "Only tenant admins can resend invitations.");
  }

  const inviteId = typeof body.invite_id === "string" ? body.invite_id.trim() : "";
  if (!inviteId) {
    return createErrorResponse(400, "invite_id is required");
  }

  const { data: inv, error: qErr } = await supabaseAdmin
    .from("tenant_invites")
    .select("id, tenant_id, email, role, accepted_at, cancelled_at")
    .eq("id", inviteId)
    .eq("tenant_id", ctx.tenant_id)
    .maybeSingle();

  if (qErr || !inv) {
    return createErrorResponse(404, "Invitation not found.");
  }
  if (inv.accepted_at != null) {
    return createErrorResponse(400, "This person has already joined.");
  }
  if (inv.cancelled_at != null) {
    return createErrorResponse(400, "This invitation was cancelled.");
  }

  const role = normalizeRole(inv.role as string);
  if (role === "workspace_owner") {
    return createErrorResponse(400, "Invalid invite role.");
  }
  if (
    ctx.role === "workspace_manager" &&
    role !== "workspace_member" &&
    role !== "workspace_viewer"
  ) {
    return createErrorResponse(403, "Managers can only resend member/viewer invites.");
  }

  const inviteData: Record<string, string> = {
    first_name: "Pending",
    last_name: "Pending",
    provisioned_tenant_id: ctx.tenant_id,
    provisioned_tenant_role: role,
  };

  const redirectTo = inviteRedirectTo();
  const { data: invData, error: invError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(inv.email, {
      data: inviteData,
      ...(redirectTo ? { redirectTo } : {}),
    });

  if (invError) {
    console.error("resendTenantInvite:", invError);
    return createErrorResponse(
      invError.status ?? 502,
      invError.message || "Failed to resend invitation email.",
      { code: invError.code },
    );
  }

  const { error: upErr } = await supabaseAdmin
    .from("tenant_invites")
    .update({
      invited_by: user.id,
      auth_user_id: invData?.user?.id ?? null,
    })
    .eq("id", inviteId);

  if (upErr) {
    console.error("tenant_invites resend update:", upErr);
    return createErrorResponse(500, upErr.message);
  }

  await audit(ctx.tenant_id, user.id, "tenant_member_invite_resent", null, {
    email: inv.email,
    invite_id: inviteId,
  });

  return new Response(JSON.stringify({ ok: true, invite_email_sent: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function removeTenantMember(
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const ctx = await getCallerTenantContext(user.id);
  if (!ctx) {
    return createErrorResponse(403, "You are not a member of a client tenant.");
  }
  if (
    ctx.role !== "workspace_admin" &&
    ctx.role !== "workspace_owner" &&
    ctx.role !== "workspace_manager"
  ) {
    return createErrorResponse(403, "Only tenant admins can remove members.");
  }

  const targetId = typeof body.target_user_id === "string"
    ? body.target_user_id
    : null;
  if (!targetId) {
    return createErrorResponse(400, "target_user_id is required");
  }
  if (targetId === user.id) {
    return createErrorResponse(400, "You cannot remove yourself.");
  }

  const { data: targetRow, error: tErr } = await supabaseAdmin
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", ctx.tenant_id)
    .eq("user_id", targetId)
    .maybeSingle();

  if (tErr || !targetRow) {
    return createErrorResponse(404, "Member not found in this tenant.");
  }

  const targetRole = normalizeRole(targetRow.role as string);

  if (targetRole === "workspace_owner") {
    return createErrorResponse(
      403,
      "Remove the workspace owner by transferring ownership first.",
    );
  }
  if (ctx.role === "workspace_admin" && targetRole === "workspace_admin") {
    return createErrorResponse(
      403,
      "Workspace admins cannot remove another workspace admin.",
    );
  }
  if (ctx.role === "workspace_manager" && targetRole !== "workspace_member") {
    return createErrorResponse(
      403,
      "Managers can only remove workspace members.",
    );
  }

  const { error: delErr } = await supabaseAdmin
    .from("tenant_members")
    .delete()
    .eq("tenant_id", ctx.tenant_id)
    .eq("user_id", targetId);

  if (delErr) {
    console.error("removeTenantMember:", delErr);
    return createErrorResponse(500, delErr.message);
  }

  const { count } = await supabaseAdmin
    .from("tenant_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", targetId);

  if ((count ?? 0) === 0) {
    await supabaseAdmin.from("sales").update({ administrator: false }).eq(
      "user_id",
      targetId,
    );
  }

  await audit(ctx.tenant_id, user.id, "tenant_member_removed", targetId, {});

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function updateTenantMemberRole(
  user: User,
  body: Record<string, unknown>,
): Promise<Response> {
  const ctx = await getCallerTenantContext(user.id);
  if (!ctx) {
    return createErrorResponse(403, "You are not a member of a client tenant.");
  }
  if (
    ctx.role !== "workspace_admin" &&
    ctx.role !== "workspace_owner" &&
    ctx.role !== "workspace_manager"
  ) {
    return createErrorResponse(403, "Only tenant admins can change roles.");
  }

  const targetId = typeof body.target_user_id === "string"
    ? body.target_user_id
    : null;
  if (!targetId) {
    return createErrorResponse(400, "target_user_id is required");
  }

  const newRole = normalizeRole(String(body.role ?? ""));
  if (newRole === "workspace_owner") {
    return createErrorResponse(
      400,
      "Use ownership transfer to assign workspace owner.",
    );
  }

  const { data: targetRow, error: tErr } = await supabaseAdmin
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", ctx.tenant_id)
    .eq("user_id", targetId)
    .maybeSingle();

  if (tErr || !targetRow) {
    return createErrorResponse(404, "Member not found in this tenant.");
  }

  const targetRole = normalizeRole(targetRow.role as string);

  if (
    targetId === user.id &&
    ctx.role === "workspace_owner" &&
    newRole !== "workspace_owner"
  ) {
    const { count } = await supabaseAdmin
      .from("tenant_members")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenant_id)
      .eq("role", "workspace_owner");
    if ((count ?? 0) <= 1) {
      return createErrorResponse(
        400,
        "Transfer workspace owner before changing your own role.",
      );
    }
  }

  if (ctx.role === "workspace_admin") {
    if (targetRole === "workspace_owner" || targetRole === "workspace_admin") {
      return createErrorResponse(
        403,
        "Workspace admins cannot change owner/admin roles.",
      );
    }
    if (
      newRole !== "workspace_member" &&
      newRole !== "workspace_manager" &&
      newRole !== "workspace_viewer"
    ) {
      return createErrorResponse(403, "Invalid role.");
    }
  }

  if (ctx.role === "workspace_manager") {
    if (targetRole !== "workspace_member") {
      return createErrorResponse(403, "Managers can only change workspace members.");
    }
    if (newRole !== "workspace_member" && newRole !== "workspace_viewer") {
      return createErrorResponse(403, "Invalid role.");
    }
  }

  if (
    ctx.role === "workspace_owner" &&
    targetRole === "workspace_owner" &&
    targetId !== user.id
  ) {
    return createErrorResponse(
      403,
      "Use ownership transfer to replace the workspace owner.",
    );
  }

  const { error: upErr } = await supabaseAdmin
    .from("tenant_members")
    .update({ role: newRole })
    .eq("tenant_id", ctx.tenant_id)
    .eq("user_id", targetId);

  if (upErr) {
    console.error("updateTenantMemberRole:", upErr);
    return createErrorResponse(500, upErr.message);
  }

  const crmAdmin =
    newRole === "workspace_admin" ||
    newRole === "workspace_owner" ||
    newRole === "workspace_manager";
  await supabaseAdmin.from("sales").update({ administrator: crmAdmin }).eq(
    "user_id",
    targetId,
  );

  await audit(ctx.tenant_id, user.id, "tenant_member_role_changed", targetId, {
    new_role: newRole,
    previous_role: targetRole,
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        if (!user) {
          return createErrorResponse(401, "Unauthorized");
        }

        if (req.method !== "POST") {
          return createErrorResponse(405, "Method Not Allowed");
        }

        let body: Record<string, unknown>;
        try {
          body = (await req.json()) as Record<string, unknown>;
        } catch {
          return createErrorResponse(400, "Invalid JSON body");
        }

        const action = String(body.action ?? "");

        switch (action) {
          case "invite_tenant_member":
            return inviteTenantMember(user, body);
          case "add_existing_tenant_member":
            return addExistingTenantMember(user, body);
          case "resend_tenant_invite":
            return resendTenantInvite(user, body);
          case "remove_tenant_member":
            return removeTenantMember(user, body);
          case "update_tenant_member_role":
            return updateTenantMemberRole(user, body);
          default:
            return createErrorResponse(
              400,
              "Unknown action. Use invite_tenant_member, add_existing_tenant_member, resend_tenant_invite, remove_tenant_member, or update_tenant_member_role.",
            );
        }
      }),
    ),
  ),
);
