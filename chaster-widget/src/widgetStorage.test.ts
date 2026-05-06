import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearSession,
  loadSession,
  pickConversationHint,
  saveSession,
} from "./widgetStorage";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

const TENANT = "tenant-1";
const APP = "app-12345678";

beforeEach(() => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: storage },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe("widgetStorage", () => {
  it("returns null when nothing is stored", () => {
    expect(loadSession(TENANT, APP)).toBeNull();
  });

  it("round-trips session payloads", () => {
    saveSession({
      version: 1,
      tenantId: TENANT,
      appId: APP,
      sessionToken: "token-abc",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      conversationId: "conv-1",
      messages: [
        { id: "m1", role: "visitor", body: "hi", createdAt: new Date().toISOString() },
      ],
      updatedAt: new Date().toISOString(),
    });
    const loaded = loadSession(TENANT, APP);
    expect(loaded?.sessionToken).toBe("token-abc");
    expect(loaded?.conversationId).toBe("conv-1");
    expect(loaded?.messages).toHaveLength(1);
  });

  it("treats expired session tokens as resume hints (no token)", () => {
    saveSession({
      version: 1,
      tenantId: TENANT,
      appId: APP,
      sessionToken: "expired-token",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
      conversationId: "conv-old",
      messages: [],
      updatedAt: new Date().toISOString(),
    });
    const loaded = loadSession(TENANT, APP);
    expect(loaded).not.toBeNull();
    expect(loaded?.sessionToken).toBe("");
    expect(loaded?.conversationId).toBe("conv-old");
  });

  it("ignores sessions persisted under a different tenant/app", () => {
    saveSession({
      version: 1,
      tenantId: TENANT,
      appId: APP,
      sessionToken: "token-x",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      conversationId: "conv-1",
      messages: [],
      updatedAt: new Date().toISOString(),
    });
    expect(loadSession(TENANT, "other-app")).toBeNull();
    expect(loadSession("other-tenant", APP)).toBeNull();
  });

  it("clearSession removes the persisted record", () => {
    saveSession({
      version: 1,
      tenantId: TENANT,
      appId: APP,
      sessionToken: "token-y",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      conversationId: "conv-1",
      messages: [],
      updatedAt: new Date().toISOString(),
    });
    clearSession(TENANT, APP);
    expect(loadSession(TENANT, APP)).toBeNull();
  });

  it("pickConversationHint returns the right shape", () => {
    expect(pickConversationHint(null)).toEqual({});
    expect(
      pickConversationHint({
        version: 1,
        tenantId: TENANT,
        appId: APP,
        sessionToken: "token-z",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        conversationId: "conv-1",
        messages: [],
        updatedAt: new Date().toISOString(),
      }),
    ).toEqual({ conversationId: "conv-1", sessionToken: "token-z" });
  });
});
