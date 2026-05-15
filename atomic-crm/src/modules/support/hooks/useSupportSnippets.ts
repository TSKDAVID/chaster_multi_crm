import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import type { SupportReplySnippetRow } from "../supportTypes";

async function fetchSnippets(
  tenantId: string | null,
  variant: "portal" | "hq",
): Promise<SupportReplySnippetRow[]> {
  const supabase = getSupabaseClient();
  const select =
    "id,title,shortcut,body,scope,tenant_id,created_at,updated_at";

  try {
    if (variant === "portal" && tenantId) {
      const { data, error } = await supabase
        .from("support_reply_snippets")
        .select(select)
        .eq("scope", "tenant")
        .eq("tenant_id", tenantId)
        .order("title", { ascending: true });
      if (error) {
        console.warn("support snippets (portal)", error.message);
        return [];
      }
      return (data ?? []) as SupportReplySnippetRow[];
    }

    if (variant === "hq") {
      const { data: globalRows, error: globalErr } = await supabase
        .from("support_reply_snippets")
        .select(select)
        .eq("scope", "hq_global")
        .order("title", { ascending: true });
      if (globalErr) {
        console.warn("support snippets (hq global)", globalErr.message);
        return [];
      }
      let tenantRows: SupportReplySnippetRow[] = [];
      if (tenantId) {
        const { data, error } = await supabase
          .from("support_reply_snippets")
          .select(select)
          .eq("scope", "tenant")
          .eq("tenant_id", tenantId)
          .order("title", { ascending: true });
        if (error) {
          console.warn("support snippets (hq tenant)", error.message);
        } else {
          tenantRows = (data ?? []) as SupportReplySnippetRow[];
        }
      }
      return [...((globalRows ?? []) as SupportReplySnippetRow[]), ...tenantRows];
    }

    return [];
  } catch (e) {
    console.warn("support snippets fetch failed", e);
    return [];
  }
}

export function useSupportSnippets(
  tenantId: string | null,
  variant: "portal" | "hq",
  enabled = true,
) {
  return useQuery({
    queryKey: ["support-snippets", variant, tenantId],
    enabled: enabled && (variant === "hq" || Boolean(tenantId)),
    retry: false,
    queryFn: () => fetchSnippets(tenantId, variant),
  });
}

export function useSnippetMutations(tenantId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["support-snippets"] });
  };

  const upsert = useMutation({
    mutationFn: async (row: {
      id?: string;
      title: string;
      shortcut?: string | null;
      body: string;
      scope: "hq_global" | "tenant";
    }) => {
      const supabase = getSupabaseClient();
      const payload = {
        title: row.title.trim(),
        shortcut: row.shortcut?.trim() || null,
        body: row.body.trim(),
        scope: row.scope,
        tenant_id: row.scope === "tenant" ? tenantId : null,
        updated_at: new Date().toISOString(),
      };
      if (row.id) {
        const { error } = await supabase
          .from("support_reply_snippets")
          .update(payload)
          .eq("id", row.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("support_reply_snippets").insert(payload);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from("support_reply_snippets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { upsert, remove };
}
