import { pgTable, text, timestamp, uuid, serial, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Single-use tokens for email verification and password reset. We store
 * only the SHA-256 hash of the token (not the raw value) so a DB leak
 * doesn't grant the attacker the live URLs we emailed users.
 */
export const emailVerificationTokensTable = pgTable(
  "email_verification_tokens",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("email_verification_tokens_user_idx").on(t.userId),
  }),
);

export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("password_reset_tokens_user_idx").on(t.userId),
  }),
);

export type EmailVerificationToken = typeof emailVerificationTokensTable.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
