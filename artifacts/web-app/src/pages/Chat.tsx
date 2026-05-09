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
  AttachedFilesBar,
  useFileUploads,
  type AttachedItem,
} from "@/components/AttachedFilesBar";
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
import { apiClient } from "@/lib/api";
import { resetActiveSpeechQueue, stopActiveSpeech } from "@/lib/speech/speechQueue";
import { useContinuousListen } from "@/lib/speech/useContinuousListen";
import { useVoiceStore } from "@/stores/voiceStore";
import {
  fillTemplate,
  recordQuickActionUse,
  type QuickActionDef,
} from "@/lib/quickActions";
import type { Message, MessageAttachment } from "@/types/chat";
import type { FileFull, FileKind } from "@/lib/files";

interface PendingAction {
  action: QuickActionDef;
  /** The user's "input" content if it could be resolved automatically. */
  input: string | null;
}

function attachedItemToMeta(it: AttachedItem): MessageAttachment | null {
  if (!it.uploaded) return null;
  return {
    id: it.uploaded.id,
    name: it.uploaded.originalName,
    kind: it.uploaded.kind === "image" ? "image" : "file",
    url: it.uploaded.url,
    mimeType: it.uploaded.mimeType ?? undefined,
    size: it.uploaded.sizeBytes ?? undefined,
  };
}

export default function ChatPage() {
  const agentMode = useChatStore((s) => s.agentMode);
  const [input, setInput] = useState("");
  useEffect(() => {
    try {
      const pending = window.sessionStorage.getItem("ezboai-initial-prompt");
      if (pending) {
        window.sessionStorage.removeItem("ezboai-initial-prompt");
        setInput(pending);
      }
      const wantAuth = window.sessionStorage.getItem("ezboai-open-auth");
      if (wantAuth) {
        window.sessionStorage.removeItem("ezboai-open-auth");
        window.dispatchEvent(new CustomEvent("ezboai:open-auth", { detail: { mode: wantAuth === "signup" ? "signup" : "login" } }));
      }
    } catch { /* sessionStorage may be disabled */ }
  }, []);

  const [attached, setAttached] = useState<AttachedItem[]>([]);
  const { addFiles } = useFileUploads({ items: attached, setItems: setAttached });
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
  const pendingAttachments = useChatStore((s) => s.pendingAttachments);
  const clearPendingAttachments = useChatStore((s) => s.clearPendingAttachments);
  const autoSpeak = useVoiceStore((s) => s.autoSpeak);

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

  // Pick up any "Attach to new chat" pre-staged file IDs from the Files page.
  useEffect(() => {
    if (pendingAttachments.length === 0) return;
    const ids = pendingAttachments;
    clearPendingAttachments();
    void Promise.all(
      ids.map(async (id): Promise<AttachedItem | null> => {
        try {
          const res = await apiClient.get<{ file: FileFull }>(`/files/${id}`);
          const f = res.file;
          return {
            localId: `staged-${id}`,
            status: "ready",
            progress: 100,
            file: new File([], f.originalName),
            uploaded: {
              id: f.id,
              kind: f.kind as FileKind,
              url: f.url,
              mimeType: f.mimeType,
              sizeBytes: f.sizeBytes,
              originalName: f.originalName,
              sha256: f.sha256,
              extractedTextPreview: null,
              extractError: f.extractError,
              createdAt: f.createdAt,
            },
          };
        } catch {
          return null;
        }
      }),
    ).then((items) => {
      const ready = items.filter((i): i is AttachedItem => !!i);
      if (ready.length) setAttached((prev) => [...prev, ...ready]);
    });
  }, [pendingAttachments, clearPendingAttachments]);

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

  // Single-flight lock for new-conversation streams (Phase 5 fix).
  const newConvLock = useRef(false);

  const runStream = async (
    prompt: string,
    taskType?: string,
    attachmentIds?: string[],
    attachmentMeta?: MessageAttachment[],
  ) => {
    const trimmed = prompt.trim();
    const ids = attachmentIds ?? [];
    if (!trimmed && ids.length === 0) return;

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
      attachments: attachmentMeta && attachmentMeta.length ? attachmentMeta : undefined,
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

    // Fresh speech queue for this assistant turn. Cancel any prior speech.
    const speech = autoSpeak ? resetActiveSpeechQueue() : null;

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
    // Stream API requires content min 1; if user sent only files use a thin
    // placeholder so the route accepts the request.
    history.push({ role: "user", content: trimmed || "(see attached files)" });

    try {
      await streamChat(
        {
          messages: history,
          modelOverride: selectedModelId ?? undefined,
          taskType,
          conversationId: activeConversationId ?? undefined,
          attachmentIds: ids.length ? ids : undefined,
          useWebSearch: useWebSearchEnabled || agentMode,
          agentMode,
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
          onSources: (sources) => {
            const cid = resolvedConvId;
            if (!cid) return;
            conversationCache.patchMessage(qc, cid, assistantMessage.id, {
              meta: { sources },
            });
          },
          onChunk: (delta) => {
            const cid = resolvedConvId;
            if (!cid) return;
            conversationCache.appendDelta(qc, cid, assistantMessage.id, delta);
            speech?.feed(delta);
          },
          onDone: (info) => {
            speech?.flush();
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
    const readyAttachments = attached.filter(
      (a): a is AttachedItem & { uploaded: NonNullable<AttachedItem["uploaded"]> } =>
        a.status === "ready" && !!a.uploaded,
    );
    if (!trimmed && readyAttachments.length === 0) return;
    // Block send while uploads still in flight; user can hit X to remove.
    if (attached.some((a) => a.status === "uploading")) return;

    const ids = readyAttachments.map((a) => a.uploaded.id);
    const metas = readyAttachments
      .map(attachedItemToMeta)
      .filter((m): m is MessageAttachment => !!m);

    setInput("");
    setAttached([]);
    await runStream(trimmed, undefined, ids, metas);
  };

  const handleStop = () => {
    if (!activeConversationId) return;
    const ctrl = abortControllers.current.get(activeConversationId);
    if (ctrl) {
      ctrl.abort();
      abortControllers.current.delete(activeConversationId);
    }
    markStreaming(activeConversationId, false);
    stopActiveSpeech();
  };

  // Continuous-listen mode: when enabled, idle mic listens passively; on a
  // recognized utterance (optionally past the wake-phrase) we run the stream.
  useContinuousListen((text) => {
    if (!text.trim()) return;
    if (isActiveStreaming) return;
    void runStream(text);
  });

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
    if (action.inputForm === "text") {
      if (auto) {
        runQuickActionWithVars(action, { input: auto });
      } else {
        setPending({ action, input: null });
      }
      return;
    }
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
          <AttachedFilesBar items={attached} onChange={setAttached} />
          <InputBar
            value={input}
            onChange={setInput}
            onSend={handleSend}
            isStreaming={isActiveStreaming}
            onStop={handleStop}
            onFilesPicked={(files) => void addFiles(files)}
            hasAttachments={attached.some((a) => a.status === "ready")}
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
