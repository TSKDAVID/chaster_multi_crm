import { useCallback, useEffect, useRef, useState } from "react";

const NEAR_BOTTOM_PX = 150;

export function useMessageScroll(messagesLength: number, conversationId: string | null) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const [showNewFloat, setShowNewFloat] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = rootRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const onScroll = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = dist < NEAR_BOTTOM_PX;
    if (nearBottomRef.current) setShowNewFloat(false);
  }, []);

  useEffect(() => {
    if (!conversationId || messagesLength === 0) return;
    if (nearBottomRef.current) scrollToBottom("auto");
  }, [conversationId, messagesLength, scrollToBottom]);

  useEffect(() => {
    if (!conversationId) return;
    nearBottomRef.current = true;
    setShowNewFloat(false);
    requestAnimationFrame(() => scrollToBottom("auto"));
  }, [conversationId, scrollToBottom]);

  const afterPrependRestore = useCallback((prevHeight: number) => {
    const el = rootRef.current;
    if (!el) return;
    const next = el.scrollHeight;
    el.scrollTop += next - prevHeight;
  }, []);

  const notifyIncomingWhileScrolledUp = useCallback(() => {
    if (!nearBottomRef.current) setShowNewFloat(true);
  }, []);

  const dismissNewFloat = useCallback(() => {
    setShowNewFloat(false);
    scrollToBottom("smooth");
  }, [scrollToBottom]);

  return {
    rootRef,
    onScroll,
    scrollToBottom,
    afterPrependRestore,
    showNewFloat,
    isNearBottom: () => nearBottomRef.current,
    notifyIncomingWhileScrolledUp,
    dismissNewFloat,
  };
}
