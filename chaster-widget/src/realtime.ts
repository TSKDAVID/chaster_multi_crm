import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

import type { RealtimeConfig } from "./types";

export interface RealtimeUpdateHandlers {
  onAiHandling: (enabled: boolean) => void;
  onHumanMessage: (body: string) => void;
}

export interface RealtimeSubscription {
  unsubscribe: () => void;
}

export function subscribeRealtime(
  config: RealtimeConfig,
  tenantId: string,
  conversationId: string | undefined,
  handlers: RealtimeUpdateHandlers,
): RealtimeSubscription {
  const client: SupabaseClient = createClient(config.url, config.anonKey);
  const channels: RealtimeChannel[] = [];

  const supportChannel = client
    .channel(`chaster-widget-support-${tenantId}-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "support_cases", filter: `tenant_id=eq.${tenantId}` },
      (payload) => {
        const value = payload.new as { ai_handling?: boolean } | null;
        if (typeof value?.ai_handling === "boolean") {
          handlers.onAiHandling(value.ai_handling);
        }
      },
    )
    .subscribe();
  channels.push(supportChannel);

  if (conversationId) {
    const messagesChannel = client
      .channel(`chaster-widget-messages-${conversationId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const value = payload.new as { body?: string } | null;
          if (value?.body) {
            handlers.onHumanMessage(value.body);
          }
        },
      )
      .subscribe();
    channels.push(messagesChannel);
  }

  return {
    unsubscribe: () => {
      for (const channel of channels) {
        void client.removeChannel(channel);
      }
    },
  };
}
