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
  projectId?: string | null;
  createdAt: string;
  updatedAt: string;
  preview?: string;
}

interface ApiAttachment {
  id?: string;
  name?: string;
  kind?: "image" | "file" | "audio" | "video";
  url?: string;
  mimeType?: string;
  size?: number;
}

interface ApiMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider?: string | null;
  model?: string | null;
  attachments?: ApiAttachment[];
  createdAt: string;
}

const toThread = (c: ApiConversation): Thread => ({
  id: c.id,
  title: c.title,
  projectId: c.projectId ?? null,
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
  attachments:
    Array.isArray(m.attachments) && m.attachments.length > 0
      ? m.attachments
          .filter((a): a is ApiAttachment & { id: string; name: string } =>
            !!a && typeof a.id === "string" && typeof a.name === "string",
          )
          .map((a) => ({
            id: a.id,
            name: a.name,
            kind: a.kind === "image" ? "image" : "file",
            url: a.url,
            mimeType: a.mimeType,
            size: a.size,
          }))
      : undefined,
  meta: m.provider || m.model
    ? { provider: m.provider ?? undefined, model: m.model ?? undefined }
    : undefined,
});

/**
 * `projectId`:
 *   - undefined → all conversations the caller can see
 *   - "unfiled" → conversations not in any project
 *   - "<uuid>"  → that specific project
 */
export type ConversationFilter = string | undefined;

export const conversationKeys = {
  all: ["conversations"] as const,
  list: (filter: ConversationFilter = undefined) =>
    [...conversationKeys.all, "list", filter ?? "all"] as const,
  detail: (id: string) => [...conversationKeys.all, "detail", id] as const,
  search: (q: string) => [...conversationKeys.all, "search", q] as const,
};

export function useConversations(filter?: ConversationFilter) {
  return useQuery({
    queryKey: conversationKeys.list(filter),
    queryFn: async () => {
      const path = filter
        ? `/conversations?projectId=${encodeURIComponent(filter)}`
        : "/conversations";
      const res = await apiClient.get<{ conversations: ApiConversation[] }>(
        path,
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
      qc.invalidateQueries({ queryKey: conversationKeys.all });
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
      qc.invalidateQueries({ queryKey: conversationKeys.all });
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
      qc.invalidateQueries({ queryKey: conversationKeys.all });
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
    // Update every cached list view (all, unfiled, per-project) so the user
    // sees the new preview regardless of which sidebar tab they're on.
    qc.setQueriesData<Thread[]>({ queryKey: conversationKeys.all }, (prev) =>
      Array.isArray(prev)
        ? prev.map((t) =>
            t.id === conversationId
              ? { ...t, preview, updatedAt: Date.now() }
              : t,
          )
        : prev,
    );
  },
};
