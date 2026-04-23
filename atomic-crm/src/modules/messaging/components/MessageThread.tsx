import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslate, useNotify } from "ra-core";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCurrentUserRole } from "@/components/atomic-crm/access/useCurrentUserRole";
import { errorMessage } from "@/lib/errorMessage";
import { getSupabaseClient } from "@/components/atomic-crm/providers/supabase/supabase";
import {
  deleteMessage,
  editMessage,
  markConversationRead,
  sendMessage,
} from "../utils/messagingClient";
import { useMessages, type MessageRow } from "../hooks/useMessages";
import { useMessageScroll } from "../hooks/useMessageScroll";
import { useTypingIndicator } from "../hooks/useTypingIndicator";
import { MessageBubble, type LocalMessage } from "./MessageBubble";
import { MessageDateDivider } from "./MessageDateDivider";
import { TypingIndicator } from "./TypingIndicator";
import { ConversationHeader } from "./ConversationHeader";
import { MessageInput } from "./MessageInput";
import type { PresenceInfo } from "../hooks/usePresence";

const GROUP_MS = 2 * 60 * 1000;

function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type Props = {
  conversationId: string | null;
  threadTitle: string;
  threadSubtitle?: string | null;
  isChaster?: boolean;
  /** Portal HQ thread disclaimer */
  hqBanner?: "client" | "hq" | null;
  myUserId: string;
  myDisplayName: string;
  namesByUserId: Record<string, string>;
  presenceForOther?: PresenceInfo | null;
};

export function MessageThread({
  conversationId,
  threadTitle,
  threadSubtitle,
  isChaster,
  hqBanner,
  myUserId,
  myDisplayName,
  namesByUserId,
  presenceForOther,
}: Props) {
  const translate = useTranslate();
  const notify = useNotify();
  const { can, isOwnerSide } = useCurrentUserRole();
  const canDeleteAny = can("portal.messages.delete_any") || isOwnerSide;
  const canSend = can("portal.messages.send") || can("hq.messages.send");

  const {
    messages,
    isLoading,
    loadOlder,
    olderLoading,
    hasMoreOlder,
    prependOptimistic,
    replaceOptimisticId,
    markFailed,
    markSending,
  } = useMessages(conversationId);

  const scroll = useMessageScroll(messages.length, conversationId);
  const { typingPeers, emitTyping } = useTypingIndicator(
    conversationId,
    myUserId,
    myDisplayName,
  );

  const [replyingTo, setReplyingTo] = useState<MessageRow | null>(null);
  const skipNotifRef = useRef(true);

  useEffect(() => {
    if (!conversationId) return;
    void markConversationRead(conversationId);
    skipNotifRef.current = true;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    if (skipNotifRef.current) {
      skipNotifRef.current = false;
      return;
    }
    const last = messages[messages.length - 1];
    if (last?.sender_id && last.sender_id !== myUserId && !scroll.isNearBottom()) {
      scroll.notifyIncomingWhileScrolledUp();
    } else if (last?.sender_id === myUserId) {
      scroll.scrollToBottom("smooth");
    } else if (scroll.isNearBottom()) {
      scroll.scrollToBottom("smooth");
    }
  }, [conversationId, messages, myUserId, scroll]);

  const byId = useMemo(() => {
    const m = new Map<string, MessageRow>();
    for (const x of messages) m.set(x.id, x);
    return m;
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!conversationId) return;
    const replyId = replyingTo?.id ?? null;
    const tempId = crypto.randomUUID();
    const optimistic: LocalMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: myUserId,
      body: text,
      created_at: new Date().toISOString(),
      edited_at: null,
      is_deleted: false,
      reply_to_id: replyId,
      _local: "sending",
    };
    prependOptimistic(optimistic);
    scroll.scrollToBottom("smooth");
    setReplyingTo(null);
    const { data, error } = await sendMessage(conversationId, text, replyId);
    if (error || !data?.id) {
      markFailed(tempId);
      notify(error ? errorMessage(error) : translate("chaster.messages.send_error"), {
        type: "error",
      });
      return;
    }
    const { data: full, error: fetchErr } = await getSupabaseClient()
      .from("messages")
      .select(
        "id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, reply_to_id",
      )
      .eq("id", data.id)
      .single();
    if (fetchErr || !full) {
      replaceOptimisticId(tempId, {
        ...optimistic,
        id: data.id,
        reply_to_id: replyId,
        _local: undefined,
      });
    } else {
      replaceOptimisticId(tempId, full as MessageRow);
    }
  };

  const onScroll = () => {
    scroll.onScroll();
    const el = scroll.rootRef.current;
    if (el && el.scrollTop < 80 && hasMoreOlder && !olderLoading) {
      const prev = el.scrollHeight;
      void loadOlder().then(() => {
        requestAnimationFrame(() => scroll.afterPrependRestore(prev));
      });
    }
  };

  const retryOptimistic = async (tempId: string, body: string) => {
    if (!conversationId) return;
    markSending(tempId);
    const { data, error } = await sendMessage(conversationId, body, null);
    if (error || !data?.id) {
      markFailed(tempId);
      notify(error ? errorMessage(error) : translate("chaster.messages.send_error"), {
        type: "error",
      });
      return;
    }
    const { data: full } = await getSupabaseClient()
      .from("messages")
      .select(
        "id, conversation_id, sender_id, body, created_at, edited_at, is_deleted, reply_to_id",
      )
      .eq("id", data.id)
      .single();
    if (full) replaceOptimisticId(tempId, full as MessageRow);
  };

  const grouped = useMemo(() => {
    const out: {
      msg: LocalMessage;
      showAvatar: boolean;
      showName: boolean;
      showDate: boolean;
    }[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i] as LocalMessage;
      const prev = messages[i - 1];
      const showDate =
        !prev || localDayKey(prev.created_at) !== localDayKey(msg.created_at);
      let showAvatar = true;
      let showName = true;
      if (prev && !showDate) {
        const dt =
          new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime();
        if (prev.sender_id === msg.sender_id && dt <= GROUP_MS) {
          showAvatar = false;
          showName = false;
        }
      } else if (prev && showDate) {
        showAvatar = true;
        showName = true;
      }
      out.push({ msg, showAvatar, showName, showDate });
    }
    return out;
  }, [messages]);

  const handleDelete = async (m: MessageRow) => {
    if (!conversationId) return;
    const { error } = await deleteMessage(m.id, conversationId);
    if (error) notify(errorMessage(error), { type: "error" });
  };

  const jumpTo = useCallback((id: string) => {
    document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.classList.add("ring-2", "ring-primary");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 1500);
    }
  }, []);

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8 border border-dashed rounded-lg m-4">
        {translate("chaster.messages.thread_placeholder")}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 bg-background border border-border rounded-lg overflow-hidden">
      <ConversationHeader
        title={threadTitle}
        subtitle={threadSubtitle}
        isChaster={isChaster}
        presence={presenceForOther ?? undefined}
      />
      {hqBanner === "client" ? (
        <div className="px-4 py-2 text-xs bg-muted/60 text-muted-foreground border-b border-border">
          {translate("chaster.messages.hq_thread_banner")}
        </div>
      ) : null}
      {hqBanner === "hq" ? (
        <div className="px-4 py-2 text-xs bg-muted/60 text-muted-foreground border-b border-border">
          {translate("chaster.messages.hq_client_banner")}
        </div>
      ) : null}

      <div
        ref={scroll.rootRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto min-h-0 relative"
      >
        {olderLoading ? (
          <div className="flex justify-center py-2">
            <span className="h-5 w-5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
          </div>
        ) : null}
        {isLoading ? (
          <div className="p-4 space-y-3" aria-busy>
            {["w-3/4", "w-1/2", "w-2/3", "w-1/3", "w-3/5", "w-4/5"].map((w, i) => (
              <div
                key={i}
                className={cn(
                  "h-10 rounded-2xl animate-pulse bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:200%_100%]",
                  i % 2 === 0 ? "mr-auto" : "ml-auto",
                  w,
                )}
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground text-sm px-6">
            {translate("chaster.messages.no_messages")}
          </div>
        ) : (
          <div className="py-3">
            {grouped.map(({ msg, showAvatar, showName, showDate }) => (
              <div key={msg.id} id={`msg-${msg.id}`}>
                {showDate ? <MessageDateDivider iso={msg.created_at} /> : null}
                <MessageBubble
                  message={msg}
                  isOwn={msg.sender_id === myUserId}
                  showAvatar={showAvatar}
                  showName={showName}
                  senderName={
                    msg.sender_id ? namesByUserId[msg.sender_id] ?? "—" : translate("chaster.messages.unknown_sender")
                  }
                  canDeleteAny={canDeleteAny}
                  quotedPreview={
                    msg.reply_to_id
                      ? (byId.get(msg.reply_to_id)?.body ?? "").slice(0, 120)
                      : null
                  }
                  onJumpQuote={
                    msg.reply_to_id ? () => jumpTo(msg.reply_to_id!) : undefined
                  }
                  onReply={() => setReplyingTo(msg)}
                  onEdit={
                    msg.sender_id === myUserId && !msg._local
                      ? () => {
                          const next = window.prompt(
                            translate("chaster.messages.edit"),
                            msg.body,
                          );
                          if (next === null) return;
                          void (async () => {
                            const { error } = await editMessage(msg.id, next);
                            if (error) notify(errorMessage(error), { type: "error" });
                          })();
                        }
                      : undefined
                  }
                  onDelete={() => void handleDelete(msg)}
                  onRetry={
                    msg._local === "failed"
                      ? () => void retryOptimistic(msg.id, msg.body)
                      : undefined
                  }
                />
              </div>
            ))}
            <TypingIndicator peers={typingPeers} />
          </div>
        )}

        {scroll.showNewFloat ? (
          <div className="sticky bottom-3 flex justify-center pointer-events-none">
            <Button
              type="button"
              size="sm"
              className="pointer-events-auto shadow-lg animate-in fade-in slide-in-from-bottom-2"
              onClick={scroll.dismissNewFloat}
            >
              <ChevronDown className="h-4 w-4 mr-1" />
              {translate("chaster.messages.new_message_float")}
            </Button>
          </div>
        ) : null}
      </div>

      {canSend ? (
        <MessageInput
          replyingToPreview={replyingTo ? replyingTo.body.slice(0, 200) : null}
          onCancelReply={() => setReplyingTo(null)}
          onSend={(t) => void handleSend(t)}
          onTyping={emitTyping}
        />
      ) : null}
    </div>
  );
}
