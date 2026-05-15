import { useState } from "react";
import { useTranslate } from "ra-core";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupportReplySnippetRow } from "../supportTypes";
import { useSnippetMutations } from "../hooks/useSupportSnippets";

export function SnippetManageDialog({
  snippets,
  tenantId,
  allowGlobal,
}: {
  snippets: SupportReplySnippetRow[];
  tenantId: string | null;
  allowGlobal: boolean;
}) {
  const translate = useTranslate();
  const { upsert, remove } = useSnippetMutations(tenantId);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<"hq_global" | "tenant">(
    allowGlobal ? "hq_global" : "tenant",
  );

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setShortcut("");
    setBody("");
    setScope(allowGlobal ? "hq_global" : "tenant");
  };

  const startEdit = (s: SupportReplySnippetRow) => {
    setEditingId(s.id);
    setTitle(s.title);
    setShortcut(s.shortcut ?? "");
    setBody(s.body);
    setScope(s.scope);
  };

  const onSave = async () => {
    if (!title.trim() || !body.trim()) return;
    await upsert.mutateAsync({
      id: editingId ?? undefined,
      title,
      shortcut: shortcut || null,
      body,
      scope: allowGlobal ? scope : "tenant",
    });
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Settings2 className="mr-1.5 h-3.5 w-3.5" />
          {translate("chaster.support.snippets_manage")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate("chaster.support.snippets_manage")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {allowGlobal ? (
            <div className="space-y-1.5">
              <Label>{translate("chaster.support.snippets_scope")}</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as typeof scope)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hq_global">
                    {translate("chaster.support.snippets_scope_global")}
                  </SelectItem>
                  <SelectItem value="tenant" disabled={!tenantId}>
                    {translate("chaster.support.snippets_scope_tenant")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>{translate("chaster.support.snippets_title")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{translate("chaster.support.snippets_shortcut")}</Label>
            <Input value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="billing-refund" />
          </div>
          <div className="space-y-1.5">
            <Label>{translate("chaster.support.snippets_body")}</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={() => void onSave()} disabled={upsert.isPending}>
              {translate("chaster.support.snippets_save")}
            </Button>
            {editingId ? (
              <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
                {translate("chaster.support.snippets_cancel_edit")}
              </Button>
            ) : null}
          </div>
          <ul className="max-h-48 space-y-1 overflow-y-auto border-t pt-3">
            {snippets.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <button type="button" className="truncate text-left hover:underline" onClick={() => startEdit(s)}>
                  {s.title}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-destructive"
                  onClick={() => void remove.mutateAsync(s.id)}
                >
                  {translate("chaster.support.snippets_delete")}
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {translate("chaster.portal.support.form_cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
