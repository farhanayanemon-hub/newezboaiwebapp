import { useEffect, useRef, useState } from "react";
import { ChatTopBar } from "@/components/ChatTopBar";
import { SidebarContent } from "@/components/Sidebar";
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

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const fakeTimerRef = useRef<number | null>(null);

  const activeThread = useActiveThread();
  const messages = useActiveMessages();
  const createThread = useChatStore((s) => s.createThread);
  const addMessage = useChatStore((s) => s.addMessage);
  const threads = useChatStore((s) => s.threads);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const activeThreadId = useChatStore((s) => s.activeThreadId);

  // On mount: if there are threads but none active, pick the most recent
  useEffect(() => {
    if (!activeThreadId && threads.length > 0) {
      setActiveThread(threads[0].id);
    }
  }, [activeThreadId, threads, setActiveThread]);

  useEffect(() => {
    return () => {
      if (fakeTimerRef.current) window.clearTimeout(fakeTimerRef.current);
    };
  }, []);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;

    let threadId = activeThreadId;
    if (!threadId) {
      threadId = createThread();
    }

    const targetThreadId = threadId;
    addMessage(targetThreadId, "user", trimmed);
    setInput("");

    // Fake AI response after 1.5s — Phase 3 will replace this
    setIsStreaming(true);
    fakeTimerRef.current = window.setTimeout(() => {
      // Inject into the target thread regardless of active thread; user expects
      // the reply to land in the conversation they sent it to.
      addMessage(targetThreadId, "assistant", FAKE_AI_RESPONSE);
      setIsStreaming(false);
    }, 1500);
  };

  const handleStop = () => {
    if (fakeTimerRef.current) {
      window.clearTimeout(fakeTimerRef.current);
      fakeTimerRef.current = null;
    }
    setIsStreaming(false);
  };

  const handleQuickAction = (template: string) => {
    setInput((prev) => (prev ? `${prev}\n\n${template}` : template));
  };

  const handleExamplePrompt = (template: string) => {
    setInput(template);
  };

  const showEmpty = !activeThread || messages.length === 0;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="hidden lg:flex lg:w-72 lg:flex-shrink-0 border-r border-sidebar-border">
        <SidebarContent />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatTopBar />

        <div className="flex flex-1 flex-col overflow-hidden">
          {showEmpty ? (
            <div className="flex-1 overflow-y-auto">
              <EmptyState onPromptSelect={handleExamplePrompt} />
            </div>
          ) : (
            <MessageList messages={messages} isTyping={isStreaming} />
          )}

          <QuickActionChips onSelect={handleQuickAction} />
          <InputBar
            value={input}
            onChange={setInput}
            onSend={handleSend}
            isStreaming={isStreaming}
            onStop={handleStop}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}
