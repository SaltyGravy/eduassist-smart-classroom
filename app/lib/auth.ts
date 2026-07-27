import { getDatabase, type AppDatabase } from "../../db/client";

export type AuthRole = "admin" | "faculty" | "student";
type StoredRole = "faculty" | "student";

export type PublicAuthUser = {
  userId: string;
  displayName: string;
  role: AuthRole;
  deviceLabel: string;
  deviceRegisteredAt: string;
  deviceBound: boolean;
  deviceChangesUsed: number;
  deviceChangesRemaining: number;
  deviceChangeWindowEnds: string | null;
  mustChangePassword: boolean;
};

export type ManagedUser = {
  userId: string;
  displayName: string;
  role: AuthRole;
  department: string;
  section: string;
  rollNumber: string;
  semester: string;
  status: "active" | "suspended";
  mustChangePassword: boolean;
  deviceRegistered: boolean;
  deviceLabel: string | null;
  deviceRegisteredAt: string | null;
  deviceChangesUsed: number;
  deviceChangesRemaining: number;
  deviceChangeWindowEnds: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type AuditEvent = {
  id: number;
  actorUserId: string;
  action: string;
  targetUserId: string;
  detail: string;
  createdAt: string;
};

type UserRow = {
  id: number;
  user_id: string;
  display_name: string;
  role: StoredRole;
  department: string;
  section: string;
  roll_number: string;
  semester: string;
  is_admin: number;
  status: "active" | "suspended";
  must_change_password: number;
  password_salt: string;
  password_hash: string;
  device_hash: string | null;
  device_label: string | null;
  device_registered_at: string | null;
  last_login_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRow = UserRow & { session_token_hash: string };
type DeviceChangeState = { used: number; remaining: number; windowEnds: string | null };
type ManagedUserRow = UserRow & { device_changes_used?: number; oldest_device_change?: string | null };

const SESSION_COOKIE = "eduassist_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
// Cloudflare Workers Web Crypto currently caps PBKDF2 at 100,000 rounds.
const PASSWORD_ITERATIONS = 100_000;
export const QR_ROTATION_DEFAULT_SECONDS = 10;
export const QR_ROTATION_MIN_SECONDS = 5;
export const QR_ROTATION_MAX_SECONDS = 60;
const QR_ROTATION_SETTING_KEY = "qr_rotation_seconds";
const encoder = new TextEncoder();
let schemaPromise: Promise<void> | null = null;

async function getBinding() {
  return getDatabase();
}

async function addMissingUserColumns(db: AppDatabase) {
  const info = await db.prepare("PRAGMA table_info(auth_users)").all<{ name: string }>();
  const columns = new Set(info.results.map((row) => row.name));
  const additions = [
    ["is_admin", "ALTER TABLE auth_users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"],
    ["status", "ALTER TABLE auth_users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"],
    ["must_change_password", "ALTER TABLE auth_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1"],
    ["last_login_at", "ALTER TABLE auth_users ADD COLUMN last_login_at TEXT"],
    ["created_by", "ALTER TABLE auth_users ADD COLUMN created_by TEXT"],
    ["department", "ALTER TABLE auth_users ADD COLUMN department TEXT NOT NULL DEFAULT ''"],
    ["section", "ALTER TABLE auth_users ADD COLUMN section TEXT NOT NULL DEFAULT ''"],
    ["roll_number", "ALTER TABLE auth_users ADD COLUMN roll_number TEXT NOT NULL DEFAULT ''"],
    ["semester", "ALTER TABLE auth_users ADD COLUMN semester TEXT NOT NULL DEFAULT ''"],
  ] as const;
  for (const [name, statement] of additions) {
    if (!columns.has(name)) {
      try {
        await db.prepare(statement).run();
      } catch (error) {
        // Two fresh Worker isolates can race while upgrading an older database.
        if (!String(error).toLowerCase().includes("duplicate column")) throw error;
      }
    }
  }
}

async function initializeAuthSchema() {
  const db = await getBinding();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_users (
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
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      device_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user_id TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_system_flags (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_device_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      changed_by TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_audit_created_idx ON auth_audit_log(created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_audit_target_idx ON auth_audit_log(target_user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_device_changes_user_idx ON auth_device_changes(user_id, created_at)"),
  ]);
  await addMissingUserColumns(db);
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS auth_users_student_roll_unique ON auth_users(roll_number) WHERE role = 'student' AND roll_number <> ''").run();

  const bootstrapAccounts = [
    {
      userId: "ADM001",
      displayName: "Project Administrator",
      role: "faculty" as const,
      isAdmin: 1,
      salt: "eduassist-admin-bootstrap-2026-v1",
      // PBKDF2-SHA256 hash for the one-time credential provided privately at handoff.
      hash: "4212dd76f8b7959e9c5684d5dc9cfb44c21b3f1d6c99b707561a6847ec45370f",
    },
  ];

  for (const account of bootstrapAccounts) {
    await db
      .prepare(`INSERT INTO auth_users
        (user_id, display_name, role, is_admin, password_salt, password_hash, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'SYSTEM')
        ON CONFLICT(user_id) DO NOTHING`)
      .bind(account.userId, account.displayName, account.role, account.isAdmin, account.salt, account.hash)
      .run();
  }

  // Earlier private prototypes shipped predictable sample accounts. Suspend them
  // once before public access is enabled; the administrator can reset/reactivate
  // any account intentionally from the admin panel.
  const publicSafetyFlag = await db.prepare("SELECT key FROM auth_system_flags WHERE key = 'public_account_safety_v1'").first();
  if (!publicSafetyFlag) {
    await db.batch([
      db.prepare(`UPDATE auth_users
        SET status = 'suspended', device_hash = NULL, device_label = NULL,
          device_registered_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE user_id IN ('FAC001', 'STU001', 'STU002') AND is_admin = 0`),
      db.prepare(`DELETE FROM auth_sessions WHERE user_id IN (
        SELECT id FROM auth_users WHERE user_id IN ('FAC001', 'STU001', 'STU002') AND is_admin = 0
      )`),
      db.prepare("INSERT INTO auth_system_flags (key, value) VALUES ('public_account_safety_v1', 'legacy samples suspended')"),
    ]);
  }

  const studentOnlyDeviceFlag = await db.prepare("SELECT key FROM auth_system_flags WHERE key = 'student_only_device_policy_v1'").first();
  if (!studentOnlyDeviceFlag) {
    await db.batch([
      db.prepare(`UPDATE auth_users SET device_hash = NULL, device_label = NULL,
        device_registered_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE is_admin = 1 OR role = 'faculty'`),
      db.prepare("INSERT INTO auth_system_flags (key, value) VALUES ('student_only_device_policy_v1', 'device binding limited to students')"),
    ]);
  }

  const adminBridgeFlag = await db.prepare("SELECT key FROM auth_system_flags WHERE key = 'admin_bridge_only_v1'").first();
  if (!adminBridgeFlag) {
    await db.batch([
      db.prepare("DELETE FROM auth_sessions WHERE user_id IN (SELECT id FROM auth_users WHERE is_admin = 1)"),
      db.prepare("INSERT INTO auth_system_flags (key, value) VALUES ('admin_bridge_only_v1', 'browser admin sessions moved to private site')"),
    ]);
  }
}

async function getAuthDb() {
  if (!schemaPromise) {
    schemaPromise = initializeAuthSchema().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
  return getBinding();
}

export async function getAppDatabase() {
  return getAuthDb();
}

async function derivePassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", iterations: PASSWORD_ITERATIONS, salt: encoder.encode(salt) },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function roleForRow(row: UserRow): AuthRole {
  return row.is_admin ? "admin" : row.role;
}

function isValidDeviceId(value: string) {
  return /^[a-zA-Z0-9-]{24,128}$/.test(value);
}

function normalizeDeviceLabel(value: string) {
  return value.replace(/[<>\r\n]/g, "").trim().slice(0, 80) || "Registered browser";
}

function normalizeUserId(value: string) {
  return value.trim().toUpperCase();
}

function isStudentRow(row: UserRow) {
  return !row.is_admin && row.role === "student";
}

function addSixMonths(value: string) {
  const date = new Date(`${value.replace(" ", "T")}Z`);
  date.setUTCMonth(date.getUTCMonth() + 6);
  return date.toISOString();
}

function deviceChangeState(used = 0, oldest: string | null = null): DeviceChangeState {
  const normalizedUsed = Number(used ?? 0);
  return {
    used: normalizedUsed,
    remaining: Math.max(0, 2 - normalizedUsed),
    windowEnds: normalizedUsed >= 2 && oldest ? addSixMonths(oldest) : null,
  };
}

async function readDeviceChangeState(db: AppDatabase, userDatabaseId: number) {
  const row = await db.prepare(`SELECT COUNT(*) AS used, MIN(created_at) AS oldest
    FROM auth_device_changes WHERE user_id = ? AND created_at >= datetime('now', '-6 months')`).bind(userDatabaseId).first() as { used: number; oldest: string | null };
  return deviceChangeState(Number(row?.used ?? 0), row?.oldest ?? null);
}

function publicUser(row: UserRow, changeState = deviceChangeState()): PublicAuthUser {
  const student = isStudentRow(row);
  return {
    userId: row.user_id,
    displayName: row.display_name,
    role: roleForRow(row),
    deviceLabel: student ? row.device_label ?? "Registered browser" : "",
    deviceRegisteredAt: student ? row.device_registered_at ?? "" : "",
    deviceBound: student && Boolean(row.device_hash),
    deviceChangesUsed: student ? changeState.used : 0,
    deviceChangesRemaining: student ? changeState.remaining : 0,
    deviceChangeWindowEnds: student ? changeState.windowEnds : null,
    mustChangePassword: Boolean(row.must_change_password),
  };
}

function managedUser(row: ManagedUserRow): ManagedUser {
  const student = isStudentRow(row);
  const changes = deviceChangeState(Number(row.device_changes_used ?? 0), row.oldest_device_change ?? null);
  return {
    userId: row.user_id,
    displayName: row.display_name,
    role: roleForRow(row),
    department: row.department,
    section: row.section,
    rollNumber: row.roll_number,
    semester: row.semester,
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    deviceRegistered: student && Boolean(row.device_hash),
    deviceLabel: student ? row.device_label : null,
    deviceRegisteredAt: student ? row.device_registered_at : null,
    deviceChangesUsed: student ? changes.used : 0,
    deviceChangesRemaining: student ? changes.remaining : 0,
    deviceChangeWindowEnds: student ? changes.windowEnds : null,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

function sessionCookie(request: Request, token: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function expiredSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function validatePassword(password: string) {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Include uppercase, lowercase, a number, and a symbol.";
  }
  return null;
}

async function recordAudit(db: AppDatabase, actorUserId: string, action: string, targetUserId: string, detail = "") {
  await db
    .prepare("INSERT INTO auth_audit_log (actor_user_id, action, target_user_id, detail) VALUES (?, ?, ?, ?)")
    .bind(actorUserId, action, targetUserId, detail.slice(0, 240))
    .run();
}

export async function loginWithDevice({ request, userId, password, role, deviceId, deviceLabel }: {
  request: Request;
  userId: string;
  password: string;
  role: AuthRole;
  deviceId: string;
  deviceLabel: string;
}) {
  if (!isValidDeviceId(deviceId)) return { ok: false as const, status: 400, code: "INVALID_DEVICE", message: "This browser could not be registered safely." };

  const db = await getAuthDb();
  const normalizedUserId = normalizeUserId(userId);
  const row = (await db.prepare("SELECT * FROM auth_users WHERE user_id = ?").bind(normalizedUserId).first()) as UserRow | null;
  const suppliedHash = row ? await derivePassword(password, row.password_salt) : await derivePassword(password, "eduassist-invalid-user-salt");

  if (!row || roleForRow(row) !== role || !timingSafeEqual(suppliedHash, row.password_hash)) {
    return { ok: false as const, status: 401, code: "INVALID_CREDENTIALS", message: "The user ID or password is incorrect for this portal." };
  }
  if (row.status !== "active") {
    await recordAudit(db, row.user_id, "login_blocked", row.user_id, "Account suspended");
    return { ok: false as const, status: 403, code: "ACCOUNT_SUSPENDED", message: "This account is suspended. Contact the project administrator." };
  }

  const deviceHash = await sha256(deviceId);
  const studentDevicePolicy = isStudentRow(row);
  if (studentDevicePolicy && row.device_hash && row.device_hash !== deviceHash) {
    await recordAudit(db, row.user_id, "device_blocked", row.user_id, row.device_label ?? "Another device");
    return { ok: false as const, status: 409, code: "DEVICE_MISMATCH", message: `This account is already registered to ${row.device_label ?? "another device"}. Release it from the registered device or ask the administrator to reset it.` };
  }

  const registeredNow = studentDevicePolicy && !row.device_hash;
  const safeLabel = normalizeDeviceLabel(deviceLabel);
  if (registeredNow) {
    await db
      .prepare(`UPDATE auth_users SET device_hash = ?, device_label = ?, device_registered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND device_hash IS NULL`)
      .bind(deviceHash, safeLabel, row.id)
      .run();
  }

  const refreshed = (await db.prepare("SELECT * FROM auth_users WHERE id = ?").bind(row.id).first()) as UserRow;
  if (studentDevicePolicy && refreshed.device_hash !== deviceHash) return { ok: false as const, status: 409, code: "DEVICE_MISMATCH", message: "Another device registered this account first. Try again after the device is released." };

  const token = randomToken();
  const tokenHash = await sha256(token);
  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(row.id),
    db.prepare(`INSERT INTO auth_sessions (token_hash, user_id, device_hash, expires_at) VALUES (?, ?, ?, datetime('now', '+7 days'))`).bind(tokenHash, row.id, deviceHash),
    db.prepare("UPDATE auth_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id),
  ]);
  await recordAudit(db, row.user_id, "login", row.user_id, registeredNow ? `Registered ${safeLabel}` : studentDevicePolicy ? `Verified ${safeLabel}` : `Session from ${safeLabel}`);

  const loggedIn = (await db.prepare("SELECT * FROM auth_users WHERE id = ?").bind(row.id).first()) as UserRow;
  const changeState = studentDevicePolicy ? await readDeviceChangeState(db, row.id) : deviceChangeState();
  return { ok: true as const, user: publicUser(loggedIn, changeState), registeredNow, cookie: sessionCookie(request, token) };
}

export async function getSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  const deviceId = request.headers.get("x-eduassist-device-id") ?? "";
  if (!token || !isValidDeviceId(deviceId)) return null;
  const db = await getAuthDb();
  const tokenHash = await sha256(token);
  const deviceHash = await sha256(deviceId);
  const row = (await db
    .prepare(`SELECT u.*, s.token_hash AS session_token_hash FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.device_hash = ?
      AND (u.is_admin = 1 OR u.role = 'faculty' OR u.device_hash = ?)
      AND u.status = 'active' AND s.expires_at > CURRENT_TIMESTAMP`)
    .bind(tokenHash, deviceHash, deviceHash)
    .first()) as SessionRow | null;
  if (!row) return null;
  const changeState = isStudentRow(row) ? await readDeviceChangeState(db, row.id) : deviceChangeState();
  return { user: publicUser(row, changeState), userRow: row, tokenHash };
}

export async function getAuthorizedSession(request: Request, roles: AuthRole[]) {
  const session = await getSession(request);
  if (!session || session.user.mustChangePassword || !roles.includes(session.user.role)) return null;
  return { user: session.user, databaseUserId: session.userRow.id };
}

export async function logoutSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  const db = await getAuthDb();
  await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function releaseOwnDevice(request: Request) {
  const session = await getSession(request);
  if (!session) return { ok: false as const, status: 401, message: "Your session has expired." };
  if (session.user.role !== "student") return { ok: false as const, status: 400, message: "Faculty and administrator accounts do not use device registration." };
  const db = await getAuthDb();
  const changes = await readDeviceChangeState(db, session.userRow.id);
  if (changes.remaining <= 0) {
    const date = changes.windowEnds ? new Date(changes.windowEnds).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "the end of the six-month window";
    return { ok: false as const, status: 429, message: `You have used both device changes allowed in six months. The next change is available after ${date}.` };
  }
  await db.batch([
    db.prepare("INSERT INTO auth_device_changes (user_id, changed_by, reason) VALUES (?, ?, 'Released by account owner')").bind(session.userRow.id, session.user.userId),
    db.prepare(`UPDATE auth_users SET device_hash = NULL, device_label = NULL, device_registered_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(session.userRow.id),
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(session.userRow.id),
  ]);
  await recordAudit(db, session.user.userId, "device_released", session.user.userId, "Released by account owner");
  return { ok: true as const };
}

export async function changeOwnPassword(request: Request, newPassword: string) {
  const session = await getSession(request);
  if (!session) return { ok: false as const, status: 401, message: "Your session has expired." };
  const validation = validatePassword(newPassword);
  if (validation) return { ok: false as const, status: 400, message: validation };
  const db = await getAuthDb();
  const salt = randomToken().slice(0, 32);
  const hash = await derivePassword(newPassword, salt);
  await db.prepare(`UPDATE auth_users SET password_salt = ?, password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(salt, hash, session.userRow.id).run();
  await recordAudit(db, session.user.userId, "password_changed", session.user.userId, "Password updated by account owner");
  const row = (await db.prepare("SELECT * FROM auth_users WHERE id = ?").bind(session.userRow.id).first()) as UserRow;
  const changeState = isStudentRow(row) ? await readDeviceChangeState(db, row.id) : deviceChangeState();
  return { ok: true as const, user: publicUser(row, changeState) };
}

async function getAdminSession(request: Request) {
  if (await isAdminBridgeRequest(request)) {
    const actorUserId = normalizeUserId(request.headers.get("x-eduassist-admin-id") ?? "");
    const db = await getAuthDb();
    const row = await db.prepare("SELECT * FROM auth_users WHERE user_id = ? AND is_admin = 1 AND status = 'active'").bind(actorUserId).first() as UserRow | null;
    if (!row || row.must_change_password) return null;
    return { user: publicUser(row), userRow: row, tokenHash: "admin-bridge" };
  }
  const session = await getSession(request);
  if (!session || session.user.role !== "admin" || session.user.mustChangePassword) return null;
  return session;
}

async function bridgeSecret() {
  return process.env.ADMIN_BRIDGE_SECRET ?? "";
}

export async function isAdminBridgeRequest(request: Request) {
  const configured = await bridgeSecret();
  if (configured.length < 32) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return timingSafeEqual(configured, supplied);
}

export async function verifyAdminCredentials(userIdInput: string, password: string) {
  const db = await getAuthDb();
  const userId = normalizeUserId(userIdInput);
  const row = await db.prepare("SELECT * FROM auth_users WHERE user_id = ? AND is_admin = 1").bind(userId).first() as UserRow | null;
  const suppliedHash = row ? await derivePassword(password, row.password_salt) : await derivePassword(password, "eduassist-invalid-admin-salt");
  if (!row || row.status !== "active" || row.must_change_password || !timingSafeEqual(suppliedHash, row.password_hash)) return null;
  await recordAudit(db, row.user_id, "admin_bridge_login", row.user_id, "Private administration site");
  return { userId: row.user_id, displayName: row.display_name };
}

export async function listManagedUsers(request: Request) {
  const session = await getAdminSession(request);
  if (!session) return null;
  const db = await getAuthDb();
  const result = await db.prepare(`SELECT u.*,
      COUNT(dc.id) AS device_changes_used, MIN(dc.created_at) AS oldest_device_change
    FROM auth_users u
    LEFT JOIN auth_device_changes dc ON dc.user_id = u.id AND dc.created_at >= datetime('now', '-6 months')
    GROUP BY u.id ORDER BY u.is_admin DESC, u.created_at DESC, u.display_name ASC`).all();
  return { actor: session.user, users: (result.results as ManagedUserRow[]).map(managedUser) };
}

function normalizeAcademicField(value: string, maximum: number, uppercase = false) {
  const cleaned = value.replace(/[<>\r\n]/g, "").trim().replace(/\s+/g, " ").slice(0, maximum);
  return uppercase ? cleaned.toUpperCase() : cleaned;
}

function academicProfile(input: { department: string; section: string; rollNumber: string; semester: string }, role: AuthRole) {
  const department = normalizeAcademicField(input.department, 40, true);
  const section = normalizeAcademicField(input.section, 12, true);
  const rollNumber = normalizeAcademicField(input.rollNumber, 30, true).replace(/\s/g, "");
  const semester = normalizeAcademicField(input.semester, 30);
  if (role !== "admin" && !/^[A-Z0-9][A-Z0-9 &.-]{1,39}$/.test(department)) {
    return { ok: false as const, status: 400, message: "Enter a valid department." };
  }
  if (role === "student") {
    if (!/^[A-Z0-9][A-Z0-9-]{0,11}$/.test(section)) return { ok: false as const, status: 400, message: "Enter a valid student section." };
    if (!/^[A-Z0-9][A-Z0-9_/-]{1,29}$/.test(rollNumber)) return { ok: false as const, status: 400, message: "Enter a valid student roll number." };
    if (!semester) return { ok: false as const, status: 400, message: "Enter the student's semester." };
  }
  return { ok: true as const, department, section, rollNumber, semester };
}

function defaultStudentPassword(displayName: string, rollNumber: string) {
  const firstName = displayName.split(/\s+/)[0]
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toLowerCase();
  return `${firstName}${rollNumber}`;
}

export async function createManagedUser(request: Request, input: {
  userId: string;
  displayName: string;
  role: string;
  department: string;
  section: string;
  rollNumber: string;
  semester: string;
  temporaryPassword: string;
}) {
  const session = await getAdminSession(request);
  if (!session) return { ok: false as const, status: 403, message: "Administrator access is required." };
  const userId = normalizeUserId(input.userId);
  const displayName = input.displayName.replace(/[<>\r\n]/g, "").trim().slice(0, 80);
  if (!/^[A-Z0-9_-]{3,20}$/.test(userId)) return { ok: false as const, status: 400, message: "User ID must be 3–20 letters, numbers, hyphens, or underscores." };
  if (input.role !== "faculty" && input.role !== "student") return { ok: false as const, status: 400, message: "Choose Faculty or Student." };
  if (displayName.length < 2) return { ok: false as const, status: 400, message: "Enter the user's full name." };
  const profile = academicProfile(input, input.role);
  if (!profile.ok) return profile;
  const initialPassword = input.role === "student"
    ? defaultStudentPassword(displayName, profile.rollNumber)
    : input.temporaryPassword;
  if (input.role === "faculty") {
    const passwordError = validatePassword(initialPassword);
    if (passwordError) return { ok: false as const, status: 400, message: passwordError };
  }
  if (!initialPassword) return { ok: false as const, status: 400, message: "The student default password could not be generated." };

  const db = await getAuthDb();
  const existing = await db.prepare("SELECT id FROM auth_users WHERE user_id = ?").bind(userId).first();
  if (existing) return { ok: false as const, status: 409, message: "That user ID already exists." };
  if (input.role === "student") {
    const duplicateRoll = await db.prepare("SELECT id FROM auth_users WHERE role = 'student' AND roll_number = ?").bind(profile.rollNumber).first();
    if (duplicateRoll) return { ok: false as const, status: 409, message: "That student roll number already exists." };
  }
  const salt = randomToken().slice(0, 32);
  const hash = await derivePassword(initialPassword, salt);
  await db.prepare(`INSERT INTO auth_users
    (user_id, display_name, role, department, section, roll_number, semester, is_admin, status, must_change_password, password_salt, password_hash, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active', 1, ?, ?, ?)`)
    .bind(userId, displayName, input.role, profile.department, profile.section, profile.rollNumber, profile.semester, salt, hash, session.user.userId)
    .run();
  await recordAudit(db, session.user.userId, "user_created", userId, `${input.role}: ${displayName}; ${profile.department}${profile.section ? `-${profile.section}` : ""}${profile.rollNumber ? `; ${profile.rollNumber}` : ""}`);
  const row = (await db.prepare("SELECT * FROM auth_users WHERE user_id = ?").bind(userId).first()) as UserRow;
  return { ok: true as const, user: managedUser(row), initialPassword: input.role === "student" ? initialPassword : null };
}

export async function editManagedUser(request: Request, input: {
  originalUserId: string;
  userId: string;
  displayName: string;
  role: string;
  department: string;
  section: string;
  rollNumber: string;
  semester: string;
  status: string;
  mustChangePassword: boolean;
}) {
  const session = await getAdminSession(request);
  if (!session) return { ok: false as const, status: 403, message: "Administrator access is required." };
  const originalUserId = normalizeUserId(input.originalUserId);
  const userId = normalizeUserId(input.userId);
  const displayName = input.displayName.replace(/[<>\r\n]/g, "").trim().slice(0, 80);
  if (!/^[A-Z0-9_-]{3,20}$/.test(userId)) return { ok: false as const, status: 400, message: "User ID must be 3–20 letters, numbers, hyphens, or underscores." };
  if (displayName.length < 2) return { ok: false as const, status: 400, message: "Enter the user's full name." };
  if (input.status !== "active" && input.status !== "suspended") return { ok: false as const, status: 400, message: "Choose Active or Suspended." };

  const db = await getAuthDb();
  const target = await db.prepare("SELECT * FROM auth_users WHERE user_id = ?").bind(originalUserId).first() as UserRow | null;
  if (!target) return { ok: false as const, status: 404, message: "User not found." };
  const nextRole = target.is_admin ? target.role : input.role;
  if (!target.is_admin && nextRole !== "faculty" && nextRole !== "student") return { ok: false as const, status: 400, message: "Choose Faculty or Student." };
  if (target.user_id === session.user.userId && input.status !== "active") return { ok: false as const, status: 400, message: "You cannot suspend the administrator account currently in use." };
  const profile = academicProfile(input, target.is_admin ? "admin" : nextRole as StoredRole);
  if (!profile.ok) return profile;

  if (!target.is_admin && target.role !== nextRole) {
    const related = target.role === "faculty"
      ? await db.prepare("SELECT id FROM classroom_classes WHERE faculty_user_id = ? LIMIT 1").bind(target.id).first()
      : await db.prepare("SELECT id FROM class_enrolments WHERE student_user_id = ? LIMIT 1").bind(target.id).first();
    if (related) return { ok: false as const, status: 409, message: target.role === "faculty" ? "This faculty account owns classes. Reassign or archive them before changing the role." : "This student account is enrolled in classes. Remove those enrolments before changing the role." };
  }

  const duplicate = await db.prepare("SELECT id FROM auth_users WHERE user_id = ? AND id <> ?").bind(userId, target.id).first();
  if (duplicate) return { ok: false as const, status: 409, message: "That user ID already exists." };
  if (!target.is_admin && nextRole === "student") {
    const duplicateRoll = await db.prepare("SELECT id FROM auth_users WHERE role = 'student' AND roll_number = ? AND id <> ?").bind(profile.rollNumber, target.id).first();
    if (duplicateRoll) return { ok: false as const, status: 409, message: "That student roll number already exists." };
  }
  await db.prepare(`UPDATE auth_users SET user_id = ?, display_name = ?, role = ?, department = ?, section = ?, roll_number = ?, semester = ?, status = ?, must_change_password = ?,
    device_hash = CASE WHEN ? = 'student' AND is_admin = 0 THEN device_hash ELSE NULL END,
    device_label = CASE WHEN ? = 'student' AND is_admin = 0 THEN device_label ELSE NULL END,
    device_registered_at = CASE WHEN ? = 'student' AND is_admin = 0 THEN device_registered_at ELSE NULL END,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .bind(
      userId,
      displayName,
      nextRole,
      profile.department,
      profile.section,
      profile.rollNumber,
      profile.semester,
      input.status,
      input.mustChangePassword ? 1 : 0,
      nextRole,
      nextRole,
      nextRole,
      target.id,
    ).run();
  if (input.status === "suspended") await db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(target.id).run();
  await recordAudit(db, session.user.userId, "user_edited", userId, `${originalUserId} → ${userId}; ${displayName}; ${roleForRow(target)} → ${target.is_admin ? "admin" : nextRole}; ${profile.department}${profile.section ? `-${profile.section}` : ""}; ${input.status}`);
  const row = await db.prepare(`SELECT u.*, COUNT(dc.id) AS device_changes_used, MIN(dc.created_at) AS oldest_device_change
    FROM auth_users u LEFT JOIN auth_device_changes dc ON dc.user_id = u.id AND dc.created_at >= datetime('now', '-6 months')
    WHERE u.id = ? GROUP BY u.id`).bind(target.id).first() as ManagedUserRow;
  return { ok: true as const, user: managedUser(row) };
}

export async function manageUser(request: Request, input: { userId: string; action: string; temporaryPassword?: string }) {
  const session = await getAdminSession(request);
  if (!session) return { ok: false as const, status: 403, message: "Administrator access is required." };
  const userId = normalizeUserId(input.userId);
  const db = await getAuthDb();
  const target = (await db.prepare("SELECT * FROM auth_users WHERE user_id = ?").bind(userId).first()) as UserRow | null;
  if (!target) return { ok: false as const, status: 404, message: "User not found." };
  if (target.user_id === session.user.userId) return { ok: false as const, status: 400, message: "Use your account settings to manage the current administrator." };

  if (input.action === "release_device") {
    if (!isStudentRow(target)) return { ok: false as const, status: 400, message: "Only student accounts use registered-device binding." };
    if (!target.device_hash) return { ok: false as const, status: 400, message: "This student does not currently have a registered device." };
    const changes = await readDeviceChangeState(db, target.id);
    if (changes.remaining <= 0) return { ok: false as const, status: 429, message: "This student has already used both device changes allowed in the current six-month window. Reset the allowance only after verifying the mishap." };
    await db.batch([
      db.prepare("INSERT INTO auth_device_changes (user_id, changed_by, reason) VALUES (?, ?, 'Administrator recovery')").bind(target.id, session.user.userId),
      db.prepare(`UPDATE auth_users SET device_hash = NULL, device_label = NULL, device_registered_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(target.id),
      db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(target.id),
    ]);
    await recordAudit(db, session.user.userId, "device_released_admin", userId, "Administrator recovery");
  } else if (input.action === "reset_device_changes") {
    if (!isStudentRow(target)) return { ok: false as const, status: 400, message: "Only student accounts have a device-change allowance." };
    await db.prepare("DELETE FROM auth_device_changes WHERE user_id = ?").bind(target.id).run();
    await recordAudit(db, session.user.userId, "device_allowance_reset", userId, "Six-month device-change history reset by administrator");
  } else if (input.action === "suspend" || input.action === "activate") {
    const status = input.action === "suspend" ? "suspended" : "active";
    await db.prepare("UPDATE auth_users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, target.id).run();
    if (status === "suspended") await db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(target.id).run();
    await recordAudit(db, session.user.userId, `account_${status}`, userId, `${target.display_name} ${status}`);
  } else if (input.action === "reset_password") {
    const temporaryPassword = input.temporaryPassword ?? "";
    const passwordError = validatePassword(temporaryPassword);
    if (passwordError) return { ok: false as const, status: 400, message: passwordError };
    const salt = randomToken().slice(0, 32);
    const hash = await derivePassword(temporaryPassword, salt);
    await db.batch([
      db.prepare("UPDATE auth_users SET password_salt = ?, password_hash = ?, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(salt, hash, target.id),
      db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(target.id),
    ]);
    await recordAudit(db, session.user.userId, "password_reset_admin", userId, "Temporary password issued");
  } else {
    return { ok: false as const, status: 400, message: "Unsupported account action." };
  }

  const row = (await db.prepare(`SELECT u.*, COUNT(dc.id) AS device_changes_used, MIN(dc.created_at) AS oldest_device_change
    FROM auth_users u LEFT JOIN auth_device_changes dc ON dc.user_id = u.id AND dc.created_at >= datetime('now', '-6 months')
    WHERE u.id = ? GROUP BY u.id`).bind(target.id).first()) as ManagedUserRow;
  return { ok: true as const, user: managedUser(row) };
}

export async function listAuditEvents(request: Request) {
  const session = await getAdminSession(request);
  if (!session) return null;
  const db = await getAuthDb();
  const result = await db.prepare("SELECT * FROM auth_audit_log ORDER BY id DESC LIMIT 100").all();
  return (result.results as Array<{ id: number; actor_user_id: string; action: string; target_user_id: string; detail: string; created_at: string }>).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetUserId: row.target_user_id,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

function validQrRotationSeconds(value: unknown) {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= QR_ROTATION_MIN_SECONDS && seconds <= QR_ROTATION_MAX_SECONDS
    ? seconds
    : QR_ROTATION_DEFAULT_SECONDS;
}

export async function readClassroomSettings() {
  const db = await getAuthDb();
  const row = await db.prepare("SELECT value FROM auth_system_flags WHERE key = ?").bind(QR_ROTATION_SETTING_KEY).first() as { value: string } | null;
  return { qrRotationSeconds: validQrRotationSeconds(row?.value) };
}

export async function getManagedSystemSettings(request: Request) {
  const session = await getAdminSession(request);
  if (!session) return null;
  return readClassroomSettings();
}

export async function updateManagedSystemSettings(request: Request, input: { qrRotationSeconds: number }) {
  const session = await getAdminSession(request);
  if (!session) return { ok: false as const, status: 403, message: "Administrator access is required." };
  const qrRotationSeconds = Number(input.qrRotationSeconds);
  if (!Number.isInteger(qrRotationSeconds) || qrRotationSeconds < QR_ROTATION_MIN_SECONDS || qrRotationSeconds > QR_ROTATION_MAX_SECONDS) {
    return {
      ok: false as const,
      status: 400,
      message: `QR rotation time must be a whole number from ${QR_ROTATION_MIN_SECONDS} to ${QR_ROTATION_MAX_SECONDS} seconds.`,
    };
  }
  const previous = await readClassroomSettings();
  const db = await getAuthDb();
  await db.prepare(`INSERT INTO auth_system_flags (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, created_at = CURRENT_TIMESTAMP`)
    .bind(QR_ROTATION_SETTING_KEY, String(qrRotationSeconds))
    .run();
  await recordAudit(
    db,
    session.user.userId,
    "system_settings_updated",
    "QR_ATTENDANCE",
    `QR rotation ${previous.qrRotationSeconds}s → ${qrRotationSeconds}s`,
  );
  return { ok: true as const, settings: { qrRotationSeconds } };
}
