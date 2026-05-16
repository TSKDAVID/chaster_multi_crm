import { cn } from "@/lib/utils";

/** Thin, subtle scrollbar for support panes (list, messages, sidebar). */
export const supportScrollAreaClass = cn(
  "min-h-0 overflow-y-auto overscroll-contain",
  "[scrollbar-width:thin]",
  "[scrollbar-color:hsl(var(--border)/0.65)_transparent]",
  "[&::-webkit-scrollbar]:w-1.5",
  "[&::-webkit-scrollbar-track]:bg-transparent",
  "[&::-webkit-scrollbar-thumb]:rounded-full",
  "[&::-webkit-scrollbar-thumb]:bg-border/50",
  "hover:[&::-webkit-scrollbar-thumb]:bg-border/80",
);
