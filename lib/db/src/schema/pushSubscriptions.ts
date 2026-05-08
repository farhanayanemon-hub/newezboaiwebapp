import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** A single Web Push endpoint registered by a browser. We keep one row per
 *  unique endpoint URL — the browser regenerates the URL when it rotates,
 *  and 410 Gone responses signal we should delete the row. */
export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export const pushSubscriptionsTable = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpoint: text("endpoint").notNull(),
    keys: jsonb("keys").$type<PushSubscriptionKeys>().notNull(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    endpointUniq: uniqueIndex("push_subs_endpoint_uniq").on(t.endpoint),
  }),
);

export type PushSub = typeof pushSubscriptionsTable.$inferSelect;
export type InsertPushSub = typeof pushSubscriptionsTable.$inferInsert;
