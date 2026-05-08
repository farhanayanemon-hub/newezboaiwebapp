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
  createdAt: number;
  updatedAt: number;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  badge?: string;
}
