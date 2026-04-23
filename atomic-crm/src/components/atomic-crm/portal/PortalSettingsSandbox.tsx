import { useCallback, useRef, useState } from "react";
import { useTranslate } from "ra-core";
import { useChasterAccess } from "../access/chasterAccessContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Msg = { id: string; role: "user" | "assistant"; text: string };
const CHASTER_BRAIN_API_BASE_URL =
  import.meta.env.VITE_CHASTER_BRAIN_API_URL?.trim() || "http://127.0.0.1:8010";

export function PortalSettingsSandbox() {
  const translate = useTranslate();
  const { tenantId } = useChasterAccess();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || pending || !tenantId) return;
    setDraft("");
    const userMsg: Msg = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
    };
    setMessages((m) => [...m, userMsg]);
    setPending(true);
    try {
      const res = await fetch(`${CHASTER_BRAIN_API_BASE_URL}/v1/control/sandbox/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, message: text }),
      });
      const payload = (await res.json().catch(() => ({}))) as
        | { response?: string; detail?: string }
        | Record<string, unknown>;
      if (!res.ok) {
        throw new Error(
          payload.detail || "Sandbox request failed. Ensure Chaster Brain is running.",
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
  }, [draft, pending, tenantId, translate]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 min-h-[220px]">
      <div
        ref={listRef}
        className="flex-1 space-y-2 max-h-[200px] overflow-y-auto text-sm pr-1"
      >
        {messages.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-xs">
            {translate("chaster.portal.settings_sandbox_empty")}
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-8 rounded-lg bg-primary/10 px-3 py-2 text-right"
                  : "mr-8 rounded-lg bg-muted px-3 py-2"
              }
            >
              {m.text}
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
