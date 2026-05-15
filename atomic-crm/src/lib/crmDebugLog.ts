import type { ErrorInfo } from "react";

export type CrmLogLevel = "debug" | "info" | "warn" | "error";

export type CrmLogEntry = {
  id: string;
  at: string;
  level: CrmLogLevel;
  source: string;
  message: string;
  detail?: string;
  stack?: string;
  url?: string;
};

const MAX_ENTRIES = 200;
const entries: CrmLogEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

function nextId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function isCrmDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem("chaster-crm-debug") === "1") return true;
    const hash = window.location.hash;
    const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    const params = new URLSearchParams(q);
    if (params.get("debug") === "1") return true;
    const search = window.location.search;
    if (search && new URLSearchParams(search).get("debug") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function setCrmDebugEnabled(on: boolean) {
  try {
    if (on) window.localStorage.setItem("chaster-crm-debug", "1");
    else window.localStorage.removeItem("chaster-crm-debug");
  } catch {
    /* ignore */
  }
  notify();
}

export function getCrmDebugEntries(): readonly CrmLogEntry[] {
  return entries;
}

export function subscribeCrmDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearCrmDebugLog() {
  entries.length = 0;
  notify();
}

function pushEntry(
  level: CrmLogLevel,
  source: string,
  message: string,
  opts?: { detail?: string; stack?: string },
) {
  const entry: CrmLogEntry = {
    id: nextId(),
    at: new Date().toISOString(),
    level,
    source,
    message,
    detail: opts?.detail,
    stack: opts?.stack,
    url: typeof window !== "undefined" ? window.location.href : undefined,
  };
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;

  const tag = `[Chaster CRM][${level}][${source}]`;
  const payload = opts?.detail ? `\n${opts.detail}` : "";
  if (level === "error") console.error(tag, message, payload, opts?.stack ?? "");
  else if (level === "warn") console.warn(tag, message, payload);
  else console.log(tag, message, payload);

  notify();
}

export function logCrm(
  level: CrmLogLevel,
  source: string,
  message: string,
  detail?: unknown,
) {
  let detailStr: string | undefined;
  if (detail !== undefined) {
    try {
      detailStr =
        typeof detail === "string"
          ? detail
          : JSON.stringify(detail, null, 2);
    } catch {
      detailStr = String(detail);
    }
  }
  pushEntry(level, source, message, { detail: detailStr });
}

export function logCrmError(
  source: string,
  error: unknown,
  info?: ErrorInfo | null,
) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;
  const componentStack = info?.componentStack?.trim();
  pushEntry("error", source, message, {
    stack: [stack, componentStack].filter(Boolean).join("\n\n--- React ---\n\n"),
    detail: componentStack ? "See stack (includes component tree)" : undefined,
  });
}

export function formatCrmDebugLogText(): string {
  return getCrmDebugEntries()
    .map((e) => {
      const lines = [
        `[${e.at}] ${e.level.toUpperCase()} ${e.source}`,
        e.message,
        e.url ? `url: ${e.url}` : "",
        e.detail ?? "",
        e.stack ?? "",
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n---\n\n");
}

let installed = false;

export function installCrmGlobalErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    if (event.filename?.includes("chrome-extension://")) return;
    logCrmError("window.error", event.error ?? event.message, null);
  });

  window.addEventListener("unhandledrejection", (event) => {
    logCrmError("unhandledrejection", event.reason, null);
  });

  logCrm("info", "crm.boot", "Global error handlers installed", {
    debug: isCrmDebugEnabled(),
    href: window.location.href,
  });

  (window as Window & { __chasterCrmDebug?: unknown }).__chasterCrmDebug = {
    enabled: () => isCrmDebugEnabled(),
    enable: () => setCrmDebugEnabled(true),
    disable: () => setCrmDebugEnabled(false),
    entries: () => getCrmDebugEntries(),
    clear: clearCrmDebugLog,
    export: formatCrmDebugLogText,
    log: logCrm,
  };
}
