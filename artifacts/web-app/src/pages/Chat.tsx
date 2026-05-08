import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { AppShell } from "@/components/AppShell";
import { ChatTitleSlot, ChatHeaderRight } from "@/components/ChatHeaderControls";
import { MessageList } from "@/components/MessageList";
import { InputBar } from "@/components/InputBar";
import { QuickActionChips } from "@/components/QuickActionChips";
import { EmptyState } from "@/components/EmptyState";
import {
  TextInputDialog,
  LanguagePickerDialog,
  TonePickerDialog,
  EmailFormDialog,
} from "@/components/dialogs/QuickActionDialogs";
import { useChatStore } from "@/stores/chatStore";
import {
  useConversationMessages,
  conversationCache,
  conversationKeys,
} from "@/lib/conversations";
import { streamChat } from "@/lib/streamChat";
import {
  fillTemplate,
  recordQuickActionUse,
  type QuickActionDef,
} from "@/lib/quickActions";
import type { Message } from "@/types/chat";

interface PendingAction {
  action: QuickActionDef;
  /** The user's "input" content if it could be resolved automatically. */
  input: string | null;
}

export default function ChatPage() {
  const [input, setInput] = useState("");
  const [streamingConversationIds, setStreamingConversationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const qc = useQueryClient();
  const [location, setLocation] = useLocation();
  const search = useSearch();

  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const selectedModelId = useChatStore((s) => s.selectedModelId);

  const [pending, setPending] = useState<PendingAction | null>(null);

  // Sync URL ?c=<id> ↔ active conversation.
  useEffect(() => {
    const params = new URLSearchParams(search);
    const urlId = params.get("c");
    if (urlId && urlId !== activeConversationId) {
      setActiveConversation(urlId);
    }
  }, [search, activeConversationId, setActiveConversation]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const urlId = params.get("c");
    if (activeConversationId && urlId !== activeConversationId) {
      const next = new URLSearchParams(search);
      next.set("c", activeConversationId);
      setLocation(`${location.split("?")[0]}?${next.toString()}`, { replace: true });
    } else if (!activeConversationId && urlId) {
      setLocation(location.split("?")[0], { replace: true });
    }
  }, [activeConversationId, location, search, setLocation]);

  const { data: messages = [] } = useConversationMessages(activeConversationId);

  useEffect(() => {
    return () => {
      for (const ctrl of abortControllers.current.values()) ctrl.abort();
      abortControllers.current.clear();
    };
  }, []);

  const isActiveStreaming = activeConversationId
    ? streamingConversationIds.has(activeConversationId)
    : false;

  const markStreaming = (id: string, on: boolean) => {
    setStreamingConversationIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  /**
   * Core stream runner: sends `prompt` as the next user message and streams
   * an assistant reply into the React Query cache. Used by both manual
   * input and quick actions.
   */
  // Single-flight lock for new-conversation streams so a chip click and an
  // input send can't race to spawn two parallel conversations before the
  // first SSE `conversation` event resolves.
  const newConvLock = useRef(false);

  const runStream = async (prompt: string, taskType?: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    if (!activeConversationId) {
      if (newConvLock.current) return;
      newConvLock.current = true;
    }

    const optimisticConvId = activeConversationId ?? `pending-${nanoid(8)}`;
    if (abortControllers.current.has(optimisticConvId)) {
      if (!activeConversationId) newConvLock.current = false;
      return;
    }

    const userMessage: Message = {
      id: `local-${nanoid(8)}`,
      threadId: optimisticConvId,
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const assistantMessage: Message = {
      id: `local-${nanoid(8)}`,
      threadId: optimisticConvId,
      role: "assistant",
      content: "",
      createdAt: Date.now() + 1,
    };

    if (activeConversationId) {
      conversationCache.prependLocalMessage(qc, activeConversationId, userMessage);
      conversationCache.prependLocalMessage(qc, activeConversationId, assistantMessage);
    }

    const ctrl = new AbortController();
    abortControllers.current.set(optimisticConvId, ctrl);
    markStreaming(optimisticConvId, true);

    let resolvedConvId = activeConversationId;

    const history = (
      qc.getQueryData<Message[]>(
        conversationKeys.detail(activeConversationId ?? ""),
      ) ?? []
    )
      .filter(
        (m) =>
          m.id !== assistantMessage.id &&
          m.id !== userMessage.id &&
          m.content.length > 0,
      )
      .map((m) => ({ role: m.role, content: m.content }))
      .filter((m): m is { role: "user" | "assistant"; content: string } =>
        m.role === "user" || m.role === "assistant",
      );
    history.push({ role: "user", content: trimmed });

    try {
      await streamChat(
        {
          messages: history,
          modelOverride: selectedModelId ?? undefined,
          taskType,
          conversationId: activeConversationId ?? undefined,
          signal: ctrl.signal,
        },
        {
          onConversation: ({ conversationId, created }) => {
            resolvedConvId = conversationId;
            if (created || !activeConversationId) {
              qc.setQueryData<Message[]>(
                conversationKeys.detail(conversationId),
                [
                  { ...userMessage, threadId: conversationId },
                  { ...assistantMessage, threadId: conversationId },
                ],
              );
              setActiveConversation(conversationId);
              markStreaming(conversationId, true);
              abortControllers.current.set(conversationId, ctrl);
              qc.invalidateQueries({ queryKey: conversationKeys.list() });
            }
          },
          onChunk: (delta) => {
            const cid = resolvedConvId;
            if (!cid) return;
            conversationCache.appendDelta(qc, cid, assistantMessage.id, delta);
          },
          onDone: (info) => {
            const cid = resolvedConvId;
            if (!cid) return;
            conversationCache.patchMessage(qc, cid, assistantMessage.id, {
              meta: {
                provider: info.provider,
                model: info.model,
                latencyMs: info.latencyMs,
                inputTokens: info.inputTokens,
                outputTokens: info.outputTokens,
              },
            });
            qc.invalidateQueries({ queryKey: conversationKeys.detail(cid) });
            qc.invalidateQueries({ queryKey: conversationKeys.list() });
          },
          onError: (msg) => {
            const cid = resolvedConvId;
            if (!cid) return;
            conversationCache.patchMessage(qc, cid, assistantMessage.id, {
              meta: { error: msg },
            });
            qc.invalidateQueries({ queryKey: conversationKeys.detail(cid) });
            qc.invalidateQueries({ queryKey: conversationKeys.list() });
          },
        },
      );
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const cid = resolvedConvId ?? activeConversationId;
      if (!isAbort && cid) {
        const msg = err instanceof Error ? err.message : String(err);
        conversationCache.patchMessage(qc, cid, assistantMessage.id, {
          meta: { error: msg },
        });
      }
      if (cid) {
        qc.invalidateQueries({ queryKey: conversationKeys.detail(cid) });
        qc.invalidateQueries({ queryKey: conversationKeys.list() });
      }
    } finally {
      abortControllers.current.delete(optimisticConvId);
      if (resolvedConvId) {
        abortControllers.current.delete(resolvedConvId);
        markStreaming(resolvedConvId, false);
      }
      markStreaming(optimisticConvId, false);
      newConvLock.current = false;
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    await runStream(trimmed);
  };

  const handleStop = () => {
    if (!activeConversationId) return;
    const ctrl = abortControllers.current.get(activeConversationId);
    if (ctrl) {
      ctrl.abort();
      abortControllers.current.delete(activeConversationId);
    }
    markStreaming(activeConversationId, false);
  };

  /**
   * Resolve the input source for a quick action, in order:
   * 1. Selected text (window.getSelection)
   * 2. Current value in the input box
   * 3. Last assistant message in this conversation
   * Returns null if nothing is found — caller will then prompt for input.
   */
  const resolveQuickActionInput = (): string | null => {
    if (typeof window !== "undefined") {
      const sel = window.getSelection?.()?.toString().trim();
      if (sel) return sel;
    }
    const fromInput = input.trim();
    if (fromInput) return fromInput;
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content.trim().length > 0);
    if (lastAssistant) return lastAssistant.content.trim();
    return null;
  };

  const handleQuickAction = (action: QuickActionDef) => {
    const auto = resolveQuickActionInput();
    // Custom actions and text-input built-ins always go through the text
    // dialog if no input was found — but if input IS found, run immediately.
    if (action.inputForm === "text") {
      if (auto) {
        runQuickActionWithVars(action, { input: auto });
      } else {
        setPending({ action, input: null });
      }
      return;
    }
    // Other forms always need extra params, so we open them; auto-input
    // (if any) is pre-filled.
    setPending({ action, input: auto });
  };

  const runQuickActionWithVars = (
    action: QuickActionDef,
    vars: Record<string, string>,
  ) => {
    const prompt = fillTemplate(action.promptTemplate, vars);
    recordQuickActionUse(action.id);
    setInput("");
    void runStream(prompt, action.taskType);
  };

  const handleExamplePrompt = (template: string) => setInput(template);

  const showEmpty = !activeConversationId || messages.length === 0;
  const visibleMessages = useMemo(() => messages, [messages]);

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
        <MessageList messages={visibleMessages} isTyping={isActiveStreaming} />
      )}

      {/* Quick action dialogs */}
      {pending?.action.inputForm === "text" && (
        <TextInputDialog
          open
          title={pending.action.label}
          description="Paste or type the text to process"
          onCancel={() => setPending(null)}
          onSubmit={(text) => {
            const action = pending.action;
            setPending(null);
            runQuickActionWithVars(action, { input: text });
          }}
        />
      )}
      {pending?.action.inputForm === "languagePicker" && (
        <LanguagePickerDialog
          open
          initialInput={pending.input ?? ""}
          needsInput={!pending.input}
          onCancel={() => setPending(null)}
          onSubmit={({ targetLang, input: inp }) => {
            const action = pending.action;
            setPending(null);
            runQuickActionWithVars(action, {
              targetLang,
              input: inp || (pending.input ?? ""),
            });
          }}
        />
      )}
      {pending?.action.inputForm === "tonePicker" && (
        <TonePickerDialog
          open
          initialInput={pending.input ?? ""}
          needsInput={!pending.input}
          onCancel={() => setPending(null)}
          onSubmit={({ tone, input: inp }) => {
            const action = pending.action;
            setPending(null);
            runQuickActionWithVars(action, {
              tone,
              input: inp || (pending.input ?? ""),
            });
          }}
        />
      )}
      {pending?.action.inputForm === "emailForm" && (
        <EmailFormDialog
          open
          onCancel={() => setPending(null)}
          onSubmit={(data) => {
            const action = pending.action;
            setPending(null);
            runQuickActionWithVars(action, data);
          }}
        />
      )}
    </AppShell>
  );
}
