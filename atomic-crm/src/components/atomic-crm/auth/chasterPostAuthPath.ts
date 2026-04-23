import { getSupabaseClient } from "../providers/supabase/supabase";

/** Where to send the user after login or password set (HQ staff vs portal). */
export async function resolveChasterPostAuthPath(): Promise<string> {
  const { data, error } = await getSupabaseClient().rpc("is_chaster_staff");
  if (error) {
    console.error("is_chaster_staff", error);
    return "/portal";
  }
  return data === true ? "/hq" : "/portal";
}
