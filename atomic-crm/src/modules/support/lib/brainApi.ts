import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";

export const CHASTER_BRAIN_API_BASE_URL =
  import.meta.env.VITE_CHASTER_BRAIN_API_URL?.trim() ||
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  "https://brain-vd2i.onrender.com";

export async function fetchBrainWithAuth(
  path: string,
  init: RequestInit & { body?: BodyInit | null },
): Promise<Response> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("not authenticated");
  }
  return fetch(`${CHASTER_BRAIN_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}
