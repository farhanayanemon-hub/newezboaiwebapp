import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { messagesTable } from "./messages";

export const attachmentsTable = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").references(() => messagesTable.id, {
    onDelete: "cascade",
  }),
  kind: text("kind").notNull(),
  url: text("url").notNull(),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  extractedText: text("extracted_text"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Attachment = typeof attachmentsTable.$inferSelect;
export type InsertAttachment = typeof attachmentsTable.$inferInsert;
