import { useRef } from "react";
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
  useAutoScroll(containerRef, [messages.length, isTyping], { threshold: 140 });

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
      data-testid="message-list"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-6">
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {isTyping && <TypingIndicator key="typing" />}
        </AnimatePresence>
      </div>
    </div>
  );
}
