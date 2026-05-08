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
import { useChatStore } from "@/stores/chatStore";
import {
  useConversationMessages,
  conversationCache,
  conversationKeys,
} from "@/lib/conversations";
import { streamChat } from "@/lib/streamChat";
import type { Message } from "@/types/chat";

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

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const optimisticConvId =
      activeConversationId ?? `pending-${nanoid(8)}`;
    if (abortControllers.current.has(optimisticConvId)) return;

    // Optimistic user message.
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

    setInput("");

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
        (m) => m.id !== assistantMessage.id && m.content.length > 0,
      )
      .map((m) => ({ role: m.role, content: m.content }))
      .filter((m): m is { role: "user" | "assistant"; content: string } =>
        m.role === "user" || m.role === "assistant",
      );
    if (!activeConversationId) {
      history.push({ role: "user", content: trimmed });
    }

    try {
      await streamChat(
        {
          messages: history,
          modelOverride: selectedModelId ?? undefined,
          conversationId: activeConversationId ?? undefined,
          signal: ctrl.signal,
        },
        {
          onConversation: ({ conversationId, created }) => {
            resolvedConvId = conversationId;
            if (created || !activeConversationId) {
              // Move optimistic messages from pending key to real conversation key.
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
            // Refetch authoritative messages so server-side IDs replace optimistic ones.
            qc.invalidateQueries({ queryKey: conversationKeys.detail(cid) });
            qc.invalidateQueries({ queryKey: conversationKeys.list() });
          },
          onError: (msg) => {
            const cid = resolvedConvId;
            if (!cid) return;
            conversationCache.patchMessage(qc, cid, assistantMessage.id, {
              meta: { error: msg },
            });
            // Reconcile with server state — partial assistant output may have
            // been persisted before the error.
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
      // Whether aborted or errored, reconcile with the server so optimistic
      // entries are replaced with whatever was actually persisted.
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
    }
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

  const handleQuickAction = (template: string) => {
    setInput((prev) => (prev ? `${prev}\n\n${template}` : template));
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
    </AppShell>
  );
}
