import type {
  ChasterWidgetConfig,
  HandshakeRequest,
  HandshakeResponse,
  ProcessResponse,
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
    sessionStorage.setItem(this.storageKey(), JSON.stringify(session));
  }

  private clearSession(): void {
    this.session = null;
    sessionStorage.removeItem(this.storageKey());
  }

  private readSession(): SessionCache | null {
    if (this.session && Date.parse(this.session.expiresAt) > Date.now()) {
      return this.session;
    }
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
