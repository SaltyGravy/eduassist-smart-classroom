import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const authUsers = sqliteTable("auth_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["faculty", "student"] }).notNull(),
  isAdmin: integer("is_admin").notNull().default(0),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  mustChangePassword: integer("must_change_password").notNull().default(1),
  passwordSalt: text("password_salt").notNull(),
  passwordHash: text("password_hash").notNull(),
  deviceHash: text("device_hash"),
  deviceLabel: text("device_label"),
  deviceRegisteredAt: text("device_registered_at"),
  lastLoginAt: text("last_login_at"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    deviceHash: text("device_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const authAuditLog = sqliteTable(
  "auth_audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    targetUserId: text("target_user_id").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("auth_audit_created_idx").on(table.createdAt),
    index("auth_audit_target_idx").on(table.targetUserId),
  ],
);

export const authSystemFlags = sqliteTable("auth_system_flags", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
