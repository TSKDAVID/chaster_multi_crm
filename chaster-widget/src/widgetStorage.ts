import type { WidgetMessage } from "./types";

/**
 * Per-widget persistent state that survives a page refresh.
 *
 * We deliberately keep this minimal so a leaked record cannot impersonate
 * another conversation: tenant + app + conversation are recorded but the
 * server still validates the session JWT on every request.
 */
export interface PersistedWidgetSession {
  version: 1;
  tenantId: string;
  appId: string;
  sessionToken: string;
  expiresAt: string;
  conversationId?: string;
  supportCaseId?: string;
  guestId?: string;
  guestName?: string;
  guestEmail?: string;
  userId?: string;
  messages: WidgetMessage[];
  updatedAt: string;
}

const STORAGE_PREFIX = "chaster.widget.session.v1:";
const MAX_PERSISTED_MESSAGES = 50;

function storageKey(tenantId: string, appId: string): string {
  return `${STORAGE_PREFIX}${tenantId}:${appId}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function isExpired(session: PersistedWidgetSession): boolean {
  if (!session.expiresAt) {
    return true;
  }
  const ms = Date.parse(session.expiresAt);
  if (Number.isNaN(ms)) {
    return true;
  }
  // Treat the session as expired 30s early so we re-handshake before the
  // server rejects us mid-message.
  return ms <= Date.now() + 30_000;
}

export function loadSession(
  tenantId: string,
  appId: string,
): PersistedWidgetSession | null {
  const storage = safeStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(storageKey(tenantId, appId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedWidgetSession;
    if (parsed.version !== 1 || !parsed.tenantId || !parsed.appId) {
      return null;
    }
    if (parsed.tenantId !== tenantId || parsed.appId !== appId) {
      return null;
    }
    if (isExpired(parsed)) {
      // Keep the conversationId hint for resume but blank out the token.
      return { ...parsed, sessionToken: "" };
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: PersistedWidgetSession): void {
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  try {
    const trimmed: PersistedWidgetSession = {
      ...session,
      messages: session.messages.slice(-MAX_PERSISTED_MESSAGES),
      updatedAt: new Date().toISOString(),
    };
    storage.setItem(
      storageKey(session.tenantId, session.appId),
      JSON.stringify(trimmed),
    );
  } catch {
    // Storage may be full or disabled; degrade gracefully.
  }
}

export function clearSession(tenantId: string, appId: string): void {
  const storage = safeStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(storageKey(tenantId, appId));
  } catch {
    // Best effort.
  }
}

export function pickConversationHint(
  session: PersistedWidgetSession | null,
): { conversationId?: string; sessionToken?: string } {
  if (!session) {
    return {};
  }
  return {
    conversationId: session.conversationId,
    sessionToken: session.sessionToken || undefined,
  };
}
