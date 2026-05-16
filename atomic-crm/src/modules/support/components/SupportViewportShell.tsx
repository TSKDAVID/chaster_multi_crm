import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SupportViewportShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-muted/15",
        className,
      )}
    >
      {children}
    </div>
  );
}
