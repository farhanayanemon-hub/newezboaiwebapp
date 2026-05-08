import { pgTable, text, timestamp, uuid, integer, index } from "drizzle-orm/pg-core";
import { messagesTable } from "./messages";

export const attachmentKinds = ["image", "pdf", "word", "spreadsheet", "text", "code", "other"] as const;
export type AttachmentKind = (typeof attachmentKinds)[number];

export const attachmentsTable = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").references(() => messagesTable.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    url: text("url").notNull(),
    originalName: text("original_name").notNull().default(""),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    sha256: text("sha256").notNull().default(""),
    extractedText: text("extracted_text"),
    extractError: text("extract_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    sha256Idx: index("attachments_sha256_idx").on(t.sha256),
    createdAtIdx: index("attachments_created_at_idx").on(t.createdAt),
  }),
);

export type Attachment = typeof attachmentsTable.$inferSelect;
export type InsertAttachment = typeof attachmentsTable.$inferInsert;
