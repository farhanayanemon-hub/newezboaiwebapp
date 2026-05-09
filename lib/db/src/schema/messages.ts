import { pgTable, text, timestamp, uuid, jsonb, index } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";

export const messageRoles = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof messageRoles)[number];

export interface MessageAttachmentMeta {
  id?: string;
  name?: string;
  kind?: "image" | "file" | "audio" | "video";
  url?: string;
  mimeType?: string;
  size?: number;
}

/** Cited web-search source rendered as a chip under the assistant reply. */
export interface MessageSource {
  title: string;
  url: string;
  domain?: string;
  snippet?: string;
}

export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull().default(""),
    provider: text("provider"),
    model: text("model"),
    attachments: jsonb("attachments")
      .$type<MessageAttachmentMeta[]>()
      .notNull()
      .default([]),
    sources: jsonb("sources").$type<MessageSource[]>().notNull().default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    convIdx: index("messages_conversation_idx").on(t.conversationId, t.createdAt),
  }),
);

export type Message = typeof messagesTable.$inferSelect;
export type InsertMessage = typeof messagesTable.$inferInsert;
