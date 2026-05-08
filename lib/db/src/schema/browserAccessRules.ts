import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Per-host allow/block list for the browser agent. Hosts are matched
 * exact-suffix (case-insensitive). The default policy is "allow everything
 * the urlGuard hasn't already rejected"; rules let an admin shrink the
 * surface area further (block social.example.com or allowlist a small set
 * of trusted domains for unattended automations).
 *
 * `mode = "block"` overrides everything else. If any `allow` rules exist,
 * non-matching public URLs are denied; absent any `allow` rules everything
 * not blocked is allowed.
 */
export const browserAccessRulesTable = pgTable(
  "browser_access_rules",
  {
    id: serial("id").primaryKey(),
    /** Bare hostname (e.g. "google.com"). Matches the host or any subdomain. */
    host: text("host").notNull(),
    mode: text("mode").notNull(), // "allow" | "block"
    note: text("note").default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    hostUq: uniqueIndex("browser_access_rules_host_uq").on(t.host),
  }),
);

export type BrowserAccessRule = typeof browserAccessRulesTable.$inferSelect;
export type NewBrowserAccessRule = typeof browserAccessRulesTable.$inferInsert;
