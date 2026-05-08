import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const conversationsTable = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull().default("New chat"),
    // Owner of the conversation. Nullable so anonymous (not logged-in)
    // visitors can still chat; their rows have user_id IS NULL and form a
    // shared "guest" pool that any anonymous request sees.
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    // Optional folder grouping. NULL = "Unfiled". Set NULL when the project
    // is deleted so the conversations themselves survive.
    projectId: uuid("project_id").references(() => projectsTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("conversations_user_idx").on(t.userId, t.updatedAt),
    projectIdx: index("conversations_project_idx").on(t.projectId, t.updatedAt),
  }),
);

export type Conversation = typeof conversationsTable.$inferSelect;
export type InsertConversation = typeof conversationsTable.$inferInsert;
