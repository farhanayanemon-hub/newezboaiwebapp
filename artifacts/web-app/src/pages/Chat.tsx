import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ChatTitleSlot, ChatHeaderRight } from "@/components/ChatHeaderControls";
import { MessageList } from "@/components/MessageList";
import { InputBar } from "@/components/InputBar";
import { QuickActionChips } from "@/components/QuickActionChips";
import { EmptyState } from "@/components/EmptyState";
import {
  useChatStore,
  useActiveThread,
  useActiveMessages,
} from "@/stores/chatStore";
import { streamChat } from "@/lib/streamChat";

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [streamingThreadIds, setStreamingThreadIds] = useState<Set<string>>(
    () => new Set(),
  );
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const activeThread = useActiveThread();
  const messages = useActiveMessages();
  const createThread = useChatStore((s) => s.createThread);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const appendToMessage = useChatStore((s) => s.appendToMessage);
  const threads = useChatStore((s) => s.threads);
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const activeThreadId = useChatStore((s) => s.activeThreadId);
  const selectedModelId = useChatStore((s) => s.selectedModelId);

  useEffect(() => {
    if (!activeThreadId && threads.length > 0) {
      setActiveThread(threads[0].id);
    }
  }, [activeThreadId, threads, setActiveThread]);

  useEffect(() => {
    return () => {
      for (const ctrl of abortControllers.current.values()) ctrl.abort();
      abortControllers.current.clear();
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

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    let threadId = activeThreadId;
    if (!threadId) threadId = createThread();
    const targetThreadId = threadId;

    if (abortControllers.current.has(targetThreadId)) return;

    addMessage(targetThreadId, "user", trimmed);
    setInput("");

    const assistantMessage = addMessage(targetThreadId, "assistant", "");
    markStreaming(targetThreadId, true);

    const ctrl = new AbortController();
    abortControllers.current.set(targetThreadId, ctrl);

    const store = useChatStore.getState();
    const history = store.messagesByThread[targetThreadId] ?? [];
    const conversation = history
      .filter((m) => m.id !== assistantMessage.id)
      .map((m) => ({ role: m.role, content: m.content }))
      .filter((m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") && m.content.length > 0,
      );

    try {
      await streamChat(
        {
          messages: conversation,
          modelOverride: selectedModelId ?? undefined,
          signal: ctrl.signal,
        },
        {
          onChunk: (delta) => {
            appendToMessage(targetThreadId, assistantMessage.id, delta);
          },
          onDone: (info) => {
            updateMessage(targetThreadId, assistantMessage.id, { meta: info });
          },
          onError: (msg) => {
            updateMessage(targetThreadId, assistantMessage.id, {
              meta: { error: msg },
              content:
                useChatStore
                  .getState()
                  .messagesByThread[targetThreadId]?.find(
                    (m) => m.id === assistantMessage.id,
                  )?.content || "",
            });
          },
        },
      );
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        const msg = err instanceof Error ? err.message : String(err);
        updateMessage(targetThreadId, assistantMessage.id, {
          meta: { error: msg },
        });
      }
    } finally {
      abortControllers.current.delete(targetThreadId);
      markStreaming(targetThreadId, false);
    }
  };

  const handleStop = () => {
    if (!activeThreadId) return;
    const ctrl = abortControllers.current.get(activeThreadId);
    if (ctrl) {
      ctrl.abort();
      abortControllers.current.delete(activeThreadId);
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
