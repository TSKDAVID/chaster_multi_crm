export type SandboxMsgMeta = {
  intent?: string;
  confidence?: number;
  used_sources?: string[];
};

export type SandboxMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: SandboxMsgMeta;
};

const VERSION = 1 as const;
const MAX_MESSAGES = 80;
const PORTAL_PREFIX = "chaster.portal.sandbox.v1:";
const HQ_PREFIX = "chaster.hq.sandbox.v1:";

export function sandboxStorageKey(
  tenantId: string,
  scope: "portal" | "hq" = "portal",
): string {
  return `${scope === "hq" ? HQ_PREFIX : PORTAL_PREFIX}${tenantId}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function isValidMessage(m: unknown): m is SandboxMsg {
  if (!m || typeof m !== "object") return false;
  const o = m as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    (o.role === "user" || o.role === "assistant") &&
    typeof o.text === "string"
  );
}

export function loadSandboxMessages(
  tenantId: string,
  scope: "portal" | "hq" = "portal",
): SandboxMsg[] {
  if (!tenantId) return [];
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(sandboxStorageKey(tenantId, scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; messages?: unknown[] };
    if (parsed.version !== VERSION || !Array.isArray(parsed.messages)) return [];
    return parsed.messages.filter(isValidMessage);
  } catch {
    return [];
  }
}

export function saveSandboxMessages(
  tenantId: string,
  messages: SandboxMsg[],
  scope: "portal" | "hq" = "portal",
): void {
  if (!tenantId) return;
  const storage = safeStorage();
  if (!storage) return;
  try {
    const payload = {
      version: VERSION,
      messages: messages.slice(-MAX_MESSAGES),
    };
    storage.setItem(sandboxStorageKey(tenantId, scope), JSON.stringify(payload));
  } catch {
    // Quota or private mode — ignore.
  }
}

export function clearSandboxMessages(
  tenantId: string,
  scope: "portal" | "hq" = "portal",
): void {
  if (!tenantId) return;
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(sandboxStorageKey(tenantId, scope));
  } catch {
    // ignore
  }
}
