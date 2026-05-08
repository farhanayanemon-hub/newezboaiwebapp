import { pgTable, text, timestamp, integer, boolean, serial } from "drizzle-orm/pg-core";

/**
 * Single-row SMTP config for outgoing email (verification, password reset,
 * admin notifications). The password is stored AES-GCM encrypted at rest
 * via the existing crypto helper. We always read/write row id = 1.
 */
export const smtpConfigTable = pgTable("smtp_config", {
  id: serial("id").primaryKey(),
  host: text("host").notNull().default(""),
  port: integer("port").notNull().default(587),
  secure: boolean("secure").notNull().default(false),
  username: text("username").notNull().default(""),
  encryptedPassword: text("encrypted_password").notNull().default(""),
  fromAddress: text("from_address").notNull().default(""),
  fromName: text("from_name").notNull().default(""),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SmtpConfig = typeof smtpConfigTable.$inferSelect;
