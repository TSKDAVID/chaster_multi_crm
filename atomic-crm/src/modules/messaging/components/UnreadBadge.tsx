import { cn } from "@/lib/utils";

export function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className={cn(
        "inline-flex min-w-5 h-5 px-1 items-center justify-center rounded-full",
        "bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none",
      )}
    >
      {label}
    </span>
  );
}
