export type AuthRole = "faculty" | "student";

export type PublicAuthUser = {
  userId: string;
  displayName: string;
  role: AuthRole;
  deviceLabel: string;
  deviceRegisteredAt: string;
};

type UserRow = {
  id: number;
  user_id: string;
  display_name: string;
  role: AuthRole;
  password_salt: string;
  password_hash: string;
  device_hash: string | null;
  device_label: string | null;
  device_registered_at: string | null;
};

type SessionRow = UserRow & {
  session_token_hash: string;
};

const SESSION_COOKIE = "eduassist_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 120_000;
const encoder = new TextEncoder();
let schemaPromise: Promise<void> | null = null;

async function getBinding() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) {
    throw new Error("EduAssist authentication requires the D1 `DB` binding.");
  }
  return env.DB;
}

async function initializeAuthSchema() {
  const db = await getBinding();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('faculty', 'student')),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      device_hash TEXT,
      device_label TEXT,
      device_registered_at TEXT,
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
    db.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at)"),
  ]);

  const demoAccounts = [
    {
      userId: "FAC001",
      displayName: "Dr. Maya Kapoor",
      role: "faculty" as const,
      password: "Faculty@123",
      salt: "eduassist-faculty-demo-2026",
    },
    {
      userId: "STU001",
      displayName: "Aarav Sharma",
      role: "student" as const,
      password: "Student@123",
      salt: "eduassist-student-demo-2026",
    },
    {
      userId: "STU002",
      displayName: "Diya Patel",
      role: "student" as const,
      password: "Student@123",
      salt: "eduassist-student-two-2026",
    },
  ];

  for (const account of demoAccounts) {
    const passwordHash = await derivePassword(account.password, account.salt);
    await db
      .prepare(`INSERT OR IGNORE INTO auth_users
        (user_id, display_name, role, password_salt, password_hash)
        VALUES (?, ?, ?, ?, ?)`)
      .bind(
        account.userId,
        account.displayName,
        account.role,
        account.salt,
        passwordHash,
      )
      .run();
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
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PASSWORD_ITERATIONS,
      salt: encoder.encode(salt),
    },
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
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function isValidDeviceId(value: string) {
  return /^[a-zA-Z0-9-]{24,128}$/.test(value);
}

function normalizeDeviceLabel(value: string) {
  return value.replace(/[<>\r\n]/g, "").trim().slice(0, 80) || "Registered browser";
}

function publicUser(row: UserRow): PublicAuthUser {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    deviceLabel: row.device_label ?? "Registered browser",
    deviceRegisteredAt: row.device_registered_at ?? new Date().toISOString(),
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

export async function loginWithDevice({
  request,
  userId,
  password,
  role,
  deviceId,
  deviceLabel,
}: {
  request: Request;
  userId: string;
  password: string;
  role: AuthRole;
  deviceId: string;
  deviceLabel: string;
}) {
  if (!isValidDeviceId(deviceId)) {
    return { ok: false as const, status: 400, code: "INVALID_DEVICE", message: "This browser could not be registered safely." };
  }

  const db = await getAuthDb();
  const normalizedUserId = userId.trim().toUpperCase();
  const row = (await db
    .prepare("SELECT * FROM auth_users WHERE user_id = ? AND role = ?")
    .bind(normalizedUserId, role)
    .first()) as UserRow | null;

  const suppliedHash = row
    ? await derivePassword(password, row.password_salt)
    : await derivePassword(password, "eduassist-invalid-user-salt");

  if (!row || !timingSafeEqual(suppliedHash, row.password_hash)) {
    return { ok: false as const, status: 401, code: "INVALID_CREDENTIALS", message: "The user ID or password is incorrect for this workspace." };
  }

  const deviceHash = await sha256(deviceId);
  if (row.device_hash && row.device_hash !== deviceHash) {
    return {
      ok: false as const,
      status: 409,
      code: "DEVICE_MISMATCH",
      message: `This account is already registered to ${row.device_label ?? "another device"}. Release it from the registered device or ask the faculty project owner to reset it.`,
    };
  }

  const registeredNow = !row.device_hash;
  const safeLabel = normalizeDeviceLabel(deviceLabel);
  if (registeredNow) {
    await db
      .prepare(`UPDATE auth_users
        SET device_hash = ?, device_label = ?, device_registered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND device_hash IS NULL`)
      .bind(deviceHash, safeLabel, row.id)
      .run();
  }

  const refreshed = (await db
    .prepare("SELECT * FROM auth_users WHERE id = ?")
    .bind(row.id)
    .first()) as UserRow;

  if (refreshed.device_hash !== deviceHash) {
    return { ok: false as const, status: 409, code: "DEVICE_MISMATCH", message: "Another device registered this account first. Try again after the device is released." };
  }

  const token = randomToken();
  const tokenHash = await sha256(token);
  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(row.id),
    db
      .prepare(`INSERT INTO auth_sessions (token_hash, user_id, device_hash, expires_at)
        VALUES (?, ?, ?, datetime('now', '+7 days'))`)
      .bind(tokenHash, row.id, deviceHash),
  ]);

  return {
    ok: true as const,
    user: publicUser(refreshed),
    registeredNow,
    cookie: sessionCookie(request, token),
  };
}

export async function getSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  const deviceId = request.headers.get("x-eduassist-device-id") ?? "";
  if (!token || !isValidDeviceId(deviceId)) return null;

  const db = await getAuthDb();
  const tokenHash = await sha256(token);
  const deviceHash = await sha256(deviceId);
  const row = (await db
    .prepare(`SELECT u.*, s.token_hash AS session_token_hash
      FROM auth_sessions s
      JOIN auth_users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.device_hash = ?
        AND u.device_hash = ?
        AND s.expires_at > CURRENT_TIMESTAMP`)
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
    db
      .prepare(`UPDATE auth_users
        SET device_hash = NULL, device_label = NULL, device_registered_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`)
      .bind(session.userRow.id),
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(session.userRow.id),
  ]);
  return session.user;
}

export async function facultyResetStudentDevice(request: Request, studentUserId: string) {
  const session = await getSession(request);
  if (!session || session.user.role !== "faculty") return { authorized: false as const };
  const db = await getAuthDb();
  const student = (await db
    .prepare("SELECT id, display_name FROM auth_users WHERE user_id = ? AND role = 'student'")
    .bind(studentUserId.trim().toUpperCase())
    .first()) as { id: number; display_name: string } | null;
  if (!student) return { authorized: true as const, found: false as const };
  await db.batch([
    db
      .prepare(`UPDATE auth_users
        SET device_hash = NULL, device_label = NULL, device_registered_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`)
      .bind(student.id),
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(student.id),
  ]);
  return { authorized: true as const, found: true as const, displayName: student.display_name };
}
