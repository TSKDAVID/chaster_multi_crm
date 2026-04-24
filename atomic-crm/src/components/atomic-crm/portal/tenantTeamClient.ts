import { getSupabaseClient } from "../providers/supabase/supabase";

export type TenantTeamAction =
  | "invite_tenant_member"
  | "add_existing_tenant_member"
  | "resend_tenant_invite"
  | "remove_tenant_member"
  | "update_tenant_member_role";

async function parseFnError(error: unknown): Promise<string> {
  try {
    const j = await (error as { context?: Response })?.context?.json();
    if (j && typeof j.message === "string") return j.message;
  } catch {
    // ignore
  }
  return (error as Error)?.message ?? "Request failed";
}

export async function invokeTenantTeam(
  action: TenantTeamAction,
  body: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>(
    "tenant_team",
    {
      body: { action, ...body },
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );

  if (error || !data?.ok) {
    throw new Error(await parseFnError(error));
  }
}
