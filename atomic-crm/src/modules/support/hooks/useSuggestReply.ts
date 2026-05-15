import { useMutation } from "@tanstack/react-query";
import { fetchBrainWithAuth } from "../lib/brainApi";

type SuggestPayload = {
  tenantId: string;
  caseId: string;
  draftHint?: string;
};

export function useSuggestReply() {
  return useMutation({
    mutationFn: async ({ tenantId, caseId, draftHint }: SuggestPayload) => {
      const res = await fetchBrainWithAuth("/v1/control/support/suggest-reply", {
        method: "POST",
        body: JSON.stringify({
          tenant_id: tenantId,
          case_id: caseId,
          draft_hint: draftHint ?? null,
        }),
      });
      const json = (await res.json()) as { draft?: string; detail?: string };
      if (!res.ok) {
        throw new Error(json.detail ?? "Could not suggest a reply");
      }
      return String(json.draft ?? "").trim();
    },
  });
}
