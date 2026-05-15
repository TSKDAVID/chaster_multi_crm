import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SupportInboxLayout({
  toolbar,
  queue,
  detail,
  className,
}: {
  toolbar: ReactNode;
  queue: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[min(72vh,720px)] flex-col gap-4", className)}>
      {toolbar ? (
        <div className="sticky top-0 z-10 -mx-1 rounded-lg border border-border/60 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          {toolbar}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,38%)_minmax(0,62%)]">
        <div className="flex min-h-[280px] min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
          {queue}
        </div>
        {detail != null ? (
          <div className="hidden min-h-[280px] min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm lg:flex">
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}
