import { useMemo, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import type { Message } from "@/types/chat";
import { MessageBubble } from "@/components/MessageBubble";
import { TypingIndicator } from "@/components/TypingIndicator";
import { useAutoScroll } from "@/hooks/useAutoScroll";

interface MessageListProps {
  messages: Message[];
  isTyping?: boolean;
}

export function MessageList({ messages, isTyping }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Single source of truth for the "assistant is responding" state.
  //
  // Chat.tsx eagerly inserts an empty assistant placeholder message into the
  // cache the moment the user sends a turn (so onChunk can append into it).
  // Without coordination, this placeholder rendered as a second empty bubble
  // alongside the TypingIndicator — that's the visible "duplicate".
  //
  // Rules enforced here:
  // 1. Hide any assistant message that has no content yet (placeholder).
  // 2. Show TypingIndicator only while we're streaming AND the assistant
  //    has not produced any content yet. The instant the first token
  //    arrives the placeholder gains content and we render its bubble
  //    instead — the indicator vanishes in the same render pass.
  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (m) => !(m.role === "assistant" && (m.content ?? "").length === 0),
      ),
    [messages],
  );

  const lastAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]!.role === "assistant") return messages[i]!;
    }
    return null;
  }, [messages]);

  const assistantHasContent = !!(lastAssistant?.content ?? "").length;
  const showIndicator = !!isTyping && !assistantHasContent;

  useAutoScroll(containerRef, [visibleMessages.length, showIndicator], {
    threshold: 140,
  });

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
      data-testid="message-list"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        <AnimatePresence initial={false}>
          {visibleMessages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {showIndicator && <TypingIndicator key="typing" />}
        </AnimatePresence>
      </div>
    </div>
  );
}
