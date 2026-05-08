import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import type { Message, Thread, SearchResult } from "@/types/chat";

interface ApiConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  preview?: string;
}

interface ApiMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider?: string | null;
  model?: string | null;
  attachments?: unknown[];
  createdAt: string;
}

const toThread = (c: ApiConversation): Thread => ({
  id: c.id,
  title: c.title,
  createdAt: new Date(c.createdAt).getTime(),
  updatedAt: new Date(c.updatedAt).getTime(),
  preview: c.preview ?? "",
});

const toMessage = (m: ApiMessage): Message => ({
  id: m.id,
  threadId: m.conversationId,
  role: m.role,
  content: m.content,
  createdAt: new Date(m.createdAt).getTime(),
  meta: m.provider || m.model
    ? { provider: m.provider ?? undefined, model: m.model ?? undefined }
    : undefined,
});

export const conversationKeys = {
  all: ["conversations"] as const,
  list: () => [...conversationKeys.all, "list"] as const,
  detail: (id: string) => [...conversationKeys.all, "detail", id] as const,
  search: (q: string) => [...conversationKeys.all, "search", q] as const,
};

export function useConversations() {
  return useQuery({
    queryKey: conversationKeys.list(),
    queryFn: async () => {
      const res = await apiClient.get<{ conversations: ApiConversation[] }>(
        "/conversations",
      );
      return res.conversations.map(toThread);
    },
  });
}

export function useConversationMessages(id: string | null) {
  return useQuery({
    queryKey: id ? conversationKeys.detail(id) : ["conversations", "detail", "none"],
    enabled: !!id,
    queryFn: async () => {
      const res = await apiClient.get<{ messages: ApiMessage[] }>(
        `/conversations/${id}/messages`,
      );
      return res.messages.map(toMessage);
    },
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title?: string) => {
      const res = await apiClient.post<{ conversation: ApiConversation }>(
        "/conversations",
        { title },
      );
      return toThread(res.conversation);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationKeys.list() });
    },
  });
}

export function useRenameConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await apiClient.patch<{ conversation: ApiConversation }>(
        `/conversations/${id}`,
        { title },
      );
      return toThread(res.conversation);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: conversationKeys.list() });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete<{ ok: true }>(`/conversations/${id}`);
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: conversationKeys.list() });
      qc.removeQueries({ queryKey: conversationKeys.detail(id) });
    },
  });
}

export function useSearchConversations(q: string) {
  return useQuery({
    queryKey: conversationKeys.search(q),
    enabled: q.trim().length > 0,
    queryFn: async () => {
      const res = await apiClient.get<{ results: SearchResult[] }>(
        `/conversations/search?q=${encodeURIComponent(q)}`,
      );
      return res.results;
    },
  });
}

/**
 * Helpers used by the streaming chat consumer to mutate the React Query cache
 * directly so tokens render instantly without per-chunk refetches.
 */
export const conversationCache = {
  prependLocalMessage(qc: QueryClient, conversationId: string, message: Message) {
    qc.setQueryData<Message[]>(
      conversationKeys.detail(conversationId),
      (prev) => [...(prev ?? []), message],
    );
  },
  appendDelta(
    qc: QueryClient,
    conversationId: string,
    messageId: string,
    delta: string,
  ) {
    qc.setQueryData<Message[]>(
      conversationKeys.detail(conversationId),
      (prev) =>
        (prev ?? []).map((m) =>
          m.id === messageId ? { ...m, content: m.content + delta } : m,
        ),
    );
  },
  patchMessage(
    qc: QueryClient,
    conversationId: string,
    messageId: string,
    patch: Partial<Message>,
  ) {
    qc.setQueryData<Message[]>(
      conversationKeys.detail(conversationId),
      (prev) =>
        (prev ?? []).map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
    );
  },
  bumpListPreview(
    qc: QueryClient,
    conversationId: string,
    preview: string,
  ) {
    qc.setQueryData<Thread[]>(conversationKeys.list(), (prev) =>
      (prev ?? []).map((t) =>
        t.id === conversationId
          ? { ...t, preview, updatedAt: Date.now() }
          : t,
      ),
    );
  },
};
