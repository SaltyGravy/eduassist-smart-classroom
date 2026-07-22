import { getAppDatabase, getAuthorizedSession } from "./auth";
import type { AppDatabase } from "../../db/client";

export type ClassroomRole = "faculty" | "student";
export type AttendanceStatus = "present" | "late" | "absent";

export type ClassroomSummary = {
  id: number;
  subjectName: string;
  subjectCode: string;
  semester: string;
  section: string;
  classCode: string;
  facultyName: string;
  studentCount: number;
  joinedAt: string | null;
  createdAt: string;
};

type ClassRow = {
  id: number;
  subject_name: string;
  subject_code: string;
  semester: string;
  section: string;
  class_code: string;
  faculty_name: string;
  student_count: number;
  joined_at: string | null;
  created_at: string;
};

type SessionRow = {
  id: number;
  class_id: number;
  qr_token: string;
  manual_code: string;
  starts_at: string;
  expires_at: string;
  status: "active" | "closed";
  subject_name: string;
  subject_code: string;
  semester: string;
  section: string;
};

const ATTENDANCE_ROTATION_MS = 10_000;
const ATTENDANCE_GRACE_MS = 2_000;
const MANUAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const textEncoder = new TextEncoder();

let classroomSchemaPromise: Promise<void> | null = null;

async function initializeClassroomSchema() {
  const db = await getAppDatabase();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS classroom_classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_name TEXT NOT NULL,
      subject_code TEXT NOT NULL,
      semester TEXT NOT NULL,
      section TEXT NOT NULL,
      class_code TEXT NOT NULL UNIQUE,
      faculty_user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (faculty_user_id) REFERENCES auth_users(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS class_enrolments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      student_user_id INTEGER NOT NULL,
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classroom_classes(id) ON DELETE CASCADE,
      FOREIGN KEY (student_user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      UNIQUE (class_id, student_user_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      qr_token TEXT NOT NULL UNIQUE,
      manual_code TEXT NOT NULL UNIQUE,
      starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by INTEGER NOT NULL,
      closed_at TEXT,
      FOREIGN KEY (class_id) REFERENCES classroom_classes(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES auth_users(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      student_user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      corrected_by INTEGER,
      FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (student_user_id) REFERENCES auth_users(id) ON DELETE CASCADE,
      FOREIGN KEY (corrected_by) REFERENCES auth_users(id) ON DELETE SET NULL,
      UNIQUE (session_id, student_user_id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS classroom_classes_faculty_idx ON classroom_classes(faculty_user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS class_enrolments_student_idx ON class_enrolments(student_user_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS attendance_sessions_active_unique ON attendance_sessions(class_id) WHERE status = 'active'"),
    db.prepare("CREATE INDEX IF NOT EXISTS attendance_sessions_class_idx ON attendance_sessions(class_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS attendance_sessions_expiry_idx ON attendance_sessions(expires_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS attendance_records_student_idx ON attendance_records(student_user_id)"),
  ]);
}

async function getClassroomDb() {
  if (!classroomSchemaPromise) {
    classroomSchemaPromise = initializeClassroomSchema().catch((error) => {
      classroomSchemaPromise = null;
      throw error;
    });
  }
  await classroomSchemaPromise;
  return getAppDatabase();
}

function cleanText(value: string, maximum = 80) {
  return value.replace(/[<>\r\n]/g, "").trim().slice(0, maximum);
}

function randomString(length: number, alphabet: string) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function makeClassCode() {
  return randomString(7, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
}

function makeAttendanceToken() {
  return randomString(48, "abcdef0123456789");
}

function makeManualCode() {
  return randomString(10, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
}

function mapClass(row: ClassRow): ClassroomSummary {
  return {
    id: Number(row.id),
    subjectName: row.subject_name,
    subjectCode: row.subject_code,
    semester: row.semester,
    section: row.section,
    classCode: row.class_code,
    facultyName: row.faculty_name,
    studentCount: Number(row.student_count ?? 0),
    joinedAt: row.joined_at,
    createdAt: row.created_at,
  };
}

async function getOwnedClass(db: AppDatabase, classId: number, facultyUserId: number) {
  return db.prepare("SELECT * FROM classroom_classes WHERE id = ? AND faculty_user_id = ? AND status = 'active'").bind(classId, facultyUserId).first();
}

async function finalizeSession(db: AppDatabase, sessionId: number) {
  await db.batch([
    db.prepare("UPDATE attendance_sessions SET status = 'closed', closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP) WHERE id = ?").bind(sessionId),
    db.prepare(`INSERT INTO attendance_records (session_id, student_user_id, status, source)
      SELECT ?, e.student_user_id, 'absent', 'automatic'
      FROM class_enrolments e
      JOIN attendance_sessions s ON s.class_id = e.class_id
      WHERE s.id = ? AND NOT EXISTS (
        SELECT 1 FROM attendance_records r WHERE r.session_id = ? AND r.student_user_id = e.student_user_id
      )`).bind(sessionId, sessionId, sessionId),
  ]);
}

async function finalizeExpiredSessions(db: AppDatabase, classId?: number) {
  const statement = classId
    ? db.prepare("SELECT id FROM attendance_sessions WHERE class_id = ? AND status = 'active' AND expires_at <= CURRENT_TIMESTAMP").bind(classId)
    : db.prepare("SELECT id FROM attendance_sessions WHERE status = 'active' AND expires_at <= CURRENT_TIMESTAMP");
  const result = await statement.all();
  for (const row of result.results ?? []) await finalizeSession(db, Number((row as { id: number }).id));
}

export async function listClasses(request: Request) {
  const session = await getAuthorizedSession(request, ["faculty", "student"]);
  if (!session) return null;
  const db = await getClassroomDb();
  const query = session.user.role === "faculty"
    ? db.prepare(`SELECT c.*, u.display_name AS faculty_name, COUNT(e.id) AS student_count, NULL AS joined_at
        FROM classroom_classes c
        JOIN auth_users u ON u.id = c.faculty_user_id
        LEFT JOIN class_enrolments e ON e.class_id = c.id
        WHERE c.faculty_user_id = ? AND c.status = 'active'
        GROUP BY c.id ORDER BY c.created_at DESC`).bind(session.databaseUserId)
    : db.prepare(`SELECT c.*, u.display_name AS faculty_name, COUNT(all_e.id) AS student_count, mine.joined_at
        FROM class_enrolments mine
        JOIN classroom_classes c ON c.id = mine.class_id
        JOIN auth_users u ON u.id = c.faculty_user_id
        LEFT JOIN class_enrolments all_e ON all_e.class_id = c.id
        WHERE mine.student_user_id = ? AND c.status = 'active'
        GROUP BY c.id ORDER BY mine.joined_at DESC`).bind(session.databaseUserId);
  const result = await query.all();
  return { role: session.user.role as ClassroomRole, classes: (result.results as ClassRow[]).map(mapClass) };
}

export async function createClass(request: Request, input: { subjectName: string; subjectCode: string; semester: string; section: string }) {
  const session = await getAuthorizedSession(request, ["faculty"]);
  if (!session) return { ok: false as const, status: 403, message: "Faculty access is required." };
  const subjectName = cleanText(input.subjectName);
  const subjectCode = cleanText(input.subjectCode, 16).toUpperCase();
  const semester = cleanText(input.semester, 30);
  const section = cleanText(input.section, 12).toUpperCase();
  if (subjectName.length < 2) return { ok: false as const, status: 400, message: "Enter a subject name." };
  if (!/^[A-Z0-9-]{2,16}$/.test(subjectCode)) return { ok: false as const, status: 400, message: "Use a valid subject code." };
  if (!semester || !section) return { ok: false as const, status: 400, message: "Enter the semester and section." };
  const db = await getClassroomDb();
  let classCode = makeClassCode();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const existing = await db.prepare("SELECT id FROM classroom_classes WHERE class_code = ?").bind(classCode).first();
    if (!existing) break;
    classCode = makeClassCode();
  }
  const inserted = await db.prepare(`INSERT INTO classroom_classes
    (subject_name, subject_code, semester, section, class_code, faculty_user_id)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(subjectName, subjectCode, semester, section, classCode, session.databaseUserId)
    .run();
  const classId = Number(inserted.meta.last_row_id);
  const row = (await db.prepare(`SELECT c.*, u.display_name AS faculty_name, 0 AS student_count, NULL AS joined_at
    FROM classroom_classes c JOIN auth_users u ON u.id = c.faculty_user_id WHERE c.id = ?`).bind(classId).first()) as ClassRow;
  return { ok: true as const, classroom: mapClass(row) };
}

export async function joinClass(request: Request, classCodeInput: string) {
  const session = await getAuthorizedSession(request, ["student"]);
  if (!session) return { ok: false as const, status: 403, message: "Student access is required." };
  const classCode = cleanText(classCodeInput, 12).toUpperCase().replace(/\s/g, "");
  const db = await getClassroomDb();
  const classroom = (await db.prepare("SELECT id, subject_name FROM classroom_classes WHERE class_code = ? AND status = 'active'").bind(classCode).first()) as { id: number; subject_name: string } | null;
  if (!classroom) return { ok: false as const, status: 404, message: "No active class uses that join code." };
  const inserted = await db.prepare("INSERT INTO class_enrolments (class_id, student_user_id) VALUES (?, ?) ON CONFLICT(class_id, student_user_id) DO NOTHING").bind(classroom.id, session.databaseUserId).run();
  return { ok: true as const, alreadyJoined: Number(inserted.meta.changes ?? 0) === 0, className: classroom.subject_name };
}

export async function enrolStudent(request: Request, input: { classId: number; studentUserId: string }) {
  const session = await getAuthorizedSession(request, ["faculty"]);
  if (!session) return { ok: false as const, status: 403, message: "Faculty access is required." };
  const db = await getClassroomDb();
  const classroom = await getOwnedClass(db, input.classId, session.databaseUserId);
  if (!classroom) return { ok: false as const, status: 404, message: "Class not found." };
  const userId = cleanText(input.studentUserId, 20).toUpperCase();
  const student = (await db.prepare("SELECT id, display_name FROM auth_users WHERE user_id = ? AND role = 'student' AND is_admin = 0 AND status = 'active'").bind(userId).first()) as { id: number; display_name: string } | null;
  if (!student) return { ok: false as const, status: 404, message: "No active student account uses that user ID." };
  const inserted = await db.prepare("INSERT INTO class_enrolments (class_id, student_user_id) VALUES (?, ?) ON CONFLICT(class_id, student_user_id) DO NOTHING").bind(input.classId, student.id).run();
  return { ok: true as const, alreadyEnrolled: Number(inserted.meta.changes ?? 0) === 0, displayName: student.display_name, userId };
}

export async function getClassRoster(request: Request, classId: number) {
  const session = await getAuthorizedSession(request, ["faculty"]);
  if (!session) return null;
  const db = await getClassroomDb();
  const classroom = await getOwnedClass(db, classId, session.databaseUserId);
  if (!classroom) return null;
  await finalizeExpiredSessions(db, classId);
  const result = await db.prepare(`SELECT u.id, u.user_id, u.display_name, e.joined_at,
      COUNT(s.id) AS total_sessions,
      SUM(CASE WHEN r.status IN ('present', 'late') THEN 1 ELSE 0 END) AS attended_sessions
    FROM class_enrolments e
    JOIN auth_users u ON u.id = e.student_user_id
    LEFT JOIN attendance_sessions s ON s.class_id = e.class_id AND s.status = 'closed'
    LEFT JOIN attendance_records r ON r.session_id = s.id AND r.student_user_id = e.student_user_id
    WHERE e.class_id = ? GROUP BY u.id ORDER BY u.display_name ASC`).bind(classId).all();
  return {
    students: (result.results as Array<{ id: number; user_id: string; display_name: string; joined_at: string; total_sessions: number; attended_sessions: number }>).map((row) => ({
      databaseId: Number(row.id),
      userId: row.user_id,
      displayName: row.display_name,
      joinedAt: row.joined_at,
      totalSessions: Number(row.total_sessions ?? 0),
      attendedSessions: Number(row.attended_sessions ?? 0),
      attendanceRate: Number(row.total_sessions) ? Math.round((Number(row.attended_sessions) / Number(row.total_sessions)) * 100) : null,
    })),
  };
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

async function rotatingCredential(row: SessionRow, rotation: number) {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(row.qr_token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(`${row.id}:${rotation}`)));
  return {
    token: bytesToHex(signature.slice(0, 20)).toUpperCase(),
    manualCode: Array.from(signature.slice(20, 30), (byte) => MANUAL_CODE_ALPHABET[byte % MANUAL_CODE_ALPHABET.length]).join(""),
  };
}

function acceptedRotations(now = Date.now()) {
  const current = Math.floor(now / ATTENDANCE_ROTATION_MS);
  return now % ATTENDANCE_ROTATION_MS <= ATTENDANCE_GRACE_MS ? [current, current - 1] : [current];
}

async function publicAttendanceSession(row: SessionRow) {
  const now = Date.now();
  const rotation = Math.floor(now / ATTENDANCE_ROTATION_MS);
  const credential = await rotatingCredential(row, rotation);
  const qrExpiresAt = new Date((rotation + 1) * ATTENDANCE_ROTATION_MS).toISOString();
  const qrPayload = JSON.stringify({
    type: "eduassist-attendance",
    version: 2,
    sessionId: Number(row.id),
    rotation,
    token: credential.token,
    expiresAt: qrExpiresAt,
  });
  return {
    id: Number(row.id),
    classId: Number(row.class_id),
    subjectName: row.subject_name,
    subjectCode: row.subject_code,
    semester: row.semester,
    section: row.section,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    status: row.status,
    manualCode: credential.manualCode,
    qrPayload,
    qrExpiresAt,
  };
}

async function readSessionRow(db: AppDatabase, sessionId: number) {
  return (await db.prepare(`SELECT s.*, c.subject_name, c.subject_code, c.semester, c.section
    FROM attendance_sessions s JOIN classroom_classes c ON c.id = s.class_id WHERE s.id = ?`).bind(sessionId).first()) as SessionRow | null;
}

export async function startAttendance(request: Request, input: { classId: number; durationMinutes: number }) {
  const session = await getAuthorizedSession(request, ["faculty"]);
  if (!session) return { ok: false as const, status: 403, message: "Faculty access is required." };
  const durationMinutes = Math.min(5, Math.max(2, Math.round(input.durationMinutes || 4)));
  const db = await getClassroomDb();
  const classroom = await getOwnedClass(db, input.classId, session.databaseUserId);
  if (!classroom) return { ok: false as const, status: 404, message: "Class not found." };
  await finalizeExpiredSessions(db, input.classId);
  const enrolment = await db.prepare("SELECT COUNT(*) AS count FROM class_enrolments WHERE class_id = ?").bind(input.classId).first() as { count: number };
  if (!Number(enrolment.count)) return { ok: false as const, status: 400, message: "Add at least one student before starting attendance." };
  const active = await db.prepare("SELECT id FROM attendance_sessions WHERE class_id = ? AND status = 'active' AND expires_at > CURRENT_TIMESTAMP").bind(input.classId).first();
  if (active) return { ok: false as const, status: 409, message: "This class already has an active attendance session." };
  const token = makeAttendanceToken();
  const manualCode = makeManualCode();
  let newSessionId: number;
  try {
    const inserted = await db.prepare(`INSERT INTO attendance_sessions
      (class_id, qr_token, manual_code, expires_at, created_by)
      VALUES (?, ?, ?, datetime('now', ?), ?)`)
      .bind(input.classId, token, manualCode, `+${durationMinutes} minutes`, session.databaseUserId)
      .run();
    newSessionId = Number(inserted.meta.last_row_id);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      return { ok: false as const, status: 409, message: "This class already has an active attendance session." };
    }
    throw error;
  }
  const row = await readSessionRow(db, newSessionId);
  return { ok: true as const, attendanceSession: await publicAttendanceSession(row as SessionRow) };
}

export async function getAttendanceSession(request: Request, sessionId: number) {
  const session = await getAuthorizedSession(request, ["faculty"]);
  if (!session) return null;
  const db = await getClassroomDb();
  const row = await readSessionRow(db, sessionId);
  if (!row || !(await getOwnedClass(db, row.class_id, session.databaseUserId))) return null;
  if (row.status === "active" && new Date(`${row.expires_at.replace(" ", "T")}Z`).getTime() <= Date.now()) {
    await finalizeSession(db, sessionId);
  }
  const refreshed = await readSessionRow(db, sessionId) as SessionRow;
  const roster = await db.prepare(`SELECT u.user_id, u.display_name,
      COALESCE(r.status, 'pending') AS attendance_status,
      r.marked_at, r.source
    FROM class_enrolments e
    JOIN auth_users u ON u.id = e.student_user_id
    LEFT JOIN attendance_records r ON r.student_user_id = e.student_user_id AND r.session_id = ?
    WHERE e.class_id = ? ORDER BY u.display_name ASC`).bind(sessionId, row.class_id).all();
  return {
    attendanceSession: await publicAttendanceSession(refreshed),
    roster: roster.results.map((entry: Record<string, unknown>) => ({
      userId: String(entry.user_id),
      displayName: String(entry.display_name),
      status: String(entry.attendance_status),
      markedAt: entry.marked_at ? String(entry.marked_at) : null,
      source: entry.source ? String(entry.source) : null,
    })),
  };
}

function parseAttendanceCredential(value: string) {
  const clean = value.trim();
  try {
    const parsed = JSON.parse(clean) as { type?: string; sessionId?: number; rotation?: number; token?: string };
    if (
      parsed.type === "eduassist-attendance"
      && Number.isInteger(parsed.sessionId)
      && Number.isInteger(parsed.rotation)
      && typeof parsed.token === "string"
    ) {
      return { source: "qr" as const, sessionId: Number(parsed.sessionId), rotation: Number(parsed.rotation), token: parsed.token.toUpperCase() };
    }
  } catch {
    // Manual codes are accepted below.
  }
  return { source: "manual" as const, code: clean.toUpperCase() };
}

export async function getActiveAttendanceSession(request: Request, classId: number) {
  const session = await getAuthorizedSession(request, ["faculty"]);
  if (!session) return null;
  const db = await getClassroomDb();
  if (!(await getOwnedClass(db, classId, session.databaseUserId))) return null;
  await finalizeExpiredSessions(db, classId);
  const active = await db.prepare("SELECT id FROM attendance_sessions WHERE class_id = ? AND status = 'active' AND expires_at > CURRENT_TIMESTAMP ORDER BY id DESC LIMIT 1").bind(classId).first() as { id: number } | null;
  if (!active) return { attendanceSession: null, roster: [] };
  return getAttendanceSession(request, Number(active.id));
}

export async function markAttendance(request: Request, credentialInput: string) {
  const session = await getAuthorizedSession(request, ["student"]);
  if (!session) return { ok: false as const, status: 403, message: "Student access is required." };
  const credential = parseAttendanceCredential(credentialInput);
  if (credential.source === "qr" && !/^[A-F0-9]{40}$/.test(credential.token)) {
    return { ok: false as const, status: 400, message: "Scan a valid EduAssist QR code or enter the session code." };
  }
  if (credential.source === "manual" && !/^[A-Z0-9]{10}$/.test(credential.code)) {
    return { ok: false as const, status: 400, message: "Scan a valid EduAssist QR code or enter the session code." };
  }
  const db = await getClassroomDb();
  let attendance: SessionRow | null = null;
  const validRotations = acceptedRotations();
  if (credential.source === "qr" && validRotations.includes(credential.rotation)) {
    const candidate = await readSessionRow(db, credential.sessionId);
    if (candidate && candidate.status === "active" && new Date(`${candidate.expires_at.replace(" ", "T")}Z`).getTime() > Date.now()) {
      const expected = await rotatingCredential(candidate, credential.rotation);
      if (timingSafeEqual(expected.token, credential.token)) attendance = candidate;
    }
  } else if (credential.source === "manual") {
    const active = await db.prepare(`SELECT s.*, c.subject_name, c.subject_code, c.semester, c.section
      FROM attendance_sessions s JOIN classroom_classes c ON c.id = s.class_id
      WHERE s.status = 'active' AND s.expires_at > CURRENT_TIMESTAMP`).all();
    for (const candidate of active.results as SessionRow[]) {
      for (const rotation of validRotations) {
        const expected = await rotatingCredential(candidate, rotation);
        if (timingSafeEqual(expected.manualCode, credential.code)) {
          attendance = candidate;
          break;
        }
      }
      if (attendance) break;
    }
  }
  if (!attendance) return { ok: false as const, status: 410, message: "That attendance session is invalid, closed, or expired." };
  const enrolled = await db.prepare("SELECT id FROM class_enrolments WHERE class_id = ? AND student_user_id = ?").bind(attendance.class_id, session.databaseUserId).first();
  if (!enrolled) return { ok: false as const, status: 403, message: "You are not enrolled in this class." };
  const inserted = await db.prepare(`INSERT INTO attendance_records (session_id, student_user_id, status, source)
    VALUES (?, ?, 'present', ?) ON CONFLICT(session_id, student_user_id) DO NOTHING`)
    .bind(attendance.id, session.databaseUserId, credential.source).run();
  const record = await db.prepare("SELECT status, marked_at FROM attendance_records WHERE session_id = ? AND student_user_id = ?").bind(attendance.id, session.databaseUserId).first() as { status: string; marked_at: string };
  return {
    ok: true as const,
    alreadyMarked: Number(inserted.meta.changes ?? 0) === 0,
    record: { status: record.status, markedAt: record.marked_at },
    classroom: { id: attendance.class_id, subjectName: attendance.subject_name, subjectCode: attendance.subject_code },
  };
}

export async function closeAttendance(request: Request, sessionId: number) {
  const session = await getAuthorizedSession(request, ["faculty"]);
  if (!session) return { ok: false as const, status: 403, message: "Faculty access is required." };
  const db = await getClassroomDb();
  const row = await readSessionRow(db, sessionId);
  if (!row || !(await getOwnedClass(db, row.class_id, session.databaseUserId))) return { ok: false as const, status: 404, message: "Attendance session not found." };
  await finalizeSession(db, sessionId);
  return { ok: true as const };
}

export async function correctAttendance(request: Request, input: { sessionId: number; studentUserId: string; status: string }) {
  const session = await getAuthorizedSession(request, ["faculty"]);
  if (!session) return { ok: false as const, status: 403, message: "Faculty access is required." };
  if (!(["present", "late", "absent"] as string[]).includes(input.status)) return { ok: false as const, status: 400, message: "Choose Present, Late, or Absent." };
  const db = await getClassroomDb();
  const row = await readSessionRow(db, input.sessionId);
  if (!row || !(await getOwnedClass(db, row.class_id, session.databaseUserId))) return { ok: false as const, status: 404, message: "Attendance session not found." };
  const student = (await db.prepare(`SELECT u.id FROM auth_users u JOIN class_enrolments e ON e.student_user_id = u.id
    WHERE e.class_id = ? AND u.user_id = ?`).bind(row.class_id, cleanText(input.studentUserId, 20).toUpperCase()).first()) as { id: number } | null;
  if (!student) return { ok: false as const, status: 404, message: "That student is not enrolled in this class." };
  await db.prepare(`INSERT INTO attendance_records (session_id, student_user_id, status, source, corrected_by)
    VALUES (?, ?, ?, 'manual', ?)
    ON CONFLICT(session_id, student_user_id) DO UPDATE SET
      status = excluded.status, source = 'manual', corrected_by = excluded.corrected_by, marked_at = CURRENT_TIMESTAMP`)
    .bind(input.sessionId, student.id, input.status, session.databaseUserId).run();
  return { ok: true as const };
}

export async function getReports(request: Request, requestedClassId?: number) {
  const session = await getAuthorizedSession(request, ["faculty", "student"]);
  if (!session) return null;
  const db = await getClassroomDb();
  await finalizeExpiredSessions(db);
  if (session.user.role === "student") {
    const classResult = await db.prepare(`SELECT c.id, c.subject_name, c.subject_code, c.semester, c.section, u.display_name AS faculty_name
      FROM class_enrolments e JOIN classroom_classes c ON c.id = e.class_id
      JOIN auth_users u ON u.id = c.faculty_user_id
      WHERE e.student_user_id = ? AND c.status = 'active' ORDER BY c.subject_name`).bind(session.databaseUserId).all();
    const reports = [];
    for (const classroom of classResult.results as Array<Record<string, unknown>>) {
      const historyResult = await db.prepare(`SELECT s.id, s.starts_at, COALESCE(r.status, 'absent') AS attendance_status, r.marked_at
        FROM attendance_sessions s
        LEFT JOIN attendance_records r ON r.session_id = s.id AND r.student_user_id = ?
        WHERE s.class_id = ? AND s.status = 'closed' ORDER BY s.starts_at DESC`).bind(session.databaseUserId, classroom.id).all();
      const history = (historyResult.results as Array<Record<string, unknown>>).map((row) => ({ id: Number(row.id), startsAt: String(row.starts_at), status: String(row.attendance_status), markedAt: row.marked_at ? String(row.marked_at) : null }));
      const attended = history.filter((row) => row.status === "present" || row.status === "late").length;
      reports.push({
        classId: Number(classroom.id), subjectName: String(classroom.subject_name), subjectCode: String(classroom.subject_code),
        semester: String(classroom.semester), section: String(classroom.section), facultyName: String(classroom.faculty_name),
        totalSessions: history.length, attendedSessions: attended, attendanceRate: history.length ? Math.round((attended / history.length) * 100) : null, history,
      });
    }
    return { role: "student" as const, reports };
  }

  const ownedClasses = await listClasses(request);
  const classes = ownedClasses?.classes ?? [];
  const selectedClass = classes.find((item) => item.id === requestedClassId) ?? classes[0] ?? null;
  if (!selectedClass) return { role: "faculty" as const, classes, selectedClass: null, students: [], sessions: [], summary: { totalSessions: 0, averageAttendance: null, totalStudents: 0 } };
  const historyResult = await db.prepare(`SELECT s.id AS session_id, s.starts_at, u.user_id, u.display_name,
      COALESCE(r.status, 'absent') AS attendance_status, r.marked_at
    FROM attendance_sessions s
    JOIN class_enrolments e ON e.class_id = s.class_id
    JOIN auth_users u ON u.id = e.student_user_id
    LEFT JOIN attendance_records r ON r.session_id = s.id AND r.student_user_id = e.student_user_id
    WHERE s.class_id = ? AND s.status = 'closed'
    ORDER BY s.starts_at DESC, u.display_name ASC`).bind(selectedClass.id).all();
  const enrolledResult = await db.prepare(`SELECT u.user_id, u.display_name
    FROM class_enrolments e JOIN auth_users u ON u.id = e.student_user_id
    WHERE e.class_id = ? ORDER BY u.display_name ASC`).bind(selectedClass.id).all();
  const rows = historyResult.results as Array<Record<string, unknown>>;
  const studentsMap = new Map<string, { userId: string; displayName: string; present: number; late: number; absent: number }>();
  const sessionsMap = new Map<number, { id: number; startsAt: string; present: number; late: number; absent: number }>();
  for (const row of enrolledResult.results as Array<Record<string, unknown>>) {
    const userId = String(row.user_id);
    studentsMap.set(userId, { userId, displayName: String(row.display_name), present: 0, late: 0, absent: 0 });
  }
  for (const row of rows) {
    const userId = String(row.user_id);
    const status = String(row.attendance_status) as AttendanceStatus;
    const student = studentsMap.get(userId) ?? { userId, displayName: String(row.display_name), present: 0, late: 0, absent: 0 };
    student[status] += 1;
    studentsMap.set(userId, student);
    const sessionId = Number(row.session_id);
    const classSession = sessionsMap.get(sessionId) ?? { id: sessionId, startsAt: String(row.starts_at), present: 0, late: 0, absent: 0 };
    classSession[status] += 1;
    sessionsMap.set(sessionId, classSession);
  }
  const totalSessions = sessionsMap.size;
  const students = Array.from(studentsMap.values()).map((student) => ({
    ...student,
    totalSessions,
    attended: student.present + student.late,
    attendanceRate: totalSessions ? Math.round(((student.present + student.late) / totalSessions) * 100) : null,
  }));
  const sessions = Array.from(sessionsMap.values()).map((item) => ({ ...item, total: item.present + item.late + item.absent, attendanceRate: item.present + item.late + item.absent ? Math.round(((item.present + item.late) / (item.present + item.late + item.absent)) * 100) : null }));
  const averageAttendance = students.length && totalSessions ? Math.round(students.reduce((sum, item) => sum + (item.attendanceRate ?? 0), 0) / students.length) : null;
  return { role: "faculty" as const, classes, selectedClass, students, sessions, summary: { totalSessions, averageAttendance, totalStudents: selectedClass.studentCount } };
}
