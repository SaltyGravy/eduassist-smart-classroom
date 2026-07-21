export type AuthRole = "admin" | "faculty" | "student";
type StoredRole = "faculty" | "student";

export type PublicAuthUser = {
  userId: string;
  displayName: string;
  role: AuthRole;
  deviceLabel: string;
  deviceRegisteredAt: string;
  mustChangePassword: boolean;
};

export type ManagedUser = {
  userId: string;
  displayName: string;
  role: AuthRole;
  status: "active" | "suspended";
  mustChangePassword: boolean;
  deviceRegistered: boolean;
  deviceLabel: string | null;
  deviceRegisteredAt: string | null;
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

const SESSION_COOKIE = "eduassist_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
// Cloudflare Workers Web Crypto currently caps PBKDF2 at 100,000 rounds.
const PASSWORD_ITERATIONS = 100_000;
const encoder = new TextEncoder();
let schemaPromise: Promise<void> | null = null;

async function getBinding() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("EduAssist authentication requires the D1 `DB` binding.");
  return env.DB;
}

async function addMissingUserColumns(db: D1Database) {
  const info = await db.prepare("PRAGMA table_info(auth_users)").all();
  const columns = new Set((info.results ?? []).map((row: { name: string }) => row.name));
  const additions = [
    ["is_admin", "ALTER TABLE auth_users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0"],
    ["status", "ALTER TABLE auth_users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"],
    ["must_change_password", "ALTER TABLE auth_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1"],
    ["last_login_at", "ALTER TABLE auth_users ADD COLUMN last_login_at TEXT"],
    ["created_by", "ALTER TABLE auth_users ADD COLUMN created_by TEXT"],
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
    db.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_audit_created_idx ON auth_audit_log(created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_audit_target_idx ON auth_audit_log(target_user_id)"),
  ]);
  await addMissingUserColumns(db);

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

function publicUser(row: UserRow): PublicAuthUser {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    role: roleForRow(row),
    deviceLabel: row.device_label ?? "Registered browser",
    deviceRegisteredAt: row.device_registered_at ?? "",
    mustChangePassword: Boolean(row.must_change_password),
  };
}

function managedUser(row: UserRow): ManagedUser {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    role: roleForRow(row),
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    deviceRegistered: Boolean(row.device_hash),
    deviceLabel: row.device_label,
    deviceRegisteredAt: row.device_registered_at,
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

async function recordAudit(db: D1Database, actorUserId: string, action: string, targetUserId: string, detail = "") {
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
    return { ok: false as const, status: 401, code: "INVALID_CREDENTIALS", message: "The user ID or password is incorrect for this workspace." };
  }
  if (row.status !== "active") {
    await recordAudit(db, row.user_id, "login_blocked", row.user_id, "Account suspended");
    return { ok: false as const, status: 403, code: "ACCOUNT_SUSPENDED", message: "This account is suspended. Contact the project administrator." };
  }

  const deviceHash = await sha256(deviceId);
  if (row.device_hash && row.device_hash !== deviceHash) {
    await recordAudit(db, row.user_id, "device_blocked", row.user_id, row.device_label ?? "Another device");
    return { ok: false as const, status: 409, code: "DEVICE_MISMATCH", message: `This account is already registered to ${row.device_label ?? "another device"}. Release it from the registered device or ask the administrator to reset it.` };
  }

  const registeredNow = !row.device_hash;
  const safeLabel = normalizeDeviceLabel(deviceLabel);
  if (registeredNow) {
    await db
      .prepare(`UPDATE auth_users SET device_hash = ?, device_label = ?, device_registered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND device_hash IS NULL`)
      .bind(deviceHash, safeLabel, row.id)
      .run();
  }

  const refreshed = (await db.prepare("SELECT * FROM auth_users WHERE id = ?").bind(row.id).first()) as UserRow;
  if (refreshed.device_hash !== deviceHash) return { ok: false as const, status: 409, code: "DEVICE_MISMATCH", message: "Another device registered this account first. Try again after the device is released." };

  const token = randomToken();
  const tokenHash = await sha256(token);
  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(row.id),
    db.prepare(`INSERT INTO auth_sessions (token_hash, user_id, device_hash, expires_at) VALUES (?, ?, ?, datetime('now', '+7 days'))`).bind(tokenHash, row.id, deviceHash),
    db.prepare("UPDATE auth_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id),
  ]);
  await recordAudit(db, row.user_id, "login", row.user_id, registeredNow ? `Registered ${safeLabel}` : `Verified ${safeLabel}`);

  const loggedIn = (await db.prepare("SELECT * FROM auth_users WHERE id = ?").bind(row.id).first()) as UserRow;
  return { ok: true as const, user: publicUser(loggedIn), registeredNow, cookie: sessionCookie(request, token) };
}

export async function getSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  const deviceId = request.headers.get("x-eduassist-device-id") ?? "";
  if (!token || !isValidDeviceId(deviceId)) return null;
  const db = await getAuthDb();
  const tokenHash = await sha256(token);
  const deviceHash = await sha256(deviceId);
  const row = (await db
    .prepare(`SELECT u.*, s.token_hash AS session_token_hash FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.device_hash = ? AND u.device_hash = ? AND u.status = 'active' AND s.expires_at > CURRENT_TIMESTAMP`)
    .bind(tokenHash, deviceHash, deviceHash)
    .first()) as SessionRow | null;
  return row ? { user: publicUser(row), userRow: row, tokenHash } : null;
}

export async function logoutSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  const db = await getAuthDb();
  await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function releaseOwnDevice(request: Request) {
  const session = await getSession(request);
  if (!session) return null;
  const db = await getAuthDb();
  await db.batch([
    db.prepare(`UPDATE auth_users SET device_hash = NULL, device_label = NULL, device_registered_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(session.userRow.id),
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(session.userRow.id),
  ]);
  await recordAudit(db, session.user.userId, "device_released", session.user.userId, "Released by account owner");
  return session.user;
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
  return { ok: true as const, user: publicUser(row) };
}

async function getAdminSession(request: Request) {
  const session = await getSession(request);
  if (!session || session.user.role !== "admin" || session.user.mustChangePassword) return null;
  return session;
}

export async function listManagedUsers(request: Request) {
  const session = await getAdminSession(request);
  if (!session) return null;
  const db = await getAuthDb();
  const result = await db.prepare("SELECT * FROM auth_users ORDER BY is_admin DESC, created_at DESC, display_name ASC").all();
  return { actor: session.user, users: (result.results as UserRow[]).map(managedUser) };
}

export async function createManagedUser(request: Request, input: { userId: string; displayName: string; role: string; temporaryPassword: string }) {
  const session = await getAdminSession(request);
  if (!session) return { ok: false as const, status: 403, message: "Administrator access is required." };
  const userId = normalizeUserId(input.userId);
  const displayName = input.displayName.replace(/[<>\r\n]/g, "").trim().slice(0, 80);
  if (!/^[A-Z0-9_-]{3,20}$/.test(userId)) return { ok: false as const, status: 400, message: "User ID must be 3–20 letters, numbers, hyphens, or underscores." };
  if (input.role !== "faculty" && input.role !== "student") return { ok: false as const, status: 400, message: "Choose Faculty or Student." };
  if (displayName.length < 2) return { ok: false as const, status: 400, message: "Enter the user's full name." };
  const passwordError = validatePassword(input.temporaryPassword);
  if (passwordError) return { ok: false as const, status: 400, message: passwordError };

  const db = await getAuthDb();
  const existing = await db.prepare("SELECT id FROM auth_users WHERE user_id = ?").bind(userId).first();
  if (existing) return { ok: false as const, status: 409, message: "That user ID already exists." };
  const salt = randomToken().slice(0, 32);
  const hash = await derivePassword(input.temporaryPassword, salt);
  await db.prepare(`INSERT INTO auth_users (user_id, display_name, role, is_admin, status, must_change_password, password_salt, password_hash, created_by) VALUES (?, ?, ?, 0, 'active', 1, ?, ?, ?)`).bind(userId, displayName, input.role, salt, hash, session.user.userId).run();
  await recordAudit(db, session.user.userId, "user_created", userId, `${input.role}: ${displayName}`);
  const row = (await db.prepare("SELECT * FROM auth_users WHERE user_id = ?").bind(userId).first()) as UserRow;
  return { ok: true as const, user: managedUser(row) };
}

export async function manageUser(request: Request, input: { userId: string; action: string; temporaryPassword?: string }) {
  const session = await getAdminSession(request);
  if (!session) return { ok: false as const, status: 403, message: "Administrator access is required." };
  const userId = normalizeUserId(input.userId);
  const db = await getAuthDb();
  const target = (await db.prepare("SELECT * FROM auth_users WHERE user_id = ?").bind(userId).first()) as UserRow | null;
  if (!target) return { ok: false as const, status: 404, message: "User not found." };
  if (target.user_id === session.user.userId) return { ok: false as const, status: 400, message: "Use your account menu to manage your own account." };

  if (input.action === "release_device") {
    await db.batch([
      db.prepare(`UPDATE auth_users SET device_hash = NULL, device_label = NULL, device_registered_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(target.id),
      db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(target.id),
    ]);
    await recordAudit(db, session.user.userId, "device_released_admin", userId, "Administrator recovery");
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

  const row = (await db.prepare("SELECT * FROM auth_users WHERE id = ?").bind(target.id).first()) as UserRow;
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
