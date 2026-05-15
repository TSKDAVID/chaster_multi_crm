import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import type { SupportReplySnippetRow } from "../supportTypes";

export function useSupportSnippets(tenantId: string | null, variant: "portal" | "hq") {
  return useQuery({
    queryKey: ["support-snippets", variant, tenantId],
    enabled: variant === "hq" || Boolean(tenantId),
    queryFn: async (): Promise<SupportReplySnippetRow[]> => {
      const supabase = getSupabaseClient();
      let q = supabase
        .from("support_reply_snippets")
        .select("id,title,shortcut,body,scope,tenant_id,created_at,updated_at")
        .order("title", { ascending: true });

      if (variant === "portal" && tenantId) {
        q = q.eq("scope", "tenant").eq("tenant_id", tenantId);
      } else if (variant === "hq") {
        q = q.or(
          tenantId
            ? `scope.eq.hq_global,and(scope.eq.tenant,tenant_id.eq.${tenantId})`
            : "scope.eq.hq_global",
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SupportReplySnippetRow[];
    },
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
