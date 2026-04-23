import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { subscribeRealtime } from "./realtime";
import { sanitizeOutgoingMessage } from "./sanitize";
import { SecurityClient } from "./securityClient";
import type { ChasterWidgetConfig, WidgetMessage } from "./types";

interface Props {
  config: ChasterWidgetConfig;
}

const nowIso = () => new Date().toISOString();

export function App({ config }: Props) {
  const client = useMemo(() => new SecurityClient(config), [config]);
  const [messages, setMessages] = useState<WidgetMessage[]>([
    {
      id: crypto.randomUUID(),
      role: "system",
      body: "Support chat is ready.",
      createdAt: nowIso(),
    },
  ]);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [isMinimized, setIsMinimized] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [aiHandling, setAiHandling] = useState(true);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isIntakeComplete, setIsIntakeComplete] = useState(config.mode === "logged_in");
  const [guestName, setGuestName] = useState(config.guestName ?? "");
  const [guestEmail, setGuestEmail] = useState(config.guestEmail ?? "");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function ensureHandshake(): Promise<void> {
    if (!config.appId) {
      throw new Error("Missing appId configuration.");
    }
    const result = await client.handshake({
      app_id: config.appId,
      tenant_id: config.tenantId,
      mode: config.mode ?? "anonymous",
      user_id: config.userId,
      guest_id: config.guestId,
      guest_name: guestName || undefined,
      guest_email: guestEmail || undefined,
    });
    setConversationId(result.conversation_id);
    setAiHandling(result.ai_handling);
    setStatus(result.ai_handling ? "AI assistant online" : "Connecting to a human agent...");
  }

  useEffect(() => {
    if (config.mode === "logged_in") {
      void ensureHandshake().catch(() => {
        setStatus("Connection failed. Please retry.");
      });
    }
    // handshake is intentionally run once on mount
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
            id: crypto.randomUUID(),
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
      id: crypto.randomUUID(),
      role: "visitor",
      body:
        cleaned ||
        `Sent ${outgoingAttachments.length} attachment${outgoingAttachments.length > 1 ? "s" : ""}.`,
      createdAt: nowIso(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsTyping(true);
    try {
      if (!conversationId) {
        await ensureHandshake();
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
          id: crypto.randomUUID(),
          role: response.sender_type === "human" ? "human" : "ai",
          body: response.response,
          createdAt: nowIso(),
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
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
    try {
      await ensureHandshake();
      setIsIntakeComplete(true);
      setStatus("Secure session established.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to initialize secure session.");
    }
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
        <div>
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
