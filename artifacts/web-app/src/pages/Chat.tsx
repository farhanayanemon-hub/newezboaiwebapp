import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  ChatTitleSlot,
  ChatHeaderRight,
} from "@/components/ChatHeaderControls";
import { MessageList } from "@/components/MessageList";
import { InputBar } from "@/components/InputBar";
import { QuickActionChips } from "@/components/QuickActionChips";
import { EmptyState } from "@/components/EmptyState";
import {
  useChatStore,
  useActiveThread,
  useActiveMessages,
} from "@/stores/chatStore";

const FAKE_AI_RESPONSE = `**Phase 3 e real AI ashbe** — ekhon eta just placeholder.

Ami apnar message peyechi. Phase 3 unlock hole apni:
- OpenAI / Anthropic / Gemini / xAI Grok / OpenRouter / Replicate — ja chaichen sob plug korte parben
- Bangla, Banglish, English — sob bhashay reply pabe
- Code, math, translation, summarization — sob handle korbo

\`\`\`typescript
// Sample code block formatting test
function greet(name: string): string {
  return \`Hello \${name}, ami EzboAI!\`;
}
\`\`\`

Ekhon shudhu UI testing er jonno ei placeholder dekhachi.`;

interface PendingReply {
  threadId: string;
  timerId: number;
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  // Thread-scoped streaming: switching threads while the fake AI "thinks"
  // must not leak the typing indicator/stop button into another conversation.
  const [streamingThreadIds, setStreamingThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const pendingRepliesRef = useRef<Map<string, PendingReply>>(new Map());

  const activeThread = useActiveThread();
  const messages = useActiveMessages();
  const createThread = useChatStore((s) => s.createThread);
  const addMessage = useChatStore((s) => s.addMessage);
  const threads = useChatStore((s) => s.threads);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const activeThreadId = useChatStore((s) => s.activeThreadId);

  useEffect(() => {
    if (!activeThreadId && threads.length > 0) {
      setActiveThread(threads[0].id);
    }
  }, [activeThreadId, threads, setActiveThread]);

  useEffect(() => {
    const pending = pendingRepliesRef.current;
    return () => {
      pending.forEach((p) => window.clearTimeout(p.timerId));
      pending.clear();
    };
  }, []);

  const isActiveStreaming = activeThreadId
    ? streamingThreadIds.has(activeThreadId)
    : false;

  const markStreaming = (threadId: string, on: boolean) => {
    setStreamingThreadIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(threadId);
      else next.delete(threadId);
      return next;
    });
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    let threadId = activeThreadId;
    if (!threadId) threadId = createThread();
    const targetThreadId = threadId;

    if (pendingRepliesRef.current.has(targetThreadId)) return;

    addMessage(targetThreadId, "user", trimmed);
    setInput("");

    markStreaming(targetThreadId, true);
    const timerId = window.setTimeout(() => {
      addMessage(targetThreadId, "assistant", FAKE_AI_RESPONSE);
      pendingRepliesRef.current.delete(targetThreadId);
      markStreaming(targetThreadId, false);
    }, 1500);
    pendingRepliesRef.current.set(targetThreadId, {
      threadId: targetThreadId,
      timerId,
    });
  };

  const handleStop = () => {
    if (!activeThreadId) return;
    const pending = pendingRepliesRef.current.get(activeThreadId);
    if (pending) {
      window.clearTimeout(pending.timerId);
      pendingRepliesRef.current.delete(activeThreadId);
    }
    markStreaming(activeThreadId, false);
  };

  const handleQuickAction = (template: string) => {
    setInput((prev) => (prev ? `${prev}\n\n${template}` : template));
  };

  const handleExamplePrompt = (template: string) => setInput(template);

  const showEmpty = !activeThread || messages.length === 0;

  return (
    <AppShell
      headerCenter={<ChatTitleSlot />}
      headerRight={<ChatHeaderRight />}
      scrollContent={false}
      footer={
        <>
          <QuickActionChips onSelect={handleQuickAction} />
          <InputBar
            value={input}
            onChange={setInput}
            onSend={handleSend}
            isStreaming={isActiveStreaming}
            onStop={handleStop}
            autoFocus
          />
        </>
      }
    >
      {showEmpty ? (
        <div className="flex-1 overflow-y-auto">
          <EmptyState onPromptSelect={handleExamplePrompt} />
        </div>
      ) : (
        <MessageList messages={messages} isTyping={isActiveStreaming} />
      )}
    </AppShell>
  );
}
