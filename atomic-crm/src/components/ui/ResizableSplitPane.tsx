import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useResizablePanelWidth,
  type UseResizablePanelWidthOptions,
} from "@/lib/useResizablePanelWidth";

const BREAKPOINT_PX = { md: 768, lg: 1024 } as const;

type EnableFrom = keyof typeof BREAKPOINT_PX;

export type ResizableSplitPaneProps = UseResizablePanelWidthOptions & {
  panelSide: "start" | "end";
  panel: ReactNode;
  children: ReactNode;
  className?: string;
  mainClassName?: string;
  panelClassName?: string;
  enableFrom?: EnableFrom;
  /** When false, stacks vertically and ignores stored width */
  layoutActive?: boolean;
};

export function ResizableSplitPane({
  panelSide,
  panel,
  children,
  className,
  mainClassName,
  panelClassName,
  enableFrom = "lg",
  layoutActive = true,
  ...widthOptions
}: ResizableSplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [horizontal, setHorizontal] = useState(false);
  const { width, startResize, resetWidth } = useResizablePanelWidth(widthOptions);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${BREAKPOINT_PX[enableFrom]}px)`);
    const sync = () => setHorizontal(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [enableFrom]);

  const resizable = layoutActive && horizontal;
  const panelStyle: CSSProperties | undefined = resizable
    ? { width: `${width}px`, flexShrink: 0 }
    : undefined;

  const onHandlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizable || !containerRef.current) return;
    startResize(
      e,
      panelSide === "start" ? "panel-start" : "panel-end",
      containerRef.current.clientWidth,
    );
  };

  const handle = resizable ? (
    <button
      type="button"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuemin={widthOptions.minWidth ?? 260}
      aria-valuemax={widthOptions.maxWidth ?? 720}
      aria-valuenow={Math.round(width)}
      onPointerDown={onHandlePointerDown}
      onDoubleClick={resetWidth}
      className={cn(
        "group relative z-10 flex w-2 shrink-0 touch-none items-center justify-center",
        "cursor-col-resize border-x border-transparent bg-transparent",
        "hover:border-border/80 hover:bg-muted/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      )}
    >
      <GripVertical
        className="h-5 w-5 text-muted-foreground/40 group-hover:text-muted-foreground"
        aria-hidden
      />
    </button>
  ) : null;

  const panelEl = (
    <aside
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden",
        !resizable && "w-full",
        panelClassName,
      )}
      style={panelStyle}
    >
      {panel}
    </aside>
  );

  const mainEl = (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", mainClassName)}>
      {children}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex min-h-0 min-w-0",
        resizable ? "flex-row" : "flex-col",
        className,
      )}
    >
      {panelSide === "start" ? (
        <>
          {panelEl}
          {handle}
          {mainEl}
        </>
      ) : (
        <>
          {mainEl}
          {handle}
          {panelEl}
        </>
      )}
    </div>
  );
}
