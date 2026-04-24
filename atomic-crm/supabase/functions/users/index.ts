import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
import { getUserSale } from "../_shared/getUserSale.ts";
import { inviteRedirectTo } from "../_shared/inviteRedirect.ts";

function normalizeTenantMemberRole(
  raw: string,
): "workspace_owner" | "workspace_admin" | "workspace_manager" | "workspace_member" | "workspace_viewer" {
  if (
    raw === "workspace_owner" ||
    raw === "workspace_admin" ||
    raw === "workspace_manager" ||
    raw === "workspace_member" ||
    raw === "workspace_viewer"
  ) return raw;
  if (raw === "super_admin") return "workspace_owner";
  if (raw === "admin") return "workspace_admin";
  return "workspace_member";
}

async function isChasterStaffUser(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("chaster_team")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return data != null;
}

async function updateSaleDisabled(user_id: string, disabled: boolean) {
  return await supabaseAdmin
    .from("sales")
    .update({ disabled: disabled ?? false })
    .eq("user_id", user_id);
}

async function updateSaleAdministrator(
  user_id: string,
  administrator: boolean,
) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .update({ administrator })
    .eq("user_id", user_id)
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error updating user:", salesError);
    throw salesError ?? new Error("Failed to update sale");
  }
  return sales.at(0);
}

async function createSale(
  user_id: string,
  data: {
    email: string;
    first_name: string;
    last_name: string;
    disabled: boolean;
    administrator: boolean;
  },
) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .insert({
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      disabled: data.disabled,
      administrator: data.administrator,
      user_id,
    })
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error creating user:", salesError);
    throw salesError ?? new Error("Failed to create sale");
  }
  return sales.at(0);
}

async function updateSaleAvatar(user_id: string, avatar: string) {
  const { data: sales, error: salesError } = await supabaseAdmin
    .from("sales")
    .update({ avatar })
    .eq("user_id", user_id)
    .select("*");

  if (!sales?.length || salesError) {
    console.error("Error updating user:", salesError);
    throw salesError ?? new Error("Failed to update sale");
  }
  return sales.at(0);
}

/**
 * Auth user exists (e.g. invite/create failed) but no sales row — attach CRM profile.
 * Returns a Response if handled, or null to let caller return the original error.
 */
async function tryRecoverOrphanSale(
  email: string,
  first_name: string,
  last_name: string,
  disabled: boolean,
  administrator: boolean,
): Promise<Response | null> {
  const { data: rpcRows, error } = await supabaseAdmin.rpc(
    "get_user_id_by_email",
    { email },
  );
  if (error || !rpcRows?.length) return null;

  const userId = (rpcRows[0] as { id: string }).id;

  const { data: existingSale, error: salesError } = await supabaseAdmin
    .from("sales")
    .select("*")
    .eq("user_id", userId);
  if (salesError) {
    return createErrorResponse(500, salesError.message, {
      code: salesError.code,
    });
  }
  if (existingSale && existingSale.length > 0) {
    return createErrorResponse(
      400,
      "A user with this email already exists in the CRM.",
    );
  }

  try {
    const sale = await createSale(userId, {
      email,
      first_name,
      last_name,
      disabled,
      administrator,
    });
    return new Response(
      JSON.stringify({
        data: sale,
        invite_email_sent: false,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (err) {
    return createErrorResponse(
      (err as { status?: number }).status ?? 500,
      (err as Error).message,
      {
        code: (err as { code?: string }).code,
      },
    );
  }
}

async function patchSaleRoles(
  user_id: string,
  disabled: boolean,
  administrator: boolean,
) {
  await updateSaleDisabled(user_id, disabled);
  return updateSaleAdministrator(user_id, administrator);
}

type InviteUserBody = {
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  disabled?: boolean;
  administrator?: boolean;
  tenant_id?: string;
  tenant_member_role?: string;
};

async function inviteUser(body: InviteUserBody, currentUserSale: any) {
  const {
    email,
    password,
    first_name,
    last_name,
    disabled,
    administrator,
    tenant_id,
    tenant_member_role,
  } = body;

  if (!currentUserSale.administrator) {
    return createErrorResponse(401, "Not Authorized");
  }

  if (typeof email !== "string" || email.trim() === "") {
    return createErrorResponse(400, "email is required");
  }

  const fn = String(first_name ?? "").trim() || "Pending";
  const ln = String(last_name ?? "").trim() || "Pending";
  const dis = disabled ?? false;
  const admin = administrator ?? false;

  const hadPassword =
    typeof password === "string" && password.length > 0;

  if (!hadPassword) {
    const inviteData: Record<string, string> = {
      first_name: fn,
      last_name: ln,
    };

    const tid =
      tenant_id != null && String(tenant_id).trim() !== ""
        ? String(tenant_id).trim()
        : "";
    if (tid) {
      if (!(await isChasterStaffUser(currentUserSale.user_id))) {
        return createErrorResponse(
          403,
          "Only Chaster team members can invite users into a specific client tenant.",
        );
      }
      const uuidRe =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(tid)) {
        return createErrorResponse(400, "tenant_id must be a valid UUID");
      }
      const roleRaw = String(tenant_member_role ?? "workspace_member").trim();
      const role = normalizeTenantMemberRole(roleRaw);
      inviteData.provisioned_tenant_id = tid;
      inviteData.provisioned_tenant_role = role;
    }

    const redirectTo = inviteRedirectTo();
    const { data: invData, error: invError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: inviteData,
        ...(redirectTo ? { redirectTo } : {}),
      });

    if (invError) {
      const recovered = await tryRecoverOrphanSale(
        email,
        fn,
        ln,
        dis,
        admin,
      );
      if (recovered) return recovered;

      console.error("inviteUserByEmail:", invError);
      return createErrorResponse(
        invError.status ?? 502,
        invError.message ||
          "Failed to send invitation email. Check SMTP / Auth logs. Set Edge secret INVITE_REDIRECT_URL (e.g. https://your-app/auth-callback.html) or APP_SITE_URL; add that URL under Authentication → Redirect URLs.",
        { code: invError.code },
      );
    }

    const user = invData?.user;
    if (!user?.id) {
      return createErrorResponse(
        500,
        "Invitation was sent but the user record was not returned. Check Auth logs in Supabase.",
      );
    }

    try {
      const sale = await patchSaleRoles(user.id, dis, admin);
      return new Response(
        JSON.stringify({
          data: sale,
          invite_email_sent: true,
        }),
        {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    } catch (e) {
      console.error("Error patching sale after invite:", e);
      return createErrorResponse(500, "Internal Server Error");
    }
  }

  const pwd =
    typeof password === "string" && password.length > 0 ? password : "";
  const { data, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: pwd,
    email_confirm: true,
    user_metadata: { first_name: fn, last_name: ln },
  });

  let user = data?.user;

  if (!user && userError?.code === "email_exists") {
    const recovered = await tryRecoverOrphanSale(
      email,
      fn,
      ln,
      dis,
      admin,
    );
    if (recovered) return recovered;
    return createErrorResponse(
      userError.status ?? 400,
      userError.message,
      { code: userError.code },
    );
  }

  if (userError || !user) {
    console.error(`Error creating user: user_error=${userError}`);
    return createErrorResponse(
      userError?.status ?? 500,
      userError?.message ?? "Failed to create user",
      { code: userError?.code },
    );
  }

  try {
    const sale = await patchSaleRoles(user.id, dis, admin);
    return new Response(
      JSON.stringify({
        data: sale,
        invite_email_sent: false,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (e) {
    console.error("Error patching sale:", e);
    return createErrorResponse(500, "Internal Server Error");
  }
}

async function getChasterTeamRole(
  userId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("chaster_team")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role ?? null;
}

/**
 * Chaster team super_admin only: remove CRM row, clear FKs, delete Auth user.
 */
async function deleteUserBySalesId(
  salesId: number,
  currentUserSale: { user_id: string },
) {
  const role = await getChasterTeamRole(currentUserSale.user_id);
  if (role !== "hq_owner" && role !== "super_admin") {
    return createErrorResponse(
      403,
      "Only Chaster HQ owners can delete users.",
    );
  }

  const { data: target, error: targetErr } = await supabaseAdmin
    .from("sales")
    .select("id, user_id")
    .eq("id", salesId)
    .single();

  if (targetErr || !target) {
    return createErrorResponse(404, "User not found");
  }

  if (target.user_id === currentUserSale.user_id) {
    return createErrorResponse(400, "You cannot delete your own account");
  }

  const uid = target.user_id as string;
  const sid = target.id as number;

  await supabaseAdmin.from("companies").update({ sales_id: null }).eq(
    "sales_id",
    sid,
  );
  await supabaseAdmin.from("contacts").update({ sales_id: null }).eq(
    "sales_id",
    sid,
  );
  await supabaseAdmin.from("deals").update({ sales_id: null }).eq(
    "sales_id",
    sid,
  );
  await supabaseAdmin.from("tasks").update({ sales_id: null }).eq(
    "sales_id",
    sid,
  );
  await supabaseAdmin.from("contact_notes").update({ sales_id: null }).eq(
    "sales_id",
    sid,
  );
  await supabaseAdmin.from("deal_notes").update({ sales_id: null }).eq(
    "sales_id",
    sid,
  );

  await supabaseAdmin.from("knowledge_base_documents").update({
    uploaded_by: null,
  }).eq("uploaded_by", uid);
  await supabaseAdmin.from("audit_logs").update({ actor_user_id: null }).eq(
    "actor_user_id",
    uid,
  );
  await supabaseAdmin.from("audit_logs").update({ target_user_id: null }).eq(
    "target_user_id",
    uid,
  );
  await supabaseAdmin.from("tenants").update({ owner_user_id: null }).eq(
    "owner_user_id",
    uid,
  );
  await supabaseAdmin.from("tenant_members").update({ invited_by: null }).eq(
    "invited_by",
    uid,
  );

  const { error: delSaleErr } = await supabaseAdmin.from("sales").delete().eq(
    "id",
    sid,
  );
  if (delSaleErr) {
    console.error("delete sales:", delSaleErr);
    return createErrorResponse(
      500,
      delSaleErr.message ||
        "Could not remove CRM user row; check for remaining references.",
    );
  }

  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(uid);
  if (authErr) {
    console.error("auth.admin.deleteUser:", authErr);
    return createErrorResponse(
      500,
      authErr.message || "Auth user could not be deleted (CRM row was removed).",
    );
  }

  return new Response(JSON.stringify({ ok: true, id: salesId }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

/** DELETE: ?sales_id= or JSON body (may be stripped). Prefer POST + action delete_user from the app. */
async function deleteUser(req: Request, currentUserSale: { user_id: string }) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("sales_id");
  let salesIdRaw: number | string | null | undefined = fromQuery ?? undefined;

  if (salesIdRaw === undefined || salesIdRaw === "") {
    try {
      const body = (await req.json()) as { sales_id?: number | string };
      salesIdRaw = body.sales_id;
    } catch {
      // empty or non-JSON body
    }
  }

  if (salesIdRaw === undefined || salesIdRaw === null || salesIdRaw === "") {
    return createErrorResponse(
      400,
      "sales_id is required (use POST { action: \"delete_user\", sales_id } or query ?sales_id=)",
    );
  }
  const salesId =
    typeof salesIdRaw === "string" ? parseInt(salesIdRaw, 10) : salesIdRaw;
  if (!Number.isFinite(salesId)) {
    return createErrorResponse(400, "sales_id must be a number");
  }

  return deleteUserBySalesId(salesId, currentUserSale);
}

async function patchUser(req: Request, currentUserSale: any) {
  const {
    sales_id,
    email,
    first_name,
    last_name,
    avatar,
    administrator,
    disabled,
  } = await req.json();
  const { data: sale } = await supabaseAdmin
    .from("sales")
    .select("*")
    .eq("id", sales_id)
    .single();

  if (!sale) {
    return createErrorResponse(404, "Not Found");
  }

  // Users can only update their own profile unless they are an administrator
  if (!currentUserSale.administrator && currentUserSale.id !== sale.id) {
    return createErrorResponse(401, "Not Authorized");
  }

  const { data, error: userError } =
    await supabaseAdmin.auth.admin.updateUserById(sale.user_id, {
      email,
      ban_duration: disabled ? "87600h" : "none",
      user_metadata: { first_name, last_name },
    });

  if (!data?.user || userError) {
    console.error("Error patching user:", userError);
    return createErrorResponse(500, "Internal Server Error");
  }

  if (avatar) {
    await updateSaleAvatar(data.user.id, avatar);
  }

  // Only administrators can update the administrator and disabled status
  if (!currentUserSale.administrator) {
    const { data: new_sale } = await supabaseAdmin
      .from("sales")
      .select("*")
      .eq("id", sales_id)
      .single();
    return new Response(
      JSON.stringify({
        data: new_sale,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  }

  try {
    await updateSaleDisabled(data.user.id, disabled);
    const saleRow = await updateSaleAdministrator(
      data.user.id,
      administrator,
    );
    return new Response(
      JSON.stringify({
        data: saleRow,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  } catch (e) {
    console.error("Error patching sale:", e);
    return createErrorResponse(500, "Internal Server Error");
  }
}

Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        const currentUserSale = await getUserSale(user);
        if (!currentUserSale) {
          return createErrorResponse(401, "Unauthorized");
        }

        if (req.method === "POST") {
          let body: Record<string, unknown>;
          try {
            body = (await req.json()) as Record<string, unknown>;
          } catch {
            return createErrorResponse(400, "Invalid JSON body");
          }
          if (body.action === "delete_user") {
            const raw = body.sales_id;
            if (raw === undefined || raw === null || raw === "") {
              return createErrorResponse(400, "sales_id is required");
            }
            const salesId =
              typeof raw === "string" ? parseInt(raw, 10) : (raw as number);
            if (!Number.isFinite(salesId)) {
              return createErrorResponse(400, "sales_id must be a number");
            }
            return deleteUserBySalesId(salesId, currentUserSale);
          }
          return inviteUser(body as InviteUserBody, currentUserSale);
        }

        if (req.method === "PATCH") {
          return patchUser(req, currentUserSale);
        }

        if (req.method === "DELETE") {
          return deleteUser(req, currentUserSale);
        }

        return createErrorResponse(405, "Method Not Allowed");
      }),
    ),
  ),
);
