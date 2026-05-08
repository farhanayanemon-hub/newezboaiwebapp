export type Role = "user" | "assistant" | "system";

export interface MessageAttachment {
  id: string;
  name: string;
  kind: "image" | "file" | "audio" | "video";
  url?: string;
  size?: number;
  mimeType?: string;
}

export interface MessageMeta {
  provider?: string;
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export interface Message {
  id: string;
  threadId: string;
  role: Role;
  content: string;
  attachments?: MessageAttachment[];
  createdAt: number;
  isStreaming?: boolean;
  meta?: MessageMeta;
}

export interface Thread {
  id: string;
  title: string;
  projectId?: string | null;
  createdAt: number;
  updatedAt: number;
  preview?: string;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  badge?: string;
}

export interface Memory {
  id: string;
  key: string;
  value: string;
  source: "chat" | "manual";
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  conversationId: string;
  title: string;
  updatedAt: string;
  snippet: string;
}
