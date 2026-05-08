import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Optional per-domain credentials the user lets the AI use during browser
 * automations. Both username and password are AES-GCM encrypted at rest with
 * APP_ENCRYPTION_KEY (same as providerKeysTable). Domain is matched
 * case-insensitively, exact-host (no wildcard) for v1.
 */
export const siteCredentialsTable = pgTable(
  "site_credentials",
  {
    id: serial("id").primaryKey(),
    domain: text("domain").notNull(),
    encryptedUsername: text("encrypted_username").notNull(),
    encryptedPassword: text("encrypted_password").notNull(),
    notes: text("notes").default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    domainUq: uniqueIndex("site_credentials_domain_uq").on(t.domain),
  }),
);

export type SiteCredential = typeof siteCredentialsTable.$inferSelect;
