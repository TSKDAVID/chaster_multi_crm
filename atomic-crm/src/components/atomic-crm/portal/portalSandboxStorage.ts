export type SandboxMsg = { id: string; role: "user" | "assistant"; text: string };

const VERSION = 1 as const;
const MAX_MESSAGES = 80;
const PREFIX = "chaster.portal.sandbox.v1:";

export function sandboxStorageKey(tenantId: string): string {
  return `${PREFIX}${tenantId}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSandboxMessages(tenantId: string): SandboxMsg[] {
  if (!tenantId) return [];
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(sandboxStorageKey(tenantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { version?: number; messages?: SandboxMsg[] };
    if (parsed.version !== VERSION || !Array.isArray(parsed.messages)) return [];
    return parsed.messages.filter(
      (m) => m && typeof m.id === "string" && (m.role === "user" || m.role === "assistant") && typeof m.text === "string",
    );
  } catch {
    return [];
  }
}

export function saveSandboxMessages(tenantId: string, messages: SandboxMsg[]): void {
  if (!tenantId) return;
  const storage = safeStorage();
  if (!storage) return;
  try {
    const payload = {
      version: VERSION,
      messages: messages.slice(-MAX_MESSAGES),
    };
    storage.setItem(sandboxStorageKey(tenantId), JSON.stringify(payload));
  } catch {
    // Quota or private mode — ignore.
  }
}

export function clearSandboxMessages(tenantId: string): void {
  if (!tenantId) return;
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(sandboxStorageKey(tenantId));
  } catch {
    // ignore
  }
}
