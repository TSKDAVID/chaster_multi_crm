import type {
  ChasterWidgetConfig,
  HandshakeRequest,
  HandshakeResponse,
  ProcessResponse,
  RemoteMessagesResponse,
  SignatureContext,
} from "./types";

const STORAGE_PREFIX = "chaster_widget_session:";

interface SessionCache {
  token: string;
  expiresAt: string;
}

export class SecurityClient {
  private readonly config: ChasterWidgetConfig;
  private session: SessionCache | null = null;

  constructor(config: ChasterWidgetConfig) {
    this.config = config;
  }

  private getAppId(): string {
    if (!this.config.appId) {
      throw new Error("Missing appId. Provide appId or set data-app-id on script tag.");
    }
    return this.config.appId;
  }

  async handshake(payload: HandshakeRequest): Promise<HandshakeResponse> {
    const body = JSON.stringify(payload);
    const handshakeIdentity = payload.user_id ?? payload.guest_id ?? "unknown";
    const signatureHeaders = await this.config.getSignatureHeaders(
      this.signatureContext(`handshake:${handshakeIdentity}`),
    );
    const response = await fetch(`${this.config.gatewayUrl}/v1/handshake`, {
      method: "POST",
      headers: this.buildHeaders(signatureHeaders, this.config.bearerToken),
      body,
    });
    if (!response.ok) {
      throw new Error(await this.safeError(response));
    }
    const data = (await response.json()) as HandshakeResponse;
    this.persistSession({ token: data.session_token, expiresAt: data.expires_at });
    return data;
  }

  async processMessage(message: string, metadata: Record<string, unknown>): Promise<ProcessResponse> {
    const session = this.readSession();
    if (!session) {
      throw new Error("Session missing. Handshake is required.");
    }
    const payload = {
      app_id: this.getAppId(),
      tenant_id: this.config.tenantId,
      message,
      metadata,
    };
    const body = JSON.stringify(payload);
    const signatureHeaders = await this.config.getSignatureHeaders(
      this.signatureContext(message),
    );
    const response = await fetch(`${this.config.gatewayUrl}/v1/process`, {
      method: "POST",
      headers: {
        ...this.buildHeaders(signatureHeaders, session.token),
        "Content-Type": "application/json",
      },
      body,
    });
    if (response.status === 401) {
      this.clearSession();
      throw new Error("Session expired. Reconnect required.");
    }
    if (!response.ok) {
      throw new Error(await this.safeError(response));
    }
    return (await response.json()) as ProcessResponse;
  }

  /**
   * Server-side memory reset. Call this on top of clearing local storage so
   * any cached summaries / hot turns for the current conversation are
   * forgotten before the next handshake.
   */
  async resetServerMemory(): Promise<void> {
    const session = this.readSession();
    if (!session) {
      return;
    }
    try {
      await fetch(`${this.config.gatewayUrl}/v1/widget/reset`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "X-Tenant-Id": this.config.tenantId,
          "X-App-Id": this.getAppId(),
        },
      });
    } catch {
      // Best-effort: the next handshake will create a fresh conversation
      // anyway, so a network error here is non-fatal.
    }
  }

  /**
   * Pull the recent messages for the current session's conversation_id.
   * Used on resume to re-render history that the user typed before the
   * page refresh, avoiding any chance of trusting tampered localStorage.
   */
  async fetchHistory(limit = 30): Promise<RemoteMessagesResponse | null> {
    const session = this.readSession();
    if (!session) {
      return null;
    }
    try {
      const url = new URL(`${this.config.gatewayUrl}/v1/widget/messages`);
      url.searchParams.set("limit", String(limit));
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "X-Tenant-Id": this.config.tenantId,
          "X-App-Id": this.getAppId(),
        },
      });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as RemoteMessagesResponse;
    } catch {
      return null;
    }
  }

  hasLiveSession(): boolean {
    return this.readSession() !== null;
  }

  forgetSession(): void {
    this.clearSession();
  }

  private buildHeaders(signatureHeaders: { signature: string; timestamp: string; nonce: string }, token?: string): HeadersInit {
    return {
      "Content-Type": "application/json",
      "X-Signature": signatureHeaders.signature,
      "X-Timestamp": signatureHeaders.timestamp,
      "X-Nonce": signatureHeaders.nonce,
      Authorization: token ? `Bearer ${token}` : this.config.bearerToken ? `Bearer ${this.config.bearerToken}` : "",
    };
  }

  private signatureContext(message: string): SignatureContext {
    return {
      tenantId: this.config.tenantId,
      appId: this.getAppId(),
      message,
    };
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}${this.config.tenantId}:${this.getAppId()}`;
  }

  private persistSession(session: SessionCache): void {
    this.session = session;
    try {
      sessionStorage.setItem(this.storageKey(), JSON.stringify(session));
    } catch {
      // Storage may be unavailable (e.g. private mode / sandboxed iframe).
    }
  }

  private clearSession(): void {
    this.session = null;
    try {
      sessionStorage.removeItem(this.storageKey());
    } catch {
      // Best effort.
    }
  }

  private readSession(): SessionCache | null {
    if (this.session && Date.parse(this.session.expiresAt) > Date.now()) {
      return this.session;
    }
    try {
      const raw = sessionStorage.getItem(this.storageKey());
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as SessionCache;
      if (Date.parse(parsed.expiresAt) <= Date.now()) {
        this.clearSession();
        return null;
      }
      this.session = parsed;
      return parsed;
    } catch {
      return null;
    }
  }

  private async safeError(response: Response): Promise<string> {
    try {
      const data = await response.json();
      return (data as { detail?: string }).detail ?? "Request failed";
    } catch {
      return "Request failed";
    }
  }
}
