import { useQuery } from "@tanstack/react-query";
import { getSupabaseClient } from "../providers/supabase/supabase";

/**
 * Supabase Auth user id (`auth.users.id`, UUID).
 * React-Admin `useGetIdentity().id` is the CRM `sales.id` — use this for tenant_members,
 * messaging, and any RLS keyed on auth.uid().
 */
export function useAuthUserId() {
  return useQuery({
    queryKey: ["auth-user-uuid"],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await getSupabaseClient().auth.getUser();
      if (error) throw error;
      return data.user?.id ?? null;
    },
    staleTime: 60_000,
  });
}
