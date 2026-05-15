import { useState } from "react";
import { useTranslate } from "ra-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SupportCaseClosureReason } from "../supportTypes";

const REASONS: SupportCaseClosureReason[] = [
  "resolved",
  "pending_customer",
  "duplicate",
  "cannot_resolve",
  "spam",
  "cancelled",
];

function reasonLabelKey(r: SupportCaseClosureReason): string {
  return `chaster.hq.support.closure_${r}`;
}

export function CloseCaseDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  onConfirm: (payload: {
    reason: SupportCaseClosureReason;
    note: string;
  }) => void;
}) {
  const translate = useTranslate();
  const [reason, setReason] = useState<SupportCaseClosureReason>("resolved");
  const [note, setNote] = useState("");

  const reset = () => {
    setReason("resolved");
    setNote("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate("chaster.hq.support.close_case_title")}</DialogTitle>
          <DialogDescription>
            {translate("chaster.hq.support.close_case_desc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{translate("chaster.hq.support.closure_reason_label")}</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    reason === r
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "border-border/80 bg-muted/20 hover:bg-muted/40",
                  )}
                >
                  <span className="block">{translate(reasonLabelKey(r))}</span>
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    {translate(`${reasonLabelKey(r)}_hint`)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{translate("chaster.hq.support.closure_note_label")}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={translate("chaster.hq.support.closure_note_placeholder")}
              className="resize-y"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {translate("chaster.hq.support.new_case_cancel")}
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => onConfirm({ reason, note: note.trim() })}
          >
            {pending
              ? translate("chaster.hq.support.saving")
              : translate("chaster.hq.support.close_case_confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
