import { useCallback, useRef, useState, type PointerEvent } from "react";

function readStoredWidth(storageKey: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function clampWidth(
  width: number,
  minWidth: number,
  maxWidth: number,
  containerWidth: number | null,
  maxFraction: number,
) {
  const cap =
    containerWidth != null && containerWidth > 0
      ? Math.min(maxWidth, Math.floor(containerWidth * maxFraction))
      : maxWidth;
  return Math.min(Math.max(width, minWidth), Math.max(minWidth, cap));
}

export type UseResizablePanelWidthOptions = {
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  /** Max share of container width (0–1). Default 0.65 */
  maxFraction?: number;
};

export function useResizablePanelWidth({
  storageKey,
  defaultWidth,
  minWidth = 260,
  maxWidth = 720,
  maxFraction = 0.65,
}: UseResizablePanelWidthOptions) {
  const [width, setWidth] = useState(() =>
    readStoredWidth(storageKey, defaultWidth),
  );
  const widthRef = useRef(width);
  widthRef.current = width;

  const persist = useCallback(
    (next: number) => {
      try {
        localStorage.setItem(storageKey, String(Math.round(next)));
      } catch {
        /* ignore quota / private mode */
      }
    },
    [storageKey],
  );

  const setClampedWidth = useCallback(
    (next: number, containerWidth: number | null) => {
      const clamped = clampWidth(
        next,
        minWidth,
        maxWidth,
        containerWidth,
        maxFraction,
      );
      setWidth(clamped);
      return clamped;
    },
    [maxFraction, maxWidth, minWidth],
  );

  const startResize = useCallback(
    (
      event: PointerEvent<HTMLElement>,
      direction: "panel-start" | "panel-end",
      containerWidth: number,
    ) => {
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startWidth = widthRef.current;

      const onMove = (e: PointerEvent) => {
        const delta =
          direction === "panel-start"
            ? e.clientX - startX
            : startX - e.clientX;
        setClampedWidth(startWidth + delta, containerWidth);
      };

      const onUp = (e: PointerEvent) => {
        handle.releasePointerCapture(e.pointerId);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        document.body.style.removeProperty("cursor");
        document.body.style.removeProperty("user-select");
        persist(widthRef.current);
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
    },
    [persist, setClampedWidth],
  );

  const resetWidth = useCallback(() => {
    const next = setClampedWidth(defaultWidth, null);
    persist(next);
  }, [defaultWidth, persist, setClampedWidth]);

  return { width, startResize, resetWidth, setClampedWidth };
}
