import { getSupabaseClient } from "../providers/supabase/supabase";

export type LogAuditParams = {
  action: string;
  tenantId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Client-side audit insert (RLS: actor must be current user; tenant scope rules apply).
 */
export async function logAuditEvent(params: LogAuditParams) {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: new Error("Not authenticated") as Error | null };
  }

  const { error } = await supabase.from("audit_logs").insert({
    action: params.action,
    tenant_id: params.tenantId ?? null,
    target_user_id: params.targetUserId ?? null,
    actor_user_id: user.id,
    metadata: params.metadata ?? {},
  });

  return { error: error as Error | null };
}
