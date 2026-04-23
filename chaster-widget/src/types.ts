export type SenderRole = "visitor" | "ai" | "human" | "system";

export interface WidgetMessage {
  id: string;
  role: SenderRole;
  body: string;
  createdAt: string;
}

export interface SignatureHeaders {
  signature: string;
  timestamp: string;
  nonce: string;
}

export interface SignatureContext {
  tenantId: string;
  appId: string;
  message: string;
}

export interface HandshakeRequest {
  app_id: string;
  tenant_id: string;
  mode: "anonymous" | "logged_in";
  user_id?: string;
  guest_id?: string;
  guest_name?: string;
  guest_email?: string;
}

export interface HandshakeResponse {
  session_token: string;
  expires_at: string;
  tenant_id: string;
  app_id: string;
  user_id?: string;
  guest_id?: string;
  conversation_id?: string;
  support_case_id?: string;
  ai_handling: boolean;
}

export interface ProcessResponse {
  tenant_id: string;
  app_id: string;
  intent: string;
  confidence: number;
  response: string;
  used_sources: string[];
  sender_type: "ai" | "human";
  conversation_id?: string;
  support_case_id?: string;
  ai_handling: boolean;
  state: "unresolved" | "resolved" | "human_muted" | "human_needed";
}

export interface RealtimeConfig {
  url: string;
  anonKey: string;
}

export interface ChasterWidgetConfig {
  gatewayUrl: string;
  tenantId: string;
  appId?: string;
  container?: string | HTMLElement;
  mode?: "anonymous" | "logged_in";
  userId?: string;
  guestId?: string;
  guestName?: string;
  guestEmail?: string;
  bearerToken?: string;
  origin?: string;
  realtime?: RealtimeConfig;
  getSignatureHeaders: (context: SignatureContext) => Promise<SignatureHeaders>;
}
