import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { subscribeRealtime } from "./realtime";
import { sanitizeOutgoingMessage } from "./sanitize";
import { SecurityClient } from "./securityClient";
import type { ChasterWidgetConfig, RemoteMessage, WidgetMessage } from "./types";
import {
  clearSession as clearStoredSession,
  loadSession,
  saveSession,
} from "./widgetStorage";

interface Props {
  config: ChasterWidgetConfig;
}

const nowIso = () => new Date().toISOString();

function newMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function newGuestId(): string {
  return `guest-${newMessageId().replace(/-/g, "").slice(0, 16)}`;
}

function remoteToWidget(remote: RemoteMessage): WidgetMessage {
  return {
    id: String(remote.id ?? newMessageId()),
    role: remote.role === "ai" ? "ai" : "visitor",
    body: remote.body,
    createdAt: remote.created_at ?? nowIso(),
  };
}

const SYSTEM_READY: WidgetMessage = {
  id: "system-ready",
  role: "system",
  body: "Support chat is ready.",
  createdAt: nowIso(),
};

export function App({ config }: Props) {
  const client = useMemo(() => new SecurityClient(config), [config]);

  const persistedAppId = config.appId ?? "";
  const persisted = useMemo(
    () => (persistedAppId ? loadSession(config.tenantId, persistedAppId) : null),
    [config.tenantId, persistedAppId],
  );

  const [messages, setMessages] = useState<WidgetMessage[]>(
    persisted && persisted.messages.length > 0 ? persisted.messages : [SYSTEM_READY],
  );
  const [text, setText] = useState("");
  const [status, setStatus] = useState(
    persisted?.sessionToken ? "Reconnecting..." : "Connecting...",
  );
  const [isMinimized, setIsMinimized] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [aiHandling, setAiHandling] = useState(true);
  const [conversationId, setConversationId] = useState<string | undefined>(
    persisted?.conversationId,
  );
  const [supportCaseId, setSupportCaseId] = useState<string | undefined>(
    persisted?.supportCaseId,
  );
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isIntakeComplete, setIsIntakeComplete] = useState(
    config.mode === "logged_in" || Boolean(persisted?.sessionToken || persisted?.conversationId),
  );
  const [guestName, setGuestName] = useState(persisted?.guestName ?? config.guestName ?? "");
  const [guestEmail, setGuestEmail] = useState(persisted?.guestEmail ?? config.guestEmail ?? "");
  const [guestId, setGuestId] = useState<string | undefined>(persisted?.guestId ?? config.guestId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastPersistedRef = useRef<string>("");

  function persistCurrent(extra?: Partial<{ sessionToken: string; expiresAt: string }>): void {
    if (!persistedAppId) {
      return;
    }
    const tokenInfo = extra ?? { sessionToken: persisted?.sessionToken ?? "", expiresAt: persisted?.expiresAt ?? "" };
    saveSession({
      version: 1,
      tenantId: config.tenantId,
      appId: persistedAppId,
      sessionToken: tokenInfo.sessionToken ?? "",
      expiresAt: tokenInfo.expiresAt ?? "",
      conversationId,
      supportCaseId,
      guestId,
      guestName: guestName || undefined,
      guestEmail: guestEmail || undefined,
      userId: config.userId,
      messages,
      updatedAt: nowIso(),
    });
  }

  async function ensureHandshake(opts?: { resume?: boolean; forceNew?: boolean }): Promise<void> {
    if (!config.appId) {
      throw new Error("Missing appId configuration.");
    }
    const wantResume = Boolean(opts?.resume) && !opts?.forceNew;
    const result = await client.handshake({
      app_id: config.appId,
      tenant_id: config.tenantId,
      mode: config.mode ?? "anonymous",
      user_id: config.userId,
      guest_id: guestId ?? config.guestId,
      guest_name: guestName || undefined,
      guest_email: guestEmail || undefined,
      conversation_id: wantResume ? conversationId ?? persisted?.conversationId : undefined,
      previous_session_token: wantResume ? persisted?.sessionToken || undefined : undefined,
    });
    setConversationId(result.conversation_id);
    setSupportCaseId(result.support_case_id);
    setAiHandling(result.ai_handling);
    setStatus(result.ai_handling ? "AI assistant online" : "Connecting to a human agent...");

    if (result.resumed) {
      const remote = await client.fetchHistory(50);
      if (remote && remote.messages && remote.messages.length > 0) {
        setMessages(remote.messages.map(remoteToWidget));
      }
    }

    persistCurrent({ sessionToken: result.session_token, expiresAt: result.expires_at });
  }

  // Run handshake on mount: try to resume if we have a persisted hint, else
  // wait for the guest intake form to complete.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap(): Promise<void> {
      if (config.mode === "logged_in") {
        await ensureHandshake();
        return;
      }
      if (persisted?.conversationId) {
        try {
          await ensureHandshake({ resume: true });
          if (!cancelled) {
            setIsIntakeComplete(true);
          }
        } catch {
          if (!cancelled) {
            setStatus("Connection failed. Please retry.");
          }
        }
      }
    }
    void bootstrap().catch(() => {
      if (!cancelled) {
        setStatus("Connection failed. Please retry.");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!config.realtime) {
      return;
    }
    const subscription = subscribeRealtime(config.realtime, config.tenantId, conversationId, {
      onAiHandling: (enabled) => {
        setAiHandling(enabled);
        setStatus(enabled ? "AI assistant online" : "Connecting to a human agent...");
      },
      onHumanMessage: (body) => {
        setMessages((prev) => [
          ...prev,
          {
            id: newMessageId(),
            role: "human",
            body,
            createdAt: nowIso(),
          },
        ]);
      },
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [config.realtime, config.tenantId, conversationId]);

  // Persist messages + session metadata after every meaningful change.
  useEffect(() => {
    if (!persistedAppId) {
      return;
    }
    const fingerprint = `${conversationId ?? ""}|${messages.length}|${guestName}|${guestEmail}|${supportCaseId ?? ""}`;
    if (fingerprint === lastPersistedRef.current) {
      return;
    }
    lastPersistedRef.current = fingerprint;
    persistCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, conversationId, supportCaseId, guestName, guestEmail, persistedAppId]);

  async function fileToDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Could not read attachment."));
      reader.readAsDataURL(file);
    });
  }

  async function buildAttachmentMetadata(files: File[]): Promise<Array<Record<string, unknown>>> {
    const maxSizeBytes = 300_000;
    const maxFiles = 3;
    const selected = files.slice(0, maxFiles);
    const out: Array<Record<string, unknown>> = [];
    for (const file of selected) {
      const base: Record<string, unknown> = {
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || "application/octet-stream",
      };
      if (file.size <= maxSizeBytes) {
        const dataUrl = await fileToDataUrl(file);
        base.content_base64 = dataUrl.split(",")[1] ?? "";
      } else {
        base.skipped_reason = "File too large for inline transfer. Max 300KB.";
      }
      out.push(base);
    }
    return out;
  }

  async function sendMessage(): Promise<void> {
    const cleaned = sanitizeOutgoingMessage(text);
    if (!cleaned && attachments.length === 0) {
      return;
    }
    setText("");
    const outgoingAttachments = [...attachments];
    setAttachments([]);
    const userMessage: WidgetMessage = {
      id: newMessageId(),
      role: "visitor",
      body:
        cleaned ||
        `Sent ${outgoingAttachments.length} attachment${outgoingAttachments.length > 1 ? "s" : ""}.`,
      createdAt: nowIso(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);
    try {
      if (!client.hasLiveSession()) {
        await ensureHandshake({ resume: true });
      }
      const attachmentMetadata = await buildAttachmentMetadata(outgoingAttachments);
      const response = await client.processMessage(cleaned || "Attachment shared", {
        attachments: attachmentMetadata,
      });
      setAiHandling(response.ai_handling);
      setStatus(response.ai_handling ? "AI assistant online" : "Human agent mode");
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: response.sender_type === "human" ? "human" : "ai",
          body: response.response,
          createdAt: nowIso(),
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: newMessageId(),
          role: "system",
          body: error instanceof Error ? error.message : "Unable to send message right now.",
          createdAt: nowIso(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  async function submitGuestIntake(): Promise<void> {
    if (!guestName.trim() || !guestEmail.trim()) {
      setStatus("Please share your name and email to start.");
      return;
    }
    if (!guestEmail.includes("@")) {
      setStatus("Enter a valid email address.");
      return;
    }
    if (!guestId) {
      setGuestId(newGuestId());
    }
    try {
      await ensureHandshake();
      setIsIntakeComplete(true);
      setStatus("Secure session established.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to initialize secure session.");
    }
  }

  async function resetChat(): Promise<void> {
    setStatus("Starting a fresh chat...");
    try {
      await client.resetServerMemory();
    } catch {
      // Best effort; we always continue with the local reset below.
    }
    client.forgetSession();
    if (persistedAppId) {
      clearStoredSession(config.tenantId, persistedAppId);
    }
    const freshGuestId = newGuestId();
    setGuestId(freshGuestId);
    setConversationId(undefined);
    setSupportCaseId(undefined);
    setMessages([SYSTEM_READY]);
    setIsTyping(false);
    if (config.mode === "logged_in") {
      await ensureHandshake({ forceNew: true });
      return;
    }
    setIsIntakeComplete(false);
    setStatus("Ready for a new chat. Enter your details to start.");
  }

  function handleFilePick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (!files.length) {
      return;
    }
    setAttachments((prev) => [...prev, ...files].slice(0, 3));
    input.value = "";
  }

  function removeAttachment(name: string): void {
    setAttachments((prev) => prev.filter((item) => item.name !== name));
  }

  if (isMinimized) {
    return (
      <div class="chaster-widget-shell minimized">
        <button class="chaster-toggle" type="button" onClick={() => setIsMinimized(false)}>
          Open support chat
        </button>
      </div>
    );
  }

  return (
    <div class="chaster-widget-shell expanded">
      <div class="chaster-header">
        <div>
          <strong>Support</strong>
          <div class="chaster-status">{status}{!aiHandling ? " (human handover active)" : ""}</div>
        </div>
        <div class="chaster-header-actions">
          <button
            class="chaster-toggle chaster-reset"
            type="button"
            title="Start a brand new chat"
            onClick={() => void resetChat()}
          >
            New chat
          </button>
          <button class="chaster-toggle" type="button" onClick={() => setIsMinimized(true)}>
            Minimize
          </button>
        </div>
      </div>
      {!isIntakeComplete ? (
        <div class="chaster-intake">
          <h3>Welcome to Support</h3>
          <p>Share your details and we will start a secure chat session.</p>
          <input
            value={guestName}
            placeholder="Your name"
            onInput={(event) => setGuestName((event.target as HTMLInputElement).value)}
          />
          <input
            value={guestEmail}
            placeholder="Your email"
            type="email"
            onInput={(event) => setGuestEmail((event.target as HTMLInputElement).value)}
          />
          <button type="button" onClick={() => void submitGuestIntake()}>
            Start chat
          </button>
        </div>
      ) : (
        <>
          <div class="chaster-messages">
            {messages.map((item) => (
              <div class={`bubble ${item.role}`} key={item.id}>
                {item.body}
              </div>
            ))}
            {isTyping ? <div class="bubble system">Typing...</div> : null}
          </div>
          <div class="composer">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              class="hidden-file-input"
              onChange={handleFilePick}
            />
            <input
              value={text}
              placeholder="Type your message..."
              onInput={(event) => setText((event.target as HTMLInputElement).value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void sendMessage();
                }
              }}
            />
            <button type="button" class="attach-btn" onClick={() => fileInputRef.current?.click()}>
              Attach
            </button>
            <button type="button" onClick={() => void sendMessage()}>
              Send
            </button>
          </div>
          {attachments.length ? (
            <div class="attachment-strip">
              {attachments.map((file) => (
                <button type="button" class="attachment-chip" key={file.name} onClick={() => removeAttachment(file.name)}>
                  {file.name} x
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
