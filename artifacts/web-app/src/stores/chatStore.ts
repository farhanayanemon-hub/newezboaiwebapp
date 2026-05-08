import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { Message, Thread, MessageAttachment, MessageMeta } from "@/types/chat";

interface ChatState {
  threads: Thread[];
  messagesByThread: Record<string, Message[]>;
  activeThreadId: string | null;
  selectedModelId: string | null;
  voiceOutputEnabled: boolean;

  createThread: (title?: string) => string;
  deleteThread: (id: string) => void;
  renameThread: (id: string, title: string) => void;
  setActiveThread: (id: string | null) => void;
  addMessage: (
    threadId: string,
    role: Message["role"],
    content: string,
    attachments?: MessageAttachment[],
    meta?: MessageMeta,
  ) => Message;
  updateMessage: (threadId: string, messageId: string, patch: Partial<Message>) => void;
  appendToMessage: (threadId: string, messageId: string, delta: string) => void;
  clearAll: () => void;
  setSelectedModel: (id: string | null) => void;
  toggleVoiceOutput: () => void;
}

const generateTitle = (content: string): string => {
  const trimmed = content.trim().replace(/\s+/g, " ");
  if (!trimmed) return "New chat";
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      threads: [],
      messagesByThread: {},
      activeThreadId: null,
      selectedModelId: null,
      voiceOutputEnabled: false,

      createThread: (title) => {
        const id = nanoid(10);
        const now = Date.now();
        const thread: Thread = {
          id,
          title: title?.trim() || "New chat",
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          threads: [thread, ...state.threads],
          messagesByThread: { ...state.messagesByThread, [id]: [] },
          activeThreadId: id,
        }));
        return id;
      },

      deleteThread: (id) => {
        set((state) => {
          const { [id]: _removed, ...remaining } = state.messagesByThread;
          const threads = state.threads.filter((t) => t.id !== id);
          const activeThreadId =
            state.activeThreadId === id ? threads[0]?.id ?? null : state.activeThreadId;
          return { threads, messagesByThread: remaining, activeThreadId };
        });
      },

      renameThread: (id, title) => {
        const trimmed = title.trim() || "New chat";
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === id ? { ...t, title: trimmed, updatedAt: Date.now() } : t,
          ),
        }));
      },

      setActiveThread: (id) => set({ activeThreadId: id }),

      addMessage: (threadId, role, content, attachments, meta) => {
        const message: Message = {
          id: nanoid(12),
          threadId,
          role,
          content,
          attachments,
          createdAt: Date.now(),
          meta,
        };
        set((state) => {
          const messages = state.messagesByThread[threadId] ?? [];
          const updatedMessages = [...messages, message];
          const isFirstUserMsg =
            role === "user" && messages.filter((m) => m.role === "user").length === 0;
          const updatedThreads = state.threads.map((t) =>
            t.id === threadId
              ? {
                  ...t,
                  updatedAt: Date.now(),
                  title:
                    isFirstUserMsg && (t.title === "New chat" || !t.title)
                      ? generateTitle(content)
                      : t.title,
                }
              : t,
          );
          return {
            messagesByThread: { ...state.messagesByThread, [threadId]: updatedMessages },
            threads: updatedThreads,
          };
        });
        return message;
      },

      updateMessage: (threadId, messageId, patch) => {
        set((state) => {
          const messages = state.messagesByThread[threadId] ?? [];
          return {
            messagesByThread: {
              ...state.messagesByThread,
              [threadId]: messages.map((m) =>
                m.id === messageId ? { ...m, ...patch } : m,
              ),
            },
          };
        });
      },

      appendToMessage: (threadId, messageId, delta) => {
        set((state) => {
          const messages = state.messagesByThread[threadId] ?? [];
          return {
            messagesByThread: {
              ...state.messagesByThread,
              [threadId]: messages.map((m) =>
                m.id === messageId ? { ...m, content: m.content + delta } : m,
              ),
            },
          };
        });
      },

      clearAll: () =>
        set({ threads: [], messagesByThread: {}, activeThreadId: null }),

      setSelectedModel: (id) => set({ selectedModelId: id }),
      toggleVoiceOutput: () =>
        set((state) => ({ voiceOutputEnabled: !state.voiceOutputEnabled })),
    }),
    {
      name: "ezboai-chat-store",
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        threads: state.threads,
        messagesByThread: state.messagesByThread,
        activeThreadId: state.activeThreadId,
        selectedModelId: state.selectedModelId,
        voiceOutputEnabled: state.voiceOutputEnabled,
      }),
    },
  ),
);

export const useActiveThread = (): Thread | null => {
  const activeId = useChatStore((s) => s.activeThreadId);
  const threads = useChatStore((s) => s.threads);
  return threads.find((t) => t.id === activeId) ?? null;
};

export const useActiveMessages = (): Message[] => {
  const activeId = useChatStore((s) => s.activeThreadId);
  const messagesByThread = useChatStore((s) => s.messagesByThread);
  return activeId ? messagesByThread[activeId] ?? [] : [];
};
