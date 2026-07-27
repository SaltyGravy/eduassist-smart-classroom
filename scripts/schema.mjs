export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS auth_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('faculty', 'student')),
    department TEXT NOT NULL DEFAULT '',
    section TEXT NOT NULL DEFAULT '',
    roll_number TEXT NOT NULL DEFAULT '',
    semester TEXT NOT NULL DEFAULT '',
    is_admin INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    must_change_password INTEGER NOT NULL DEFAULT 1,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    device_hash TEXT,
    device_label TEXT,
    device_registered_at TEXT,
    last_login_at TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    device_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS auth_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_user_id TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS auth_system_flags (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS auth_device_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    changed_by TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS classroom_classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject_name TEXT NOT NULL,
    subject_code TEXT NOT NULL,
    semester TEXT NOT NULL,
    section TEXT NOT NULL,
    class_code TEXT NOT NULL UNIQUE,
    faculty_user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS class_enrolments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classroom_classes(id) ON DELETE CASCADE,
    student_user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(class_id, student_user_id)
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL REFERENCES classroom_classes(id) ON DELETE CASCADE,
    qr_token TEXT NOT NULL UNIQUE,
    manual_code TEXT NOT NULL UNIQUE,
    manual_code_enabled INTEGER NOT NULL DEFAULT 0,
    starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    rotation_seconds INTEGER NOT NULL DEFAULT 10,
    created_by INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    closed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    source TEXT NOT NULL,
    marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    corrected_by INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
    UNIQUE(session_id, student_user_id)
  )`,
  "CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id)",
  "CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at)",
  "CREATE INDEX IF NOT EXISTS auth_audit_created_idx ON auth_audit_log(created_at)",
  "CREATE INDEX IF NOT EXISTS auth_audit_target_idx ON auth_audit_log(target_user_id)",
  "CREATE INDEX IF NOT EXISTS auth_device_changes_user_idx ON auth_device_changes(user_id, created_at)",
  "DROP INDEX IF EXISTS auth_users_student_roll_unique",
  "CREATE UNIQUE INDEX IF NOT EXISTS auth_users_student_academic_identity_unique ON auth_users(department, section, roll_number) WHERE role = 'student' AND roll_number <> ''",
  "CREATE INDEX IF NOT EXISTS classroom_classes_faculty_idx ON classroom_classes(faculty_user_id)",
  "CREATE INDEX IF NOT EXISTS class_enrolments_student_idx ON class_enrolments(student_user_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS attendance_sessions_active_unique ON attendance_sessions(class_id) WHERE status = 'active'",
  "CREATE INDEX IF NOT EXISTS attendance_sessions_class_idx ON attendance_sessions(class_id)",
  "CREATE INDEX IF NOT EXISTS attendance_sessions_expiry_idx ON attendance_sessions(expires_at)",
  "CREATE INDEX IF NOT EXISTS attendance_records_student_idx ON attendance_records(student_user_id)",
];

export const tableOrder = [
  "auth_users",
  "auth_system_flags",
  "auth_device_changes",
  "auth_sessions",
  "auth_audit_log",
  "classroom_classes",
  "class_enrolments",
  "attendance_sessions",
  "attendance_records",
];

export const tableColumns = {
  auth_users: ["id", "user_id", "display_name", "role", "department", "section", "roll_number", "semester", "is_admin", "status", "must_change_password", "password_salt", "password_hash", "device_hash", "device_label", "device_registered_at", "last_login_at", "created_by", "created_at", "updated_at"],
  auth_sessions: ["token_hash", "user_id", "device_hash", "expires_at", "created_at"],
  auth_audit_log: ["id", "actor_user_id", "action", "target_user_id", "detail", "created_at"],
  auth_system_flags: ["key", "value", "created_at"],
  auth_device_changes: ["id", "user_id", "changed_by", "reason", "created_at"],
  classroom_classes: ["id", "subject_name", "subject_code", "semester", "section", "class_code", "faculty_user_id", "status", "created_at", "updated_at"],
  class_enrolments: ["id", "class_id", "student_user_id", "joined_at"],
  attendance_sessions: ["id", "class_id", "qr_token", "manual_code", "manual_code_enabled", "starts_at", "expires_at", "status", "rotation_seconds", "created_by", "closed_at"],
  attendance_records: ["id", "session_id", "student_user_id", "status", "source", "marked_at", "corrected_by"],
};
