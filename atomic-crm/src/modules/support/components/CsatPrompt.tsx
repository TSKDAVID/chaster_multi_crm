import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNotify, useTranslate } from "ra-core";
import { Star } from "lucide-react";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function CsatPrompt({
  caseId,
  readOnly,
  rating,
  comment,
}: {
  caseId: string;
  readOnly?: boolean;
  rating?: number | null;
  comment?: string | null;
}) {
  const translate = useTranslate();
  const notify = useNotify();
  const qc = useQueryClient();
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc("submit_support_case_csat", {
        p_case_id: caseId,
        p_rating: score,
        p_comment: feedback || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      notify(translate("chaster.support.csat_thanks"), { type: "success" });
      void qc.invalidateQueries({ queryKey: ["support-case", caseId] });
    },
    onError: () => {
      notify(translate("chaster.support.csat_error"), { type: "warning" });
    },
  });

  if (readOnly && rating != null) {
    return (
      <div className="rounded-lg border bg-muted/20 p-3 text-sm">
        <p className="font-medium">{translate("chaster.support.csat_label")}</p>
        <p className="mt-1 flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={cn(
                "h-4 w-4",
                i < rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
              )}
            />
          ))}
          <span className="ml-2 text-muted-foreground">{rating}/5</span>
        </p>
        {comment ? <p className="mt-2 text-muted-foreground">{comment}</p> : null}
      </div>
    );
  }

  if (readOnly) return null;

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-medium">{translate("chaster.support.csat_prompt")}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="rounded p-1 transition hover:scale-110"
            onClick={() => setScore(n)}
            aria-label={`${n}`}
          >
            <Star
              className={cn(
                "h-7 w-7",
                n <= score ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50",
              )}
            />
          </button>
        ))}
      </div>
      <Textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder={translate("chaster.support.csat_comment_placeholder")}
        rows={2}
        className="bg-background"
      />
      <Button
        type="button"
        size="sm"
        disabled={score < 1 || submit.isPending}
        onClick={() => submit.mutate()}
      >
        {translate("chaster.support.csat_submit")}
      </Button>
    </div>
  );
}
