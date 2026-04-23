import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

/** Trimmed, non-empty browser env for Supabase (Vite `import.meta.env`). */
export function getSupabaseBrowserEnv(): { url: string; key: string } {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const key = import.meta.env.VITE_SB_PUBLISHABLE_KEY?.trim() ?? "";
  if (!url) {
    throw new Error(
      "Set VITE_SUPABASE_URL in atomic-crm/.env.development (or .env). Restart the dev server after changing env files.",
    );
  }
  if (!key) {
    throw new Error(
      "Set VITE_SB_PUBLISHABLE_KEY in atomic-crm/.env.development (Supabase Dashboard → Settings → API → publishable or anon key). Empty values trigger “supabaseKey is required”. Restart the dev server after saving.",
    );
  }
  return { url, key };
}

export const getSupabaseClient = () => {
  if (!supabaseClient) {
    const { url, key } = getSupabaseBrowserEnv();
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return supabaseClient;
};
