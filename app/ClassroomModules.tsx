"use client";

import QRCode from "qrcode";
import jsQR from "jsqr";
import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";

export type LiveClass = {
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

type Role = "faculty" | "student";
type AttendanceSession = {
  id: number;
  classId: number;
  subjectName: string;
  subjectCode: string;
  semester: string;
  section: string;
  startsAt: string;
  expiresAt: string;
  status: "active" | "closed";
  rotationSeconds: number;
  manualCode: string;
  qrPayload: string;
  qrExpiresAt: string;
};

type RosterEntry = {
  userId: string;
  displayName: string;
  status: "present" | "late" | "absent" | "pending";
  markedAt: string | null;
  source: string | null;
};

type FacultyReport = {
  role: "faculty";
  classes: LiveClass[];
  selectedClass: LiveClass | null;
  students: Array<{ userId: string; displayName: string; present: number; late: number; absent: number; totalSessions: number; attended: number; attendanceRate: number | null }>;
  sessions: Array<{ id: number; startsAt: string; present: number; late: number; absent: number; total: number; attendanceRate: number | null }>;
  summary: { totalSessions: number; averageAttendance: number | null; totalStudents: number };
};

type StudentReport = {
  role: "student";
  reports: Array<{
    classId: number;
    subjectName: string;
    subjectCode: string;
    semester: string;
    section: string;
    facultyName: string;
    totalSessions: number;
    attendedSessions: number;
    attendanceRate: number | null;
    history: Array<{ id: number; startsAt: string; status: string; markedAt: string | null }>;
  }>;
};

function requestHeaders(deviceId: string, json = false): Record<string, string> {
  const headers: Record<string, string> = { "x-eduassist-device-id": deviceId };
  if (json) headers["content-type"] = "application/json";
  return headers;
}

async function resultJson<T>(response: Response) {
  const result = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) throw new Error(result.message ?? "EduAssist could not complete that action.");
  return result;
}

function parseUtcDate(value: string) {
  return new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
}

function dateLabel(value: string, includeTime = true) {
  const date = parseUtcDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", includeTime
    ? { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" });
}

function classMonogram(name: string) {
  return name.split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
}

function personInitials(name: string) {
  return name.split(" ").filter(Boolean).map((word) => word[0]).slice(0, 2).join("").toUpperCase();
}

function EmptyModule({ icon, title, detail, action }: { icon: string; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="live-empty"><span>{icon}</span><h3>{title}</h3><p>{detail}</p>{action}</div>;
}

export function LiveClassesView({ role, classes, deviceId, onCreate, onRefresh, onNotify }: { role: Role; classes: LiveClass[]; deviceId: string; onCreate: () => void; onRefresh: () => Promise<void>; onNotify: (message: string) => void }) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [editingClass, setEditingClass] = useState<LiveClass | null>(null);
  const [deletingClass, setDeletingClass] = useState<LiveClass | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [managing, setManaging] = useState(false);
  const [manageError, setManageError] = useState("");

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const classCode = String(new FormData(form).get("classCode") ?? "");
    setJoining(true);
    setError("");
    try {
      const response = await fetch("/api/classroom/join", { method: "POST", headers: requestHeaders(deviceId, true), body: JSON.stringify({ classCode }) });
      const result = await resultJson<{ className: string; alreadyJoined: boolean }>(response);
      form.reset();
      await onRefresh();
      onNotify(result.alreadyJoined ? `You are already enrolled in ${result.className}.` : `Joined ${result.className} successfully.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The class could not be joined.");
    } finally {
      setJoining(false);
    }
  }

  async function editClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingClass) return;
    const data = new FormData(event.currentTarget);
    setManaging(true);
    setManageError("");
    try {
      const response = await fetch("/api/classroom/classes", {
        method: "PATCH",
        headers: requestHeaders(deviceId, true),
        body: JSON.stringify({
          classId: editingClass.id,
          subjectName: String(data.get("subjectName") ?? ""),
          subjectCode: String(data.get("subjectCode") ?? "").toUpperCase(),
          semester: String(data.get("semester") ?? ""),
          section: String(data.get("section") ?? "").toUpperCase(),
        }),
      });
      const result = await resultJson<{ classroom: LiveClass }>(response);
      await onRefresh();
      setEditingClass(null);
      onNotify(`${result.classroom.subjectCode} was updated.`);
    } catch (reason) {
      setManageError(reason instanceof Error ? reason.message : "The class could not be updated.");
    } finally {
      setManaging(false);
    }
  }

  async function removeClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deletingClass) return;
    setManaging(true);
    setManageError("");
    try {
      const response = await fetch("/api/classroom/classes", {
        method: "DELETE",
        headers: requestHeaders(deviceId, true),
        body: JSON.stringify({ classId: deletingClass.id, confirmationCode: deleteConfirmation }),
      });
      const result = await resultJson<{ className: string; removed: { enrolments: number; attendanceSessions: number; attendanceRecords: number } }>(response);
      await onRefresh();
      setDeletingClass(null);
      setDeleteConfirmation("");
      onNotify(`${result.className} was deleted with ${result.removed.attendanceRecords} attendance record${result.removed.attendanceRecords === 1 ? "" : "s"}.`);
    } catch (reason) {
      setManageError(reason instanceof Error ? reason.message : "The class could not be deleted.");
    } finally {
      setManaging(false);
    }
  }

  return <>
    <section className="page-stack live-classes-page">
      <div className="section-title-row"><div><span className="eyebrow">ACADEMIC YEAR 2026–27</span><h2>{role === "faculty" ? "Your live classes" : "Your enrolled classes"}</h2><p>{role === "faculty" ? "Create classes, share join codes, and manage enrolled students." : "Join a faculty class once, then use its secure attendance sessions."}</p></div>{role === "faculty" ? <button className="button primary" onClick={onCreate}>＋ Create class</button> : null}</div>
      {role === "student" ? <form className="join-class-panel" onSubmit={join}><span>⌁</span><div><b>Join another class</b><p>Enter the seven-character code shared by your faculty.</p></div><input name="classCode" required minLength={7} maxLength={7} placeholder="ABC2345" aria-label="Class join code" /><button className="button primary" disabled={joining}>{joining ? "Joining…" : "Join class"}</button>{error ? <small>{error}</small> : null}</form> : null}
      <div className="class-card-grid">
        {classes.map((item, index) => <article className="class-card live-class-card" key={item.id}>
          <div className={`class-card-top ${["navy", "mint", "yellow", "coral"][index % 4]}`}><span>{item.subjectCode}</span><div className="class-monogram">{classMonogram(item.subjectName)}</div></div>
          <div className="class-card-body"><h3>{item.subjectName}</h3><p>{item.semester} · Section {item.section}</p><div className="class-stats"><span><b>{item.studentCount}</b> students</span><span><b>{role === "faculty" ? "Owner" : "Faculty"}</b> {item.facultyName}</span></div><div className="class-code-box"><span>JOIN CODE</span><b>{item.classCode}</b><button onClick={() => { void navigator.clipboard?.writeText(item.classCode); onNotify("Class join code copied."); }}>Copy</button></div><div className="live-class-foot"><span><i /> Active class</span><small>Created {dateLabel(item.createdAt, false)}</small></div>{role === "faculty" ? <div className="class-management-actions"><button onClick={() => { setEditingClass(item); setManageError(""); }}>Edit class</button><button className="danger" onClick={() => { setDeletingClass(item); setDeleteConfirmation(""); setManageError(""); }}>Delete</button></div> : null}</div>
        </article>)}
        {classes.length === 0 ? <EmptyModule icon="▣" title={role === "faculty" ? "Create your first class" : "No enrolled classes yet"} detail={role === "faculty" ? "A unique join code will be generated automatically." : "Ask your faculty for a class code and enter it above."} action={role === "faculty" ? <button className="button primary" onClick={onCreate}>Create class</button> : undefined} /> : null}
      </div>
    </section>

    {editingClass ? <div className="modal-backdrop" onMouseDown={() => { if (!managing) setEditingClass(null); }}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="edit-class-title">
        <div className="modal-header"><div><span className="eyebrow">EDIT CLASS</span><h2 id="edit-class-title">{editingClass.subjectName}</h2></div><button onClick={() => setEditingClass(null)} disabled={managing} aria-label="Close">×</button></div>
        <form onSubmit={editClass}>
          <label>Subject name<input name="subjectName" required defaultValue={editingClass.subjectName} /></label>
          <div className="form-row"><label>Subject code<input name="subjectCode" required defaultValue={editingClass.subjectCode} maxLength={16} /></label><label>Section<input name="section" required defaultValue={editingClass.section} maxLength={12} /></label></div>
          <label>Semester<input name="semester" required defaultValue={editingClass.semester} maxLength={30} /></label>
          <div className="modal-note"><span>✓</span><p><b>The join code remains unchanged.</b><br />Enrolments and attendance history stay connected to this class.</p></div>
          {manageError ? <div className="module-error">! {manageError}</div> : null}
          <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setEditingClass(null)} disabled={managing}>Cancel</button><button className="button primary" type="submit" disabled={managing}>{managing ? "Saving…" : "Save changes"}</button></div>
        </form>
      </div>
    </div> : null}

    {deletingClass ? <div className="modal-backdrop" onMouseDown={() => { if (!managing) setDeletingClass(null); }}>
      <div className="modal class-delete-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="delete-class-title">
        <div className="modal-header"><div><span className="eyebrow danger">DELETE CLASS</span><h2 id="delete-class-title">{deletingClass.subjectName}</h2></div><button onClick={() => setDeletingClass(null)} disabled={managing} aria-label="Close">×</button></div>
        <form onSubmit={removeClass}>
          <div className="modal-note warning"><span>!</span><p><b>This permanently removes the class.</b><br />Its enrolments, attendance sessions, and attendance records will also be deleted. Close any active attendance session first.</p></div>
          <label>Type <b>{deletingClass.classCode}</b> to confirm<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value.toUpperCase())} required autoComplete="off" placeholder={deletingClass.classCode} aria-label="Class deletion confirmation code" /></label>
          {manageError ? <div className="module-error">! {manageError}</div> : null}
          <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setDeletingClass(null)} disabled={managing}>Cancel</button><button className="button danger-button" type="submit" disabled={managing || deleteConfirmation.trim() !== deletingClass.classCode}>{managing ? "Deleting…" : "Delete class permanently"}</button></div>
        </form>
      </div>
    </div> : null}
  </>;
}

type RosterStudent = { databaseId: number; userId: string; displayName: string; joinedAt: string; totalSessions: number; attendedSessions: number; attendanceRate: number | null };

export function LiveRosterView({ classes, deviceId, onRefreshClasses, onNotify }: { classes: LiveClass[]; deviceId: string; onRefreshClasses: () => Promise<void>; onNotify: (message: string) => void }) {
  const [selectedClassId, setSelectedClassId] = useState(0);
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const selected = classes.find((item) => item.id === selectedClassId) ?? classes[0] ?? null;

  async function refreshRoster(classId = selected?.id) {
    if (!classId) { setStudents([]); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/classroom/roster?classId=${classId}`, { cache: "no-store", headers: requestHeaders(deviceId) });
      const result = await resultJson<{ students: RosterStudent[] }>(response);
      setStudents(result.students);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The roster could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshRoster(selected?.id); }, 0);
    return () => window.clearTimeout(timer);
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function enrol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const studentUserId = String(new FormData(form).get("studentUserId") ?? "");
    setLoading(true);
    try {
      const response = await fetch("/api/classroom/enrol", { method: "POST", headers: requestHeaders(deviceId, true), body: JSON.stringify({ classId: selected.id, studentUserId }) });
      const result = await resultJson<{ displayName: string; alreadyEnrolled: boolean }>(response);
      form.reset();
      await Promise.all([refreshRoster(selected.id), onRefreshClasses()]);
      onNotify(result.alreadyEnrolled ? `${result.displayName} is already enrolled.` : `${result.displayName} was added to ${selected.subjectCode}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The student could not be added.");
    } finally {
      setLoading(false);
    }
  }

  if (!selected) return <section className="page-stack"><div className="section-title-row"><div><span className="eyebrow">CLASS ROSTER</span><h2>Students</h2></div></div><EmptyModule icon="♙" title="Create a class first" detail="Student enrolments belong to a faculty class." /></section>;

  return <section className="page-stack"><div className="section-title-row"><div><span className="eyebrow">LIVE ENROLMENTS</span><h2>Student roster</h2><p>Add an existing student account by user ID and track attendance progress.</p></div><select className="module-class-select" value={selected.id} onChange={(event) => setSelectedClassId(Number(event.target.value))} aria-label="Choose class">{classes.map((item) => <option key={item.id} value={item.id}>{item.subjectCode} · {item.section}</option>)}</select></div>
    <form className="enrol-student-panel" onSubmit={enrol}><span>＋</span><div><b>Add a student account</b><p>The administrator must create the student login first.</p></div><input name="studentUserId" required placeholder="Student user ID" aria-label="Student user ID" /><button className="button primary" disabled={loading}>{loading ? "Working…" : "Add student"}</button></form>
    {error ? <div className="module-error">! {error}</div> : null}
    <div className="panel data-panel live-roster-panel"><div className="live-roster-title"><div><span className="eyebrow">{selected.subjectCode} · SECTION {selected.section}</span><h3>{selected.subjectName}</h3></div><span>{students.length} enrolled</span></div><div className="live-roster-table"><div className="live-roster-row head"><span>Student</span><span>User ID</span><span>Sessions attended</span><span>Attendance</span><span>Status</span></div>{students.map((student, index) => <div className="live-roster-row" key={student.userId}><span className="student-cell"><i className={`student-avatar a${index % 5}`}>{personInitials(student.displayName)}</i><b>{student.displayName}</b></span><span>{student.userId}</span><span>{student.attendedSessions} / {student.totalSessions}</span><span><b>{student.attendanceRate === null ? "—" : `${student.attendanceRate}%`}</b></span><span><i className={`status-dot ${student.attendanceRate === null || student.attendanceRate >= 75 ? "good" : "watch"}`} />{student.attendanceRate === null ? "New enrolment" : student.attendanceRate >= 75 ? "On track" : "Below 75%"}</span></div>)}{!students.length && !loading ? <EmptyModule icon="♙" title="No students enrolled" detail="Add a student user ID above or share the class join code." /> : null}</div></div>
  </section>;
}

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => { detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };

export function LiveAttendanceView({ role, classes, deviceId, onNotify }: { role: Role; classes: LiveClass[]; deviceId: string; onNotify: (message: string) => void }) {
  const [selectedClassId, setSelectedClassId] = useState(0);
  const [attendanceSession, setAttendanceSession] = useState<AttendanceSession | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [generatedQr, setGeneratedQr] = useState({ payload: "", url: "" });
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [markResult, setMarkResult] = useState<{ className: string; subjectCode: string; markedAt: string; alreadyMarked: boolean } | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const scanFrameRef = useRef<number | null>(null);
  const lastSoftwareScanRef = useRef(0);
  const selected = classes.find((item) => item.id === selectedClassId) ?? classes[0] ?? null;
  const activeSessionId = attendanceSession?.id;
  const activeSessionStatus = attendanceSession?.status;
  const qrDataUrl = attendanceSession?.qrPayload === generatedQr.payload ? generatedQr.url : "";

  useEffect(() => {
    if (!activeSessionId || activeSessionStatus !== "active") return;
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [activeSessionId, activeSessionStatus]);

  useEffect(() => {
    if (!attendanceSession?.qrPayload) return;
    let active = true;
    QRCode.toDataURL(attendanceSession.qrPayload, { width: 360, margin: 2, errorCorrectionLevel: "M", color: { dark: "#20274f", light: "#ffffff" } })
      .then((url) => { if (active) setGeneratedQr({ payload: attendanceSession.qrPayload, url }); })
      .catch(() => { if (active) setError("The QR image could not be generated."); });
    return () => { active = false; };
  }, [attendanceSession?.qrPayload]);

  async function loadActive(classId = selected?.id) {
    if (role !== "faculty" || !classId) return;
    try {
      const response = await fetch(`/api/classroom/attendance/active?classId=${classId}`, { cache: "no-store", headers: requestHeaders(deviceId) });
      const result = await resultJson<{ attendanceSession: AttendanceSession | null; roster: RosterEntry[] }>(response);
      setAttendanceSession(result.attendanceSession);
      setRoster(result.roster);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Attendance could not be loaded.");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadActive(selected?.id); }, 0);
    return () => window.clearTimeout(timer);
  }, [selected?.id, role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (role !== "faculty" || !activeSessionId || activeSessionStatus !== "active") return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/classroom/attendance/session?sessionId=${activeSessionId}`, { cache: "no-store", headers: requestHeaders(deviceId) });
        const result = await resultJson<{ attendanceSession: AttendanceSession; roster: RosterEntry[] }>(response);
        setAttendanceSession(result.attendanceSession);
        setRoster(result.roster);
      } catch { /* The next manual refresh will surface a persistent error. */ }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeSessionId, activeSessionStatus, deviceId, role]);

  useEffect(() => () => {
    scanningRef.current = false;
    if (scanFrameRef.current !== null) window.cancelAnimationFrame(scanFrameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const remainingSeconds = attendanceSession ? Math.max(0, Math.floor((parseUtcDate(attendanceSession.expiresAt).getTime() - now) / 1000)) : 0;
  const rotationSeconds = attendanceSession ? Math.max(0, Math.ceil((parseUtcDate(attendanceSession.qrExpiresAt).getTime() - now) / 1000)) : 0;
  const markedCount = roster.filter((entry) => entry.status === "present" || entry.status === "late").length;

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const durationMinutes = Number(new FormData(event.currentTarget).get("durationMinutes") ?? 4);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/classroom/attendance/start", { method: "POST", headers: requestHeaders(deviceId, true), body: JSON.stringify({ classId: selected.id, durationMinutes }) });
      const result = await resultJson<{ attendanceSession: AttendanceSession }>(response);
      setAttendanceSession(result.attendanceSession);
      await loadSession(result.attendanceSession.id);
      onNotify(`Attendance started for ${selected.subjectCode}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Attendance could not be started."); }
    finally { setBusy(false); }
  }

  async function loadSession(sessionId: number) {
    const response = await fetch(`/api/classroom/attendance/session?sessionId=${sessionId}`, { cache: "no-store", headers: requestHeaders(deviceId) });
    const result = await resultJson<{ attendanceSession: AttendanceSession; roster: RosterEntry[] }>(response);
    setAttendanceSession(result.attendanceSession); setRoster(result.roster);
  }

  async function close() {
    if (!attendanceSession) return;
    setBusy(true);
    try {
      const response = await fetch("/api/classroom/attendance/close", { method: "POST", headers: requestHeaders(deviceId, true), body: JSON.stringify({ sessionId: attendanceSession.id }) });
      await resultJson<{ ok: true }>(response);
      await loadSession(attendanceSession.id);
      onNotify("Attendance closed. Unmarked enrolled students were recorded absent.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Attendance could not be closed."); }
    finally { setBusy(false); }
  }

  async function correct(studentUserId: string, status: string) {
    if (!attendanceSession) return;
    try {
      const response = await fetch("/api/classroom/attendance/correct", { method: "POST", headers: requestHeaders(deviceId, true), body: JSON.stringify({ sessionId: attendanceSession.id, studentUserId, status }) });
      await resultJson<{ ok: true }>(response);
      await loadSession(attendanceSession.id);
      onNotify(`${studentUserId} updated to ${status}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Attendance could not be corrected."); }
  }

  function stopCamera() {
    scanningRef.current = false;
    if (scanFrameRef.current !== null) window.cancelAnimationFrame(scanFrameRef.current);
    scanFrameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }

  async function submitCredential(credential: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/classroom/attendance/mark", { method: "POST", headers: requestHeaders(deviceId, true), body: JSON.stringify({ credential }) });
      const result = await resultJson<{ alreadyMarked: boolean; record: { markedAt: string }; classroom: { subjectName: string; subjectCode: string } }>(response);
      setMarkResult({ className: result.classroom.subjectName, subjectCode: result.classroom.subjectCode, markedAt: result.record.markedAt, alreadyMarked: result.alreadyMarked });
      onNotify(result.alreadyMarked ? "Attendance was already recorded for this session." : "Attendance recorded successfully.");
      stopCamera();
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Attendance could not be marked."); return false; }
    finally { setBusy(false); }
  }

  async function startCamera() {
    setError(""); setMarkResult(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera-unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("video-unavailable");
      video.srcObject = stream;
      await video.play();
      setCameraActive(true); scanningRef.current = true;
      const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      let detector: InstanceType<BarcodeDetectorConstructor> | null = null;
      try { detector = Detector ? new Detector({ formats: ["qr_code"] }) : null; } catch { detector = null; }
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("decoder-unavailable");

      const scan = async (frameTime: number) => {
        if (!scanningRef.current || !videoRef.current) return;
        let credential = "";
        try {
          if (detector) {
            const codes = await detector.detect(videoRef.current);
            credential = codes[0]?.rawValue ?? "";
          }
        } catch { /* Keep the camera open while frames become readable. */ }

        if (!credential && frameTime - lastSoftwareScanRef.current >= 220 && videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          lastSoftwareScanRef.current = frameTime;
          const sourceWidth = videoRef.current.videoWidth;
          const sourceHeight = videoRef.current.videoHeight;
          if (sourceWidth && sourceHeight) {
            const scale = Math.min(1, 720 / sourceWidth);
            canvas.width = Math.max(1, Math.round(sourceWidth * scale));
            canvas.height = Math.max(1, Math.round(sourceHeight * scale));
            context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            credential = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data ?? "";
          }
        }

        if (credential) {
          scanningRef.current = false;
          const accepted = await submitCredential(credential);
          if (!accepted && streamRef.current) {
            scanningRef.current = true;
            scanFrameRef.current = window.requestAnimationFrame((time) => { void scan(time); });
          }
          return;
        }
        if (scanningRef.current) scanFrameRef.current = window.requestAnimationFrame((time) => { void scan(time); });
      };
      scanFrameRef.current = window.requestAnimationFrame((time) => { void scan(time); });
    } catch { setError("Camera access was not available. Allow camera permission or use the session code."); stopCamera(); }
  }

  async function markWithCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const credential = String(new FormData(form).get("credential") ?? "");
    if (await submitCredential(credential)) form.reset();
  }

  if (role === "student") return <section className="page-stack live-attendance-student"><div className="section-title-row"><div><span className="eyebrow">SECURE QR CHECK-IN</span><h2>Mark attendance</h2><p>Scan the live faculty QR. Your login and class enrolment are verified before attendance is saved.</p></div><span className={markResult ? "status-pill success" : "status-pill waiting"}>{markResult ? "✓ Recorded" : "● Ready to scan"}</span></div>
    {error ? <div className="module-error">! {error}</div> : null}
    <div className="scanner-layout"><div className="scanner-card panel live-camera-card"><div className={cameraActive ? "live-video-frame active" : "live-video-frame"}><video ref={videoRef} playsInline muted /><span>{cameraActive ? "Scanning for EduAssist QR…" : "⌗"}</span><i /></div>{markResult ? <div className="scan-success"><span>✓</span><h3>Attendance recorded</h3><p>{markResult.subjectCode} · {markResult.className}</p><small>{markResult.alreadyMarked ? "This session was already marked." : `Saved ${dateLabel(markResult.markedAt)}`}</small></div> : <><h3>{cameraActive ? "Hold the QR inside the frame" : "Use your rear camera"}</h3><p>The faculty QR and fallback code rotate automatically and can be used only once per student.</p><button className="button primary full" onClick={cameraActive ? stopCamera : () => void startCamera()} disabled={busy}>{cameraActive ? "Stop camera" : "Start QR camera"}</button></>}</div>
      <div className="panel manual-attendance-card"><span className="eyebrow">CAMERA FALLBACK</span><h3>Enter session code</h3><p>Use the 10-character code shown below the faculty QR if your browser cannot scan it.</p><form onSubmit={markWithCode}><input name="credential" required minLength={10} maxLength={10} placeholder="ABC23DEF45" aria-label="Attendance session code" /><button className="button primary" disabled={busy}>{busy ? "Checking…" : "Mark present"}</button></form><div className="attendance-security-list"><span>✓ Logged-in student verification</span><span>✓ Active class enrolment required</span><span>✓ Duplicate submissions blocked</span><span>✓ Expired sessions rejected</span></div></div></div>
  </section>;

  if (!selected) return <section className="page-stack"><div className="section-title-row"><div><span className="eyebrow">QR ATTENDANCE</span><h2>Attendance sessions</h2></div></div><EmptyModule icon="◷" title="Create a class first" detail="Attendance sessions require an active class with at least one enrolled student." /></section>;

  return <section className="page-stack live-attendance-faculty"><div className="section-title-row"><div><span className="eyebrow">SECURE ATTENDANCE</span><h2>QR attendance session</h2><p>Show an automatically rotating QR and monitor check-ins live.</p></div><select className="module-class-select" value={selected.id} onChange={(event) => { setSelectedClassId(Number(event.target.value)); setAttendanceSession(null); setRoster([]); }} aria-label="Choose class">{classes.map((item) => <option key={item.id} value={item.id}>{item.subjectCode} · Section {item.section}</option>)}</select></div>
    {error ? <div className="module-error">! {error}</div> : null}
    {!attendanceSession ? <form className="start-attendance-panel" onSubmit={start}><div><span className="eyebrow">{selected.subjectCode} · {selected.semester}</span><h3>{selected.subjectName}</h3><p>{selected.studentCount} enrolled students · Uses the administrator&apos;s QR rotation setting</p></div><label>Session duration<select name="durationMinutes" defaultValue="4"><option value="2">2 minutes</option><option value="3">3 minutes</option><option value="4">4 minutes</option><option value="5">5 minutes</option></select></label><button className="button primary" disabled={busy}>◫ {busy ? "Starting…" : "Generate secure QR"}</button></form> : <div className="attendance-layout"><div className="panel qr-panel live-qr-panel"><div className="qr-header"><div><span className={attendanceSession.status === "active" ? "status-pill success" : "status-pill waiting"}>{attendanceSession.status === "active" ? "● Session active" : "○ Session closed"}</span><h3>{attendanceSession.subjectName}</h3><p>{attendanceSession.subjectCode} · Section {attendanceSession.section}</p></div><div className="timer"><span>{attendanceSession.status === "active" ? "EXPIRES IN" : "SESSION"}</span><b>{attendanceSession.status === "active" ? `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}` : "CLOSED"}</b></div></div>{qrDataUrl ? <Image unoptimized width={360} height={360} className={attendanceSession.status === "active" ? "generated-qr" : "generated-qr disabled"} src={qrDataUrl} alt={`Attendance QR for ${attendanceSession.subjectCode}`} /> : <div className="qr-generating">Generating secure QR…</div>}<div className="qr-rotation-status"><span>LIVE ROTATION · {attendanceSession.rotationSeconds}s interval</span><b>{attendanceSession.status === "active" ? `New QR in ${rotationSeconds}s` : "Stopped"}</b></div><div className="session-code live"><span>MANUAL CODE</span><b>{attendanceSession.manualCode}</b><button onClick={() => { void navigator.clipboard?.writeText(attendanceSession.manualCode); onNotify("Attendance code copied."); }}>Copy</button></div><p className="secure-note">⌾ QR and code rotate together. Login, enrolment, expiry, and duplicate checks are enforced on the server.</p>{attendanceSession.status === "active" ? <button className="button danger full" onClick={() => void close()} disabled={busy}>Close & save attendance</button> : <button className="button primary full" onClick={() => { setAttendanceSession(null); setRoster([]); }}>Start another session</button>}</div>
      <div className="panel live-attendance-panel"><div className="live-roster-header"><div><span className="eyebrow">LIVE ROSTER</span><h3>Student check-ins</h3></div><button onClick={() => void loadSession(attendanceSession.id)}>Refresh</button></div><div className="roster-summary"><div><b>{markedCount}<span>/ {roster.length}</span></b><p>Students attended</p></div><span className="trend-pill">{roster.length ? `${Math.round((markedCount / roster.length) * 100)}%` : "No students"}</span></div><div className="roster-progress"><i style={{ width: roster.length ? `${(markedCount / roster.length) * 100}%` : "0%" }} /></div><div className="student-checkins live">{roster.map((student, index) => <div key={student.userId}><span className={`student-avatar a${index % 5}`}>{personInitials(student.displayName)}</span><div><b>{student.displayName}</b><p>{student.userId}{student.markedAt ? ` · ${dateLabel(student.markedAt)}` : ""}</p></div><select value={student.status} onChange={(event) => void correct(student.userId, event.target.value)} aria-label={`Attendance status for ${student.displayName}`}><option value="pending" disabled>Pending</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select><span className={`attendance-state ${student.status}`}>{student.status === "present" ? "✓" : student.status === "late" ? "◷" : student.status === "absent" ? "×" : "—"}</span></div>)}</div></div></div>}
  </section>;
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<string | number | null>>) {
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

export function LiveReportsView({ role, classes, deviceId }: { role: Role; classes: LiveClass[]; deviceId: string }) {
  const [selectedClassId, setSelectedClassId] = useState(0);
  const [report, setReport] = useState<FacultyReport | StudentReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const effectiveClassId = selectedClassId || classes[0]?.id || 0;

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const suffix = role === "faculty" && effectiveClassId ? `?classId=${effectiveClassId}` : "";
        const response = await fetch(`/api/classroom/reports${suffix}`, { cache: "no-store", headers: requestHeaders(deviceId) });
        const result = await resultJson<FacultyReport | StudentReport>(response);
        if (active) { setReport(result); setError(""); }
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Reports could not be loaded."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [deviceId, effectiveClassId, role]);

  if (loading) return <section className="page-stack"><div className="report-loading"><span className="auth-loader"><i /><i /><i /></span><p>Calculating attendance reports…</p></div></section>;
  if (error) return <section className="page-stack"><div className="module-error">! {error}</div></section>;

  if (role === "student") {
    const data = report as StudentReport;
    const overallSessions = data?.reports.reduce((sum, item) => sum + item.totalSessions, 0) ?? 0;
    const overallAttended = data?.reports.reduce((sum, item) => sum + item.attendedSessions, 0) ?? 0;
    const overallRate = overallSessions ? Math.round((overallAttended / overallSessions) * 100) : null;
    return <section className="page-stack live-report-page"><div className="section-title-row"><div><span className="eyebrow">VERIFIED ATTENDANCE</span><h2>My attendance report</h2><p>Every value below comes from completed QR attendance sessions.</p></div><button className="button outline" onClick={() => downloadCsv("my-attendance-report.csv", [["Subject", "Sessions", "Attended", "Attendance %"], ...data.reports.map((item) => [item.subjectCode, item.totalSessions, item.attendedSessions, item.attendanceRate])])}>Download CSV ↓</button></div><div className="report-summary-grid"><article><span>✓</span><p><b>{overallRate === null ? "—" : `${overallRate}%`}</b><small>Overall attendance</small></p></article><article><span>▣</span><p><b>{data.reports.length}</b><small>Enrolled classes</small></p></article><article><span>◷</span><p><b>{overallAttended}/{overallSessions}</b><small>Sessions attended</small></p></article></div>{data.reports.map((item) => <article className="panel student-report-card" key={item.classId}><div className="student-report-heading"><div><span>{item.subjectCode}</span><h3>{item.subjectName}</h3><p>{item.semester} · Section {item.section} · {item.facultyName}</p></div><div className={`report-rate ${item.attendanceRate !== null && item.attendanceRate < 75 ? "warning" : ""}`}><b>{item.attendanceRate === null ? "—" : `${item.attendanceRate}%`}</b><span>{item.attendanceRate === null ? "No sessions" : item.attendanceRate >= 75 ? "On track" : "Below 75%"}</span></div></div><div className="student-history-list">{item.history.slice(0, 8).map((entry) => <div key={entry.id}><span>{dateLabel(entry.startsAt)}</span><b className={entry.status}>{entry.status}</b><small>{entry.markedAt ? `Marked ${dateLabel(entry.markedAt)}` : "No check-in recorded"}</small></div>)}{!item.history.length ? <p>No completed attendance sessions yet.</p> : null}</div></article>)}{!data.reports.length ? <EmptyModule icon="↗" title="No report data yet" detail="Join a class and complete an attendance session to build your report." /> : null}</section>;
  }

  const data = report as FacultyReport;
  return <section className="page-stack live-report-page"><div className="section-title-row"><div><span className="eyebrow">CLASS REPORTING</span><h2>Attendance reports</h2><p>Review session trends, student percentages, and downloadable records.</p></div><div className="report-actions"><select className="module-class-select" value={data.selectedClass?.id ?? effectiveClassId} onChange={(event) => setSelectedClassId(Number(event.target.value))} aria-label="Choose report class">{classes.map((item) => <option key={item.id} value={item.id}>{item.subjectCode} · {item.section}</option>)}</select><button className="button outline" disabled={!data.selectedClass} onClick={() => data.selectedClass && downloadCsv(`${data.selectedClass.subjectCode}-attendance.csv`, [["Student", "User ID", "Present", "Late", "Absent", "Sessions", "Attendance %"], ...data.students.map((item) => [item.displayName, item.userId, item.present, item.late, item.absent, item.totalSessions, item.attendanceRate])])}>Export CSV ↓</button></div></div>
    {!data.selectedClass ? <EmptyModule icon="↗" title="No classes to report" detail="Create a class, enrol students, and complete a QR attendance session." /> : <><div className="report-summary-grid faculty"><article><span>✓</span><p><b>{data.summary.averageAttendance === null ? "—" : `${data.summary.averageAttendance}%`}</b><small>Class average</small></p></article><article><span>♙</span><p><b>{data.summary.totalStudents}</b><small>Enrolled students</small></p></article><article><span>◷</span><p><b>{data.summary.totalSessions}</b><small>Completed sessions</small></p></article><article><span>▣</span><p><b>{data.selectedClass.subjectCode}</b><small>Section {data.selectedClass.section}</small></p></article></div><div className="report-dashboard-grid"><article className="panel report-trend-card"><div className="live-roster-title"><div><span className="eyebrow">RECENT SESSIONS</span><h3>Attendance trend</h3></div></div><div className="real-bar-chart">{data.sessions.slice(0, 8).reverse().map((item) => <div key={item.id}><span>{item.attendanceRate ?? 0}%</span><i><b style={{ height: `${item.attendanceRate ?? 0}%` }} /></i><small>{dateLabel(item.startsAt, false).replace(/\s\d{4}/, "")}</small></div>)}{!data.sessions.length ? <p>No completed sessions yet.</p> : null}</div></article><article className="panel session-breakdown"><div className="live-roster-title"><div><span className="eyebrow">LAST 8 SESSIONS</span><h3>Session breakdown</h3></div></div>{data.sessions.slice(0, 8).map((item) => <div key={item.id}><span>{dateLabel(item.startsAt)}</span><p><b className="present">{item.present} present</b><b className="late">{item.late} late</b><b className="absent">{item.absent} absent</b></p><i>{item.attendanceRate ?? 0}%</i></div>)}{!data.sessions.length ? <p className="admin-empty">Completed sessions will appear here.</p> : null}</article></div><div className="panel data-panel report-student-table"><div className="live-roster-title"><div><span className="eyebrow">STUDENT-WISE REPORT</span><h3>{data.selectedClass.subjectName}</h3></div><span>{data.students.length} students</span></div><div className="report-student-row head"><span>Student</span><span>Present</span><span>Late</span><span>Absent</span><span>Sessions</span><span>Attendance</span><span>Standing</span></div>{data.students.map((student, index) => <div className="report-student-row" key={student.userId}><span className="student-cell"><i className={`student-avatar a${index % 5}`}>{personInitials(student.displayName)}</i><p><b>{student.displayName}</b><small>{student.userId}</small></p></span><span>{student.present}</span><span>{student.late}</span><span>{student.absent}</span><span>{student.attended}/{student.totalSessions}</span><span><b>{student.attendanceRate === null ? "—" : `${student.attendanceRate}%`}</b></span><span><i className={`status-dot ${student.attendanceRate === null || student.attendanceRate >= 75 ? "good" : "watch"}`} />{student.attendanceRate === null ? "No data" : student.attendanceRate >= 75 ? "On track" : "Attention"}</span></div>)}{!data.students.length ? <EmptyModule icon="♙" title="No student report rows" detail="Enrol students before completing attendance sessions." /> : null}</div></>}
  </section>;
}
