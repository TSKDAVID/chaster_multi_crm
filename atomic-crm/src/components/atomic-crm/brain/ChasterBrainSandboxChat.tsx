import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslate } from "ra-core";
import { getSupabaseClient } from "../providers/supabase/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  clearSandboxMessages,
  loadSandboxMessages,
  saveSandboxMessages,
  type SandboxMsg,
} from "../portal/portalSandboxStorage";

const CHASTER_BRAIN_API_BASE_URL =
  import.meta.env.VITE_CHASTER_BRAIN_API_URL?.trim() ||
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  "https://brain-vd2i.onrender.com";

type SandboxApiPayload = {
  response?: string;
  detail?: string;
  intent?: string;
  confidence?: number;
  used_sources?: string[];
};

export type ChasterBrainSandboxChatProps = {
  tenantId: string | null;
  /** Separate localStorage namespaces for HQ vs portal testing the same tenant. */
  storageScope: "portal" | "hq";
  /** Settings card vs full sandbox page. */
  compact?: boolean;
};

export function ChasterBrainSandboxChat({
  tenantId,
  storageScope,
  compact = false,
}: ChasterBrainSandboxChatProps) {
  const translate = useTranslate();
  const [messages, setMessages] = useState<SandboxMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!tenantId) {
      setMessages([]);
      hydratedRef.current = true;
      return;
    }
    setMessages(loadSandboxMessages(tenantId, storageScope));
    hydratedRef.current = true;
  }, [tenantId, storageScope]);

  useEffect(() => {
    if (!tenantId || !hydratedRef.current) return;
    saveSandboxMessages(tenantId, messages, storageScope);
  }, [tenantId, messages, storageScope]);

  const clearChat = useCallback(() => {
    if (!tenantId) return;
    clearSandboxMessages(tenantId, storageScope);
    setMessages([]);
  }, [tenantId, storageScope]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || pending || !tenantId) return;
    setDraft("");
    const userMsg: SandboxMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
    };
    setMessages((m) => [...m, userMsg]);
    setPending(true);
    try {
      const {
        data: { session },
      } = await getSupabaseClient().auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error(
          "Your session has no access token. Sign out and sign in again, then retry the sandbox.",
        );
      }
      const res = await fetch(`${CHASTER_BRAIN_API_BASE_URL}/v1/control/sandbox/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ tenant_id: tenantId, message: text }),
      });
      const payload = (await res.json().catch(() => ({}))) as SandboxApiPayload;
      if (!res.ok) {
        throw new Error(
          `Sandbox request failed (${res.status}): ${
            typeof payload.detail === "string"
              ? payload.detail
              : "Check that the brain API is reachable and CORS allows this origin."
          }`,
        );
      }
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text:
            payload.response ||
            translate("chaster.portal.settings_sandbox_mock_reply"),
          meta:
            !compact &&
            (payload.intent != null ||
              payload.confidence != null ||
              (Array.isArray(payload.used_sources) && payload.used_sources.length > 0))
              ? {
                  intent: payload.intent,
                  confidence: payload.confidence,
                  used_sources: Array.isArray(payload.used_sources)
                    ? payload.used_sources
                    : undefined,
                }
              : undefined,
        },
      ]);
    } catch (error) {
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "Sandbox request failed. Check API connectivity.",
        },
      ]);
    } finally {
      setPending(false);
      queueMicrotask(() => {
        listRef.current?.scrollTo({
          top: listRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, [draft, pending, tenantId, translate, compact]);

  const listMax = compact ? "max-h-[200px]" : "max-h-[min(70vh,520px)]";

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border bg-card p-3 ${compact ? "min-h-[220px]" : "min-h-[320px]"}`}
    >
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!tenantId} onClick={clearChat}>
          {translate("chaster.portal.settings_sandbox_new_chat")}
        </Button>
      </div>
      <div ref={listRef} className={`flex-1 space-y-2 ${listMax} overflow-y-auto text-sm pr-1`}>
        {messages.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-xs">
            {translate("chaster.portal.settings_sandbox_empty")}
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="space-y-1">
              <div
                className={
                  m.role === "user"
                    ? "ml-8 rounded-lg bg-primary/10 px-3 py-2 text-right"
                    : "mr-8 rounded-lg bg-muted px-3 py-2"
                }
              >
                {m.text}
              </div>
              {!compact && m.role === "assistant" && m.meta ? (
                <div className="mr-8 flex flex-wrap gap-1.5 pl-1 text-xs text-muted-foreground">
                  {m.meta.intent != null ? (
                    <Badge variant="outline" className="font-normal">
                      {translate("chaster.brain_sandbox.meta_intent")}: {String(m.meta.intent)}
                    </Badge>
                  ) : null}
                  {m.meta.confidence != null ? (
                    <Badge variant="outline" className="font-normal">
                      {translate("chaster.brain_sandbox.meta_confidence")}:{" "}
                      {Number(m.meta.confidence).toFixed(2)}
                    </Badge>
                  ) : null}
                  {m.meta.used_sources && m.meta.used_sources.length > 0 ? (
                    <span className="w-full pt-0.5">
                      {translate("chaster.brain_sandbox.meta_sources")}:{" "}
                      {m.meta.used_sources.join(", ")}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={translate("chaster.portal.settings_sandbox_placeholder")}
          disabled={pending || !tenantId}
          aria-label={translate("chaster.portal.settings_sandbox_input_label")}
        />
        <Button type="submit" disabled={pending || !draft.trim() || !tenantId}>
          {translate("chaster.portal.settings_sandbox_send")}
        </Button>
      </form>
    </div>
  );
}
