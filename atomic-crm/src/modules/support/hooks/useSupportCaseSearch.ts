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
    retry: false,
    queryFn: async (): Promise<string[]> => {
      const supabase = getSupabaseClient();
      const rpc =
        variant === "hq" ? "search_support_cases_hq" : "search_support_cases_portal";
      try {
        const { data, error } = await supabase.rpc(rpc, {
          p_query: trimmed,
          p_limit: 50,
        });
        if (error) {
          console.warn("support case search", error.message);
          return [];
        }
        return (data ?? []).map((r: { case_id: string }) => String(r.case_id));
      } catch (e) {
        console.warn("support case search failed", e);
        return [];
      }
    },
  });
}
