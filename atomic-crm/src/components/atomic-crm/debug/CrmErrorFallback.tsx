import type { FallbackProps } from "react-error-boundary";
import { useEffect } from "react";
import { Error } from "@/components/admin/error";
import { logCrmError } from "@/lib/crmDebugLog";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * App error boundary fallback: logs to the CRM debug ring buffer and shows
 * the error message (and stack) even in production.
 */
export function CrmErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  useEffect(() => {
    logCrmError("react.error-boundary", error, null);
  }, [error]);

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error ?? "Unknown error");

  const stack = error instanceof Error ? error.stack : undefined;

  return (
    <div className="flex flex-col items-center gap-4 md:p-16">
      <Error error={error} resetErrorBoundary={resetErrorBoundary} />
      <Accordion type="single" collapsible className="w-full max-w-2xl px-4">
        <AccordionItem value="details">
          <AccordionTrigger className="text-sm">Error details (also in CRM debug log)</AccordionTrigger>
          <AccordionContent>
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
              {errorMessage}
              {stack ? `\n\n${stack}` : ""}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              Enable full CRM log: add{" "}
              <code className="rounded bg-muted px-1">?debug=1</code> to the URL or run{" "}
              <code className="rounded bg-muted px-1">__chasterCrmDebug.enable()</code> in the
              console, then open the debug panel (bottom-right).
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          try {
            window.localStorage.setItem("chaster-crm-debug", "1");
            window.location.reload();
          } catch {
            resetErrorBoundary();
          }
        }}
      >
        Enable debug log &amp; reload
      </Button>
    </div>
  );
}
