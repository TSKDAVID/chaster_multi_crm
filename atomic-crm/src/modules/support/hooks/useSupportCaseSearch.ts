import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export function useSupportCaseSearch(
  variant: "portal" | "hq",
  query: string,
  enabled = true,
) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["support-case-search", variant, trimmed],
    enabled: enabled && trimmed.length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const supabase = getSupabaseClient();
      const rpc =
        variant === "hq" ? "search_support_cases_hq" : "search_support_cases_portal";
      const { data, error } = await supabase.rpc(rpc, {
        p_query: trimmed,
        p_limit: 50,
      });
      if (error) throw error;
      return (data ?? []).map((r: { case_id: string }) => String(r.case_id));
    },
  });
}
