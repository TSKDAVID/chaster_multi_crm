import type { SupabaseClient } from "@supabase/supabase-js";

const REOPENABLE_STATUSES = ["resolved", "pending_client"] as const;

/** HQ / staff: direct update (RLS). Portal: `reopen_support_case` RPC after migration. */
export async function reopenSupportCase(
  supabase: SupabaseClient,
  caseId: string,
  options: { asStaff: boolean },
) {
  if (options.asStaff) {
    const { data, error } = await supabase
      .from("support_cases")
      .update({
        status: "open",
        resolved_at: null,
        closure_reason: null,
        closure_note: null,
      })
      .eq("id", caseId)
      .in("status", [...REOPENABLE_STATUSES])
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(
        "This case cannot be reopened. It may already be open or you may not have access.",
      );
    }
    return;
  }

  const { error } = await supabase.rpc("reopen_support_case", {
    p_case_id: caseId,
  });
  if (error) throw error;
}
