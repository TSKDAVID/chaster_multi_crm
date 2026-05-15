import { useEffect, useState } from "react";
import { Bug, Copy, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearCrmDebugLog,
  formatCrmDebugLogText,
  getCrmDebugEntries,
  isCrmDebugEnabled,
  setCrmDebugEnabled,
  subscribeCrmDebug,
  type CrmLogEntry,
} from "@/lib/crmDebugLog";
import { cn } from "@/lib/utils";

function levelClass(level: CrmLogEntry["level"]) {
  switch (level) {
    case "error":
      return "text-red-600 dark:text-red-400";
    case "warn":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

export function CrmDebugPanel() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(isCrmDebugEnabled);
  const [, tick] = useState(0);

  useEffect(() => subscribeCrmDebug(() => tick((n) => n + 1)), []);
  useEffect(() => setEnabled(isCrmDebugEnabled()), []);

  if (!enabled) return null;

  const entries = getCrmDebugEntries();

  return (
    <>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="fixed bottom-4 right-4 z-[9998] h-11 w-11 rounded-full shadow-lg"
        onClick={() => setOpen((o) => !o)}
        aria-label="CRM debug log"
        title="CRM debug log"
      >
        <Bug className="h-5 w-5" />
        {entries.some((e) => e.level === "error") ? (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-destructive" />
        ) : null}
      </Button>

      {open ? (
        <div
          className={cn(
            "fixed bottom-20 right-4 z-[9999] flex flex-col",
            "h-[min(70vh,520px)] w-[min(96vw,420px)] rounded-xl border border-border bg-card shadow-2xl",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <p className="text-sm font-semibold">CRM debug log</p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Copy all"
                onClick={() => {
                  void navigator.clipboard.writeText(formatCrmDebugLogText());
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Clear"
                onClick={() => clearCrmDebugLog()}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2 font-mono text-[10px] leading-relaxed">
            {entries.length === 0 ? (
              <p className="p-4 text-center text-muted-foreground">No log entries yet.</p>
            ) : (
              <ul className="space-y-2">
                {entries.map((e) => (
                  <li key={e.id} className="rounded-md border border-border/60 bg-muted/20 p-2">
                    <p className={cn("font-semibold", levelClass(e.level))}>
                      {e.at} · {e.level} · {e.source}
                    </p>
                    <p className="mt-0.5 break-words text-foreground">{e.message}</p>
                    {e.detail ? (
                      <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">{e.detail}</pre>
                    ) : null}
                    {e.stack ? (
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-red-700/90 dark:text-red-300/90">
                        {e.stack}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t px-3 py-2 text-[10px] text-muted-foreground">
            Console: <code>__chasterCrmDebug.export()</code> · Disable:{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setCrmDebugEnabled(false);
                setEnabled(false);
                setOpen(false);
              }}
            >
              turn off debug
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
