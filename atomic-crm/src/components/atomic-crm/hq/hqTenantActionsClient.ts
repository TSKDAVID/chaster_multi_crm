import { FunctionsHttpError } from "@supabase/supabase-js";
import { getSupabaseClient } from "../providers/supabase/supabase";

/** Thrown when `invokeHqSendMemberPasswordReset` needs a fresh session. */
export const CHASTER_HQ_NEED_SIGN_IN = "CHASTER_HQ_NEED_SIGN_IN";

export async function invokeHqSendMemberPasswordReset(
  tenantId: string,
  targetUserId: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error(CHASTER_HQ_NEED_SIGN_IN);
  }

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>(
    "hq_tenant_actions",
    {
      body: {
        action: "send_member_password_reset",
        tenant_id: tenantId,
        target_user_id: targetUserId,
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    },
  );

  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const j = (await error.context.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* keep msg */
      }
    }
    throw new Error(msg);
  }
  if (!data?.ok) throw new Error("Request failed");
}
