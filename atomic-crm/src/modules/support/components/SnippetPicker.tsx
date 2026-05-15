import { useState } from "react";
import { useTranslate } from "ra-core";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import type { SupportReplySnippetRow } from "../supportTypes";

export function SnippetPicker({
  snippets,
  onInsert,
  disabled,
}: {
  snippets: SupportReplySnippetRow[];
  onInsert: (body: string) => void;
  disabled?: boolean;
}) {
  const translate = useTranslate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = snippets.filter((s) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      (s.shortcut?.toLowerCase().includes(q) ?? false) ||
      s.body.toLowerCase().includes(q)
    );
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <FileText className="mr-1.5 h-3.5 w-3.5" />
          {translate("chaster.support.snippets")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="border-b p-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={translate("chaster.support.snippets_search")}
            className="h-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {translate("chaster.support.snippets_empty")}
            </p>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onInsert(s.body);
                  setOpen(false);
                  setFilter("");
                }}
              >
                <span className="font-medium">{s.title}</span>
                {s.shortcut ? (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    /{s.shortcut}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
