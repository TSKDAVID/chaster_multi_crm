import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function HqSupportSidebarSection({
  title,
  description,
  children,
  className,
  variant = "default",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  variant?: "default" | "emphasis";
}) {
  return (
    <section
      className={cn(
        "border-b border-border/60 pb-5 last:border-b-0",
        variant === "emphasis" && "rounded-lg border border-amber-500/25 bg-amber-500/5 p-3",
        className,
      )}
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {description ? (
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}
