import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const authUsers = sqliteTable(
  "auth_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["faculty", "student"] }).notNull(),
    department: text("department").notNull().default(""),
    section: text("section").notNull().default(""),
    rollNumber: text("roll_number").notNull().default(""),
    semester: text("semester").notNull().default(""),
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
  },
  (table) => [
    uniqueIndex("auth_users_student_roll_unique").on(table.rollNumber).where(sql`${table.role} = 'student' AND ${table.rollNumber} <> ''`),
  ],
);

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

export const authDeviceChanges = sqliteTable(
  "auth_device_changes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    changedBy: text("changed_by").notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("auth_device_changes_user_idx").on(table.userId, table.createdAt)],
);

export const classroomClasses = sqliteTable(
  "classroom_classes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    subjectName: text("subject_name").notNull(),
    subjectCode: text("subject_code").notNull(),
    semester: text("semester").notNull(),
    section: text("section").notNull(),
    classCode: text("class_code").notNull(),
    facultyUserId: integer("faculty_user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("classroom_classes_code_unique").on(table.classCode),
    index("classroom_classes_faculty_idx").on(table.facultyUserId),
  ],
);

export const classEnrolments = sqliteTable(
  "class_enrolments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    classId: integer("class_id").notNull().references(() => classroomClasses.id, { onDelete: "cascade" }),
    studentUserId: integer("student_user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("class_enrolments_unique").on(table.classId, table.studentUserId),
    index("class_enrolments_student_idx").on(table.studentUserId),
  ],
);

export const attendanceSessions = sqliteTable(
  "attendance_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    classId: integer("class_id").notNull().references(() => classroomClasses.id, { onDelete: "cascade" }),
    qrToken: text("qr_token").notNull(),
    manualCode: text("manual_code").notNull(),
    manualCodeEnabled: integer("manual_code_enabled").notNull().default(0),
    startsAt: text("starts_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
    status: text("status", { enum: ["active", "closed"] }).notNull().default("active"),
    rotationSeconds: integer("rotation_seconds").notNull().default(10),
    createdBy: integer("created_by").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    closedAt: text("closed_at"),
  },
  (table) => [
    uniqueIndex("attendance_sessions_token_unique").on(table.qrToken),
    uniqueIndex("attendance_sessions_code_unique").on(table.manualCode),
    uniqueIndex("attendance_sessions_active_unique").on(table.classId).where(sql`${table.status} = 'active'`),
    index("attendance_sessions_class_idx").on(table.classId),
    index("attendance_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const attendanceRecords = sqliteTable(
  "attendance_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").notNull().references(() => attendanceSessions.id, { onDelete: "cascade" }),
    studentUserId: integer("student_user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["present", "late", "absent"] }).notNull(),
    source: text("source", { enum: ["qr", "manual", "automatic"] }).notNull(),
    markedAt: text("marked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    correctedBy: integer("corrected_by").references(() => authUsers.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("attendance_records_unique").on(table.sessionId, table.studentUserId),
    index("attendance_records_student_idx").on(table.studentUserId),
  ],
);
