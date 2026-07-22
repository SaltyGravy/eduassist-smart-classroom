"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { LiveAttendanceView, LiveClassesView, LiveReportsView, LiveRosterView, type LiveClass } from "./ClassroomModules";

type Role = "faculty" | "student";
type AuthUser = {
  userId: string;
  displayName: string;
  role: "admin" | Role;
  deviceLabel: string;
  deviceRegisteredAt: string;
  deviceBound: boolean;
  deviceChangesUsed: number;
  deviceChangesRemaining: number;
  deviceChangeWindowEnds: string | null;
  mustChangePassword: boolean;
};

type LoginResult = {
  user: AuthUser;
  registeredNow: boolean;
};
type View =
  | "overview"
  | "classes"
  | "attendance"
  | "materials"
  | "quizzes"
  | "students"
  | "analytics";

const facultyNav: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "classes", label: "My Classes", icon: "▣" },
  { id: "attendance", label: "Attendance", icon: "◷" },
  { id: "materials", label: "Notes · Later", icon: "▤" },
  { id: "quizzes", label: "Quizzes · Later", icon: "◇" },
  { id: "students", label: "Students", icon: "♙" },
  { id: "analytics", label: "Reports", icon: "↗" },
];

const studentNav: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "My Overview", icon: "⌂" },
  { id: "classes", label: "My Classes", icon: "▣" },
  { id: "attendance", label: "Attendance", icon: "◷" },
  { id: "materials", label: "Notes · Later", icon: "▤" },
  { id: "quizzes", label: "Quizzes · Later", icon: "◇" },
  { id: "analytics", label: "My Reports", icon: "↗" },
];

const quizQuestions = [
  {
    question: "Which search strategy uses a heuristic to estimate the cost to a goal?",
    options: ["Breadth-first search", "A* search", "Depth-first search", "Uniform-cost search"],
    answer: 1,
  },
  {
    question: "What does an intelligent agent use to perceive its environment?",
    options: ["Actuators", "Sensors", "Utilities", "Goals"],
    answer: 1,
  },
  {
    question: "A rational agent selects actions that maximize which measure?",
    options: ["Memory", "Performance", "Search depth", "Training time"],
    answer: 1,
  },
];

const activity = [
  { icon: "✓", tone: "mint", title: "Database-backed attendance", detail: "Expiry and duplicate protection enabled", time: "Ready" },
  { icon: "▣", tone: "blue", title: "Class enrolment active", detail: "Faculty and student class codes", time: "Ready" },
  { icon: "↗", tone: "yellow", title: "Verified reporting", detail: "Student history and CSV exports", time: "Ready" },
];


function getOrCreateDeviceId() {
  const storageKey = "eduassist-device-registration";
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function describeCurrentDevice() {
  const userAgent = navigator.userAgent;
  const browser = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("Chrome/")
      ? "Chrome"
      : userAgent.includes("Firefox/")
        ? "Firefox"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Web browser";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform
    ?? navigator.platform
    ?? "this device";
  return `${browser} on ${platform}`;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatRegisteredDate(value: string) {
  const parsed = new Date(value.endsWith("Z") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed.getTime())) return "recently";
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function AuthLoading() {
  return (
    <main className="auth-loading-screen">
      <span className="brand-mark auth-brand-mark"><i /><i /><i /></span>
      <h1>Edu<span>Assist</span></h1>
      <div className="auth-loader"><i /><i /><i /></div>
      <p>Securing your workspace…</p>
    </main>
  );
}

function LoginScreen({
  deviceId,
  notice,
  onAuthenticated,
}: {
  deviceId: string;
  notice: string;
  onAuthenticated: (result: LoginResult) => void;
}) {
  const [role, setRole] = useState<Role>("faculty");
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const deviceLabel = useMemo(() => describeCurrentDevice(), []);

  function chooseRole(nextRole: Role) {
    setRole(nextRole);
    setUserId("");
    setPassword("");
    setError("");
    setDeviceBlocked(false);
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setDeviceBlocked(false);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, userId, password, deviceId, deviceLabel }),
      });
      const result = (await response.json()) as LoginResult & { code?: string; message?: string };
      if (!response.ok) {
        setDeviceBlocked(result.code === "DEVICE_MISMATCH");
        setError(result.message ?? "Login failed. Please try again.");
        return;
      }
      onAuthenticated(result);
    } catch {
      setError("EduAssist could not reach the secure login service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="login-brand"><span className="brand-mark"><i /><i /><i /></span><b>Edu<span>Assist</span></b></div>
        <div className="login-story-copy">
          <span className="eyebrow light">PERSONAL COLLEGE PROJECT</span>
          <h1>One classroom.<br />Secure student access.</h1>
          <p>Run faculty and student workspaces with rotating QR attendance and controlled student-device changes.</p>
          <div className="security-points">
            <div><span>01</span><p><b>Faculty flexibility</b>Faculty can sign in without permanent device registration.</p></div>
            <div><span>02</span><p><b>Student registration</b>A student&apos;s first successful login binds the account to that browser installation.</p></div>
            <div><span>03</span><p><b>Controlled change</b>Students can change devices twice in a rolling six-month window.</p></div>
          </div>
        </div>
        <p className="login-story-foot">Protected sessions · Password hashing · Rotating attendance QR</p>
      </section>

      <section className="login-panel-wrap">
        <div className="login-panel">
          <div className="login-heading"><span className="eyebrow">SECURE ACCESS</span><h2>Welcome back</h2><p>Select your role and sign in with your project account.</p></div>

          {notice ? <div className="auth-message success"><span>✓</span><p>{notice}</p></div> : null}
          {error ? <div className={deviceBlocked ? "auth-message blocked" : "auth-message error"}><span>{deviceBlocked ? "⌁" : "!"}</span><div><b>{deviceBlocked ? "Registered on another device" : "Unable to sign in"}</b><p>{error}</p></div></div> : null}

          <form onSubmit={submitLogin} className="login-form">
            <fieldset className="login-role-picker">
              <legend>Choose workspace</legend>
              <div>
                <button type="button" className={role === "faculty" ? "active" : ""} onClick={() => chooseRole("faculty")}><span>♙</span><b>Faculty</b><small>Manage classes</small></button>
                <button type="button" className={role === "student" ? "active" : ""} onClick={() => chooseRole("student")}><span>▤</span><b>Student</b><small>Learn & respond</small></button>
              </div>
            </fieldset>

            <label className="auth-field"><span>User ID</span><div><i>⌁</i><input value={userId} onChange={(event) => setUserId(event.target.value.toUpperCase())} autoComplete="username" required placeholder={role === "faculty" ? "FAC001" : "STU001"} /></div></label>
            <label className="auth-field"><span>Password</span><div><i>•</i><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? "Hide" : "Show"}</button></div></label>

            {role === "student" ? <div className="device-registration-preview"><span className="device-preview-icon">▣</span><div><b>This student device will be verified</b><p>{deviceLabel}</p><small>Students may change device twice in six months. No IMEI or personal files are accessed.</small></div><i className="device-ready">READY</i></div> : <div className="device-registration-preview faculty"><span className="device-preview-icon">✓</span><div><b>No permanent device registration</b><p>{deviceLabel}</p><small>This browser is used only to protect the current faculty session.</small></div><i className="device-ready">SESSION</i></div>}

            <button className="button primary auth-submit" type="submit" disabled={submitting || !deviceId}>{submitting ? "Signing in…" : "Login securely"}<span>→</span></button>
          </form>

          <div className="account-issued-note"><span>⌾</span><p><b>Accounts are issued by your administrator.</b><br />Use the user ID and temporary password shared with you. You will create a private password on first login.</p></div>

          <p className="auth-disclaimer">Student binding uses a privacy-safe browser installation ID. Web browsers do not expose hardware IMEI values.</p>
        </div>
      </section>
    </main>
  );
}

function PasswordChangeScreen({
  user,
  deviceId,
  onChanged,
  onSignOut,
}: {
  user: AuthUser;
  deviceId: string;
  onChanged: (user: AuthUser) => void;
  onSignOut: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const checks = [
    { label: "At least 8 characters", passed: password.length >= 8 },
    { label: "Uppercase and lowercase letters", passed: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: "A number and a symbol", passed: /\d/.test(password) && /[^A-Za-z0-9]/.test(password) },
  ];

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json", "x-eduassist-device-id": deviceId },
        body: JSON.stringify({ newPassword: password }),
      });
      const result = (await response.json()) as { user?: AuthUser; message?: string };
      if (!response.ok || !result.user) {
        setError(result.message ?? "Your password could not be changed.");
        return;
      }
      onChanged(result.user);
    } catch {
      setError("EduAssist could not reach the secure login service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="password-setup-shell">
      <section className="password-setup-card">
        <div className="password-setup-brand"><span className="brand-mark"><i /><i /><i /></span><b>Edu<span>Assist</span></b></div>
        <div className="setup-progress"><i className="done" /><span /><i className="active" /><span /><i /></div>
        <span className="eyebrow">FIRST LOGIN · STEP 2 OF 3</span>
        <h1>Create your private password</h1>
        <p className="setup-lead">Welcome, {user.displayName}. Replace the temporary password before opening your {user.role} workspace.</p>
        <div className="setup-device-card"><span>✓</span><div><b>{user.role === "student" ? "Student device registered successfully" : "Secure session verified"}</b><p>{user.role === "student" ? user.deviceLabel : "No permanent device registration is used for this account."}</p></div></div>
        {error ? <div className="auth-message error"><span>!</span><div><b>Password not changed</b><p>{error}</p></div></div> : null}
        <form className="password-setup-form" onSubmit={changePassword}>
          <label className="auth-field"><span>New password</span><div><i>•</i><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required autoFocus /><button type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? "Hide" : "Show"}</button></div></label>
          <label className="auth-field"><span>Confirm password</span><div><i>✓</i><input type={showPassword ? "text" : "password"} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required /></div></label>
          <div className="password-checks">{checks.map((check) => <span className={check.passed ? "passed" : ""} key={check.label}><i>{check.passed ? "✓" : "○"}</i>{check.label}</span>)}</div>
          <button className="button primary auth-submit" type="submit" disabled={submitting || !checks.every((check) => check.passed) || password !== confirmation}>{submitting ? "Securing account…" : "Save password & continue"}<span>→</span></button>
        </form>
        <button className="setup-signout" onClick={() => void onSignOut()}>Sign out and finish later</button>
      </section>
    </main>
  );
}

export function ClassroomApp() {
  const [authState, setAuthState] = useState<
    | { status: "loading" }
    | { status: "guest" }
    | { status: "authenticated"; user: AuthUser }
  >({ status: "loading" });
  const [deviceId, setDeviceId] = useState("");
  const [authNotice, setAuthNotice] = useState("");

  useEffect(() => {
    async function initializeSession() {
      const currentDeviceId = getOrCreateDeviceId();
      setDeviceId(currentDeviceId);
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          headers: { "x-eduassist-device-id": currentDeviceId },
        });
        if (!response.ok) throw new Error("No active session");
        const { user } = (await response.json()) as { user: AuthUser };
        if (user.role === "admin") {
          window.location.replace("/admin");
          return;
        }
        setAuthState({ status: "authenticated", user });
      } catch {
        setAuthState({ status: "guest" });
      }
    }
    void initializeSession();
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "x-eduassist-device-id": deviceId },
    }).catch(() => null);
    setAuthNotice("You have signed out securely.");
    setAuthState({ status: "guest" });
  }

  async function releaseDevice() {
    const response = await fetch("/api/auth/release-device", {
      method: "POST",
      headers: { "x-eduassist-device-id": deviceId },
    });
    const result = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) throw new Error(result.message ?? "The registered device could not be released.");
    setAuthNotice("Device released. The next successful login will register a new browser.");
    setAuthState({ status: "guest" });
  }

  if (authState.status === "loading") return <AuthLoading />;
  if (authState.status === "guest") {
    return (
      <LoginScreen
        deviceId={deviceId}
        notice={authNotice}
        onAuthenticated={(result) => {
          setAuthNotice("");
          setAuthState({ status: "authenticated", user: result.user });
        }}
      />
    );
  }

  if (authState.user.mustChangePassword) {
    return <PasswordChangeScreen user={authState.user} deviceId={deviceId} onChanged={(user) => setAuthState({ status: "authenticated", user })} onSignOut={signOut} />;
  }

  if (authState.user.role === "admin") return <AuthLoading />;

  return (
    <AuthenticatedClassroom
      user={authState.user as AuthUser & { role: Role }}
      deviceId={deviceId}
      onSignOut={signOut}
      onReleaseDevice={releaseDevice}
    />
  );
}

function AuthenticatedClassroom({
  user,
  deviceId,
  onSignOut,
  onReleaseDevice,
}: {
  user: AuthUser & { role: Role };
  deviceId: string;
  onSignOut: () => Promise<void>;
  onReleaseDevice: () => Promise<void>;
}) {
  const role = user.role;
  const [view, setView] = useState<View>("overview");
  const [classes, setClasses] = useState<LiveClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState("");
  const [uploadedFile, setUploadedFile] = useState("");
  const [summaryReady, setSummaryReady] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [quizPublished, setQuizPublished] = useState(true);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizResult, setQuizResult] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showProfile, setShowProfile] = useState(false);

  const nav = role === "faculty" ? facultyNav : studentNav;
  const mobileNav = nav.filter((item) => ["overview", "classes", "attendance", "students", "analytics"].includes(item.id));

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function refreshClasses() {
    try {
      const response = await fetch("/api/classroom/classes", { cache: "no-store", headers: { "x-eduassist-device-id": deviceId } });
      if (!response.ok) throw new Error("Classes could not be loaded.");
      const result = (await response.json()) as { classes: LiveClass[] };
      setClasses(result.classes);
    } catch {
      setToast("Classes could not be loaded. Please refresh and try again.");
    } finally {
      setClassesLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshClasses(); }, 0);
    return () => window.clearTimeout(timer);
  }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredClasses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return classes;
    return classes.filter((item) => `${item.subjectCode} ${item.subjectName} ${item.semester} ${item.section} ${item.classCode}`.toLowerCase().includes(query));
  }, [classes, search]);

  function navigate(nextView: View) {
    setView(nextView);
    setSearch("");
  }

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subjectName = String(data.get("subject") || "");
    const subjectCode = String(data.get("code") || "").toUpperCase();
    const semester = String(data.get("semester") || "");
    const section = String(data.get("section") || "").toUpperCase();
    try {
      const response = await fetch("/api/classroom/classes", { method: "POST", headers: { "content-type": "application/json", "x-eduassist-device-id": deviceId }, body: JSON.stringify({ subjectName, subjectCode, semester, section }) });
      const result = (await response.json()) as { classroom?: LiveClass; message?: string };
      if (!response.ok || !result.classroom) throw new Error(result.message ?? "The class could not be created.");
      setClasses((current) => [result.classroom as LiveClass, ...current]);
      setShowCreate(false);
      setView("classes");
      setToast(`${subjectName} created. Join code: ${result.classroom.classCode}`);
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "The class could not be created.");
    }
  }

  async function releaseStudentDevice() {
    try {
      await onReleaseDevice();
    } catch (reason) {
      setToast(reason instanceof Error ? reason.message : "The registered device could not be released.");
    }
  }

  function generateSummary() {
    setSummaryLoading(true);
    setSummaryReady(false);
    window.setTimeout(() => {
      setSummaryLoading(false);
      setSummaryReady(true);
      setToast("AI summary generated from the uploaded notes.");
    }, 900);
  }

  function submitQuiz() {
    const correct = quizQuestions.reduce(
      (score, question, index) => score + (answers[index] === question.answer ? 1 : 0),
      0,
    );
    setQuizResult(correct);
    setToast(`Quiz submitted — ${correct}/${quizQuestions.length} correct.`);
  }

  const pageTitle = nav.find((item) => item.id === view)?.label || "Overview";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("overview")} aria-label="EduAssist home">
          <span className="brand-mark"><i /><i /><i /></span>
          <span>Edu<span>Assist</span></span>
        </button>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {nav.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === "quizzes" && role === "student" ? <b className="nav-badge">2</b> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="side-link" onClick={() => setToast("Settings are ready for your institution details.")}>
            <span>⚙</span> Settings
          </button>
          <button className="side-link" onClick={() => setToast("Help centre opened for this demo.")}>
            <span>?</span> Help & Support
          </button>
          <div className="storage-card">
            <div className="storage-top"><span>File storage</span><b>Next phase</b></div>
            <div className="storage-bar"><i style={{ width: "0%" }} /></div>
            <button onClick={() => navigate("materials")}>View preview →</button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark small"><i /><i /><i /></span>
            EduAssist
          </div>
          <div className="page-heading">
            <span>{role === "faculty" ? "Faculty workspace" : "Student workspace"}</span>
            <h1>{pageTitle}</h1>
          </div>
          <label className="search-box">
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search classes, notes, quizzes..."
              aria-label="Search workspace"
            />
            <kbd>⌘ K</kbd>
          </label>
          <span className="device-status"><i /> {role === "student" ? "Student device registered" : "Secure faculty session"}</span>
          <button className="icon-button" onClick={() => setShowNotifications((current) => !current)} aria-label="Notifications">
            ♢<span />
          </button>
          <button className="profile-button" onClick={() => setShowProfile((current) => !current)} aria-label="Open account menu" aria-expanded={showProfile}>
            <span className="avatar">{initials(user.displayName)}</span>
            <span className="profile-copy"><b>{user.displayName}</b><small>{role === "faculty" ? "Faculty" : user.userId}</small></span>
            <span className="chevron">⌄</span>
          </button>
          {showNotifications ? (
            <div className="notification-popover">
              <div><b>Notifications</b><span>Live</span></div>
              <p><i className="dot mint" /> Class enrolments are stored securely.</p>
              <p><i className="dot yellow" /> QR sessions expire automatically.</p>
              <p><i className="dot blue" /> Reports update after each session.</p>
            </div>
          ) : null}
          {showProfile ? (
            <div className="account-popover">
              <div className="account-heading">
                <span className="avatar">{initials(user.displayName)}</span>
                <div><b>{user.displayName}</b><p>{user.userId} · {role === "faculty" ? "Faculty" : "Student"}</p></div>
              </div>
              {role === "student" ? <><div className="registered-device-card"><span>✓</span><div><b>Registered student device</b><p>{user.deviceLabel}</p><small>Bound {formatRegisteredDate(user.deviceRegisteredAt)}</small></div></div><p className="device-help">{user.deviceChangesRemaining} of 2 device changes remain in the current six-month window{user.deviceChangeWindowEnds ? ` · resets ${formatRegisteredDate(user.deviceChangeWindowEnds)}` : ""}.</p><button className="account-action" onClick={() => void releaseStudentDevice()} disabled={user.deviceChangesRemaining === 0}><span>⇄</span> Release this device</button></> : <div className="registered-device-card"><span>✓</span><div><b>No permanent device binding</b><p>Faculty accounts can sign in from another device.</p><small>Only the current secure session is retained.</small></div></div>}
              <button className="account-action signout" onClick={() => void onSignOut()}><span>↪</span> Sign out</button>
            </div>
          ) : null}
        </header>

        <div className="content-area">
          {view === "overview" ? (
            role === "faculty" ? (
              <FacultyOverview userName={user.displayName} classes={classes} onNavigate={navigate} onStartAttendance={() => navigate("attendance")} onCreate={() => setShowCreate(true)} />
            ) : (
              <StudentOverview userName={user.displayName} classes={classes} onNavigate={navigate} />
            )
          ) : null}
          {view === "classes" ? (
            classesLoading ? <div className="report-loading"><span className="auth-loader"><i /><i /><i /></span><p>Loading classes…</p></div> : <LiveClassesView role={role} classes={filteredClasses} deviceId={deviceId} onCreate={() => setShowCreate(true)} onRefresh={refreshClasses} onNotify={setToast} />
          ) : null}
          {view === "attendance" ? (
            <LiveAttendanceView role={role} classes={classes} deviceId={deviceId} onNotify={setToast} />
          ) : null}
          {view === "materials" ? (
            <MaterialsView
              role={role}
              fileName={uploadedFile}
              summaryReady={summaryReady}
              loading={summaryLoading}
              onFile={(name) => {
                setUploadedFile(name);
                setSummaryReady(false);
                setToast(`${name} is ready to summarize.`);
              }}
              onGenerate={generateSummary}
            />
          ) : null}
          {view === "quizzes" ? (
            <QuizzesView
              role={role}
              published={quizPublished}
              answers={answers}
              result={quizResult}
              onAnswer={(question, answer) => setAnswers((current) => ({ ...current, [question]: answer }))}
              onSubmit={submitQuiz}
              onGenerate={() => {
                setQuizPublished(false);
                setToast("3 grounded MCQs generated from your notes.");
              }}
              onPublish={() => {
                setQuizPublished(true);
                setToast("Quiz published to 42 students.");
              }}
            />
          ) : null}
          {view === "students" ? <LiveRosterView classes={classes} deviceId={deviceId} onRefreshClasses={refreshClasses} onNotify={setToast} /> : null}
          {view === "analytics" ? <LiveReportsView role={role} classes={classes} deviceId={deviceId} /> : null}
        </div>
      </main>

      <nav className={`mobile-nav ${role}`} aria-label="Mobile navigation">
        {mobileNav.map((item) => (
          <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
            <span>{item.icon}</span>{item.label.split(" ").at(-1)}
          </button>
        ))}
      </nav>

      {showCreate ? (
        <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}>
          <div className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="create-title">
            <div className="modal-header">
              <div><span className="eyebrow">NEW WORKSPACE</span><h2 id="create-title">Create a class</h2></div>
              <button onClick={() => setShowCreate(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={createClass}>
              <label>Subject name<input name="subject" required placeholder="e.g. Computer Networks" /></label>
              <div className="form-row">
                <label>Subject code<input name="code" required placeholder="CS402" /></label>
                <label>Section<input name="section" required placeholder="A" maxLength={2} /></label>
              </div>
              <label>Semester<select name="semester" defaultValue="Semester 5"><option>Semester 3</option><option>Semester 5</option><option>Semester 7</option></select></label>
              <div className="modal-note"><span>✦</span><p><b>A unique join code will be created.</b><br />Share it with students after the class is ready.</p></div>
              <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setShowCreate(false)}>Cancel</button><button className="button primary" type="submit">Create class</button></div>
            </form>
          </div>
        </div>
      ) : null}

      {toast ? <div className="toast" role="status"><span>✓</span>{toast}</div> : null}
    </div>
  );
}

function FacultyOverview({
  userName,
  classes,
  onNavigate,
  onStartAttendance,
  onCreate,
}: {
  userName: string;
  classes: LiveClass[];
  onNavigate: (view: View) => void;
  onStartAttendance: () => void;
  onCreate: () => void;
}) {
  const studentTotal = classes.reduce((sum, classroom) => sum + classroom.studentCount, 0);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }).toUpperCase();
  return (
    <>
      <section className="welcome-row">
        <div><span className="eyebrow">{today}</span><h2>Welcome, {userName} <span>✦</span></h2><p>Your classes, QR attendance, and reports now use live project data.</p></div>
        <button className="button primary" onClick={onCreate}><span>＋</span>Create class</button>
      </section>

      <section className="metrics-grid">
        <MetricCard icon="▣" tone="navy" value={String(classes.length)} label="Active classes" note={`${studentTotal} total enrolments`} />
        <MetricCard icon="✓" tone="mint" value="Live" label="QR attendance" note="2–5 minute secure sessions" positive />
        <MetricCard icon="↗" tone="blue" value="CSV" label="Attendance reports" note="Student and session breakdowns" />
        <MetricCard icon="✦" tone="yellow" value="Later" label="Notes and AI" note="Deferred to the next milestone" />
      </section>

      <section className="dashboard-grid">
        <div className="panel schedule-panel">
          <PanelHeader eyebrow="TODAY" title="Upcoming classes" action="View schedule" onAction={() => onNavigate("classes")} />
          <div className="class-schedule-list">{classes.slice(0, 3).map((classroom, index) => <ScheduleItem key={classroom.id} time={String(classroom.studentCount)} meridiem="STUDENTS" code={classroom.subjectCode} title={classroom.subjectName} meta={`${classroom.semester} · Section ${classroom.section} · Join ${classroom.classCode}`} color={["navy", "yellow", "mint"][index % 3]} active={index === 0} />)}{classes.length === 0 ? <div className="overview-empty"><b>No classes created yet</b><p>Create your first class to begin enrolment and QR attendance.</p></div> : null}</div>
        </div>

        <div className="panel attendance-chart-panel">
          <PanelHeader eyebrow="THIS WEEK" title="Attendance overview" action="View report" onAction={() => onNavigate("analytics")} />
          <div className="chart-top"><div><b>{classes.length ? "Ready" : "—"}</b><span>reporting status</span></div><span className="trend-pill">D1 verified</span></div>
          <div className="attendance-chart">
            {[0, 0, 0, 0, 0].map((height, index) => (
              <div className="bar-column" key={height + index}><div className="bar-track"><i style={{ height: `${height}%` }} className={index === 4 ? "current" : ""} /></div><span>{["Mon", "Tue", "Wed", "Thu", "Fri"][index]}</span></div>
            ))}
          </div>
        </div>

        <div className="panel quick-actions-panel">
          <PanelHeader eyebrow="SHORTCUTS" title="Quick actions" />
          <div className="quick-grid">
            <QuickAction icon="◫" tone="navy" title="Start attendance" detail="Create secure QR" onClick={onStartAttendance} />
            <QuickAction icon="↑" tone="blue" title="Preview notes" detail="Planned next milestone" onClick={() => onNavigate("materials")} />
            <QuickAction icon="✦" tone="yellow" title="Preview quizzes" detail="Planned next milestone" onClick={() => onNavigate("quizzes")} />
            <QuickAction icon="♙" tone="mint" title="Manage students" detail={`${studentTotal} enrolled`} onClick={() => onNavigate("students")} />
          </div>
        </div>

        <div className="panel activity-panel">
          <PanelHeader eyebrow="RECENT" title="Activity" action="See all" onAction={() => onNavigate("analytics")} />
          <div className="activity-list">
            {activity.map((item) => (
              <div className="activity-item" key={item.title}><span className={`activity-icon ${item.tone}`}>{item.icon}</span><div><b>{item.title}</b><p>{item.detail}</p></div><time>{item.time}</time></div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function StudentOverview({ userName, classes, onNavigate }: { userName: string; classes: LiveClass[]; onNavigate: (view: View) => void }) {
  return (
    <>
      <section className="student-hero">
        <div className="student-hero-copy">
          <span className="eyebrow light">YOUR LEARNING SPACE</span>
          <h2>Ready for class, {userName}?</h2>
          <p>Attendance opens when your faculty starts a secure QR session for an enrolled class.</p>
          <div className="hero-actions"><button className="button yellow" onClick={() => onNavigate("attendance")}>Scan attendance QR</button><button className="text-button light" onClick={() => onNavigate("classes")}>View enrolled classes →</button></div>
        </div>
        <div className="hero-orbit" aria-hidden="true"><span className="orbit one">AI</span><span className="orbit two">✓</span><span className="orbit three">A+</span><div>✦</div></div>
      </section>

      <section className="metrics-grid student-metrics">
        <MetricCard icon="▣" tone="navy" value={String(classes.length)} label="Enrolled classes" note="Joined using faculty codes" />
        <MetricCard icon="✓" tone="mint" value="Live" label="My attendance" note="Open the report for your percentage" positive />
        <MetricCard icon="↗" tone="blue" value="CSV" label="My reports" note="Download verified history" />
        <MetricCard icon="✦" tone="yellow" value="Later" label="Notes and quizzes" note="Planned next milestone" />
      </section>

      <section className="dashboard-grid student-grid">
        <div className="panel learning-panel">
          <PanelHeader eyebrow="NEXT MILESTONE" title="Notes and AI modules" action="Preview" onAction={() => onNavigate("materials")} />
          <div className="material-card-list">
            <button onClick={() => onNavigate("materials")}><span className="file-icon pdf">PDF</span><div><b>Notes upload</b><p>File storage and text extraction will be added later.</p></div><em>Later</em></button>
            <button onClick={() => onNavigate("quizzes")}><span className="file-icon doc">AI</span><div><b>AI quizzes</b><p>Grounded generation will follow the attendance milestone.</p></div><em>Later</em></button>
          </div>
        </div>
        <div className="panel deadline-panel">
          <PanelHeader eyebrow="AVAILABLE NOW" title="QR attendance" />
          <div className="deadline-body"><span className="quiz-big-icon">⌗</span><div><b>Secure class check-in</b><p>Camera scan with manual-code fallback</p><div className="deadline"><span>Session validity</span><b>2–5 min</b></div></div></div>
          <button className="button primary full" onClick={() => onNavigate("attendance")}>Open attendance</button>
        </div>
        <div className="panel progress-panel">
          <PanelHeader eyebrow="LIVE DATA" title="Attendance progress" action="View report" onAction={() => onNavigate("analytics")} />
          <div className="progress-score"><div className="score-ring"><span>✓</span></div><div><b>Your verified history</b><p>Completed sessions, attendance percentage, and status are available in My Reports.</p><span className="trend-pill">↗ Open report</span></div></div>
        </div>
      </section>
    </>
  );
}

function MetricCard({ icon, tone, value, label, note, positive = false }: { icon: string; tone: string; value: string; label: string; note: string; positive?: boolean }) {
  return <div className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div className="metric-value">{value}</div><div className="metric-label">{label}</div><div className={positive ? "metric-note positive" : "metric-note"}>{note}</div></div>;
}

function PanelHeader({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="panel-header"><div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div>{action ? <button onClick={onAction}>{action} →</button> : null}</div>;
}

function ScheduleItem({ time, meridiem, code, title, meta, color, active = false }: { time: string; meridiem: string; code: string; title: string; meta: string; color: string; active?: boolean }) {
  return <div className={active ? "schedule-item active" : "schedule-item"}><div className="schedule-time"><b>{time}</b><span>{meridiem}</span></div><span className={`schedule-line ${color}`} /><div className="schedule-copy"><span>{code}</span><b>{title}</b><p>{meta}</p></div>{active ? <span className="live-pill">IN 45 MIN</span> : <button aria-label={`Open ${title}`}>→</button>}</div>;
}

function QuickAction({ icon, tone, title, detail, onClick }: { icon: string; tone: string; title: string; detail: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span className={`quick-icon ${tone}`}>{icon}</span><div><b>{title}</b><p>{detail}</p></div><span className="quick-arrow">↗</span></button>;
}

function FutureModuleNotice() {
  return <div className="future-module-banner"><span>⌁</span><div><b>Next-phase interface preview</b><p>This screen is not connected to file storage or AI yet. Nothing selected here is uploaded or saved.</p></div></div>;
}

function MaterialsView({ role, fileName, summaryReady, loading, onFile, onGenerate }: { role: Role; fileName: string; summaryReady: boolean; loading: boolean; onFile: (name: string) => void; onGenerate: () => void }) {
  return (
    <section className="page-stack">
      <div className="section-title-row"><div><span className="eyebrow">AI-POWERED LEARNING</span><h2>{role === "faculty" ? "Study materials" : "Notes & summaries"}</h2><p>{role === "faculty" ? "Upload source notes, then turn them into clear revision material." : "Read concise, faculty-reviewed summaries for your subjects."}</p></div>{role === "faculty" ? <label className="button primary upload-button">↑ Upload notes<input type="file" accept=".pdf,.docx,.pptx,.txt" onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0].name)} /></label> : null}</div>
      <FutureModuleNotice />
      {role === "faculty" ? (
        <div className="materials-layout">
          <div className="panel upload-panel"><PanelHeader eyebrow="SOURCE DOCUMENT" title="Upload and process" /><label className="drop-zone"><input type="file" accept=".pdf,.docx,.pptx,.txt" onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0].name)} /><span className="upload-orbit">↑</span><h3>{fileName || "Drop your lecture notes here"}</h3><p>{fileName ? "Document accepted · Ready for AI processing" : "or click to browse · PDF, DOCX, PPTX or TXT up to 10 MB"}</p><small>Files are validated before processing</small></label><div className="summary-options"><label>Summary type<select defaultValue="Revision notes"><option>Short summary</option><option>Detailed summary</option><option>Key points</option><option>Revision notes</option></select></label><button className="button primary" disabled={loading} onClick={onGenerate}>{loading ? "Generating…" : "✦ Generate summary"}</button></div></div>
          <SummaryDocument ready={summaryReady} loading={loading} />
        </div>
      ) : (
        <div className="student-material-grid">
          <SummaryDocument ready loading={false} />
          <div className="panel material-library"><PanelHeader eyebrow="CS301" title="Available material" /><button className="library-item active"><span className="file-icon pdf">PDF</span><div><b>Intelligent Agents</b><p>Summary · 8 min read</p></div><span>→</span></button><button className="library-item"><span className="file-icon doc">DOC</span><div><b>Search Strategies</b><p>Key points · 6 min read</p></div><span>→</span></button><button className="library-item"><span className="file-icon ppt">PPT</span><div><b>Knowledge Representation</b><p>Revision notes · 11 min read</p></div><span>→</span></button></div>
        </div>
      )}
    </section>
  );
}

function SummaryDocument({ ready, loading }: { ready: boolean; loading: boolean }) {
  return (
    <div className="panel summary-document">
      <div className="document-toolbar"><div><span className="eyebrow">AI SUMMARY</span><h3>Intelligent Agents</h3></div><div><button aria-label="Copy summary">▣</button><button aria-label="Download summary">↓</button></div></div>
      {loading ? <div className="summary-loading"><span>✦</span><h3>Reading your notes…</h3><p>Identifying definitions, concepts and revision points.</p><div><i /><i /><i /></div></div> : ready ? <div className="summary-content"><div className="summary-intro"><span>01</span><div><h4>Overview</h4><p>An intelligent agent perceives its environment through sensors and acts upon it through actuators. A rational agent selects the action expected to maximise its performance measure.</p></div></div><h4>Key concepts</h4><ul><li><b>Agent function</b> maps a sequence of percepts to an action.</li><li><b>Rationality</b> depends on the performance measure, prior knowledge, actions and percept history.</li><li><b>PEAS</b> defines Performance, Environment, Actuators and Sensors.</li></ul><div className="definition-card"><span>IMPORTANT DEFINITION</span><p><b>Autonomous agent:</b> an agent whose behaviour is determined by its own experience.</p></div><h4>Quick revision</h4><div className="revision-tags"><span>Agent ↔ Environment</span><span>Sensors → Percepts</span><span>Actuators → Actions</span></div></div> : <div className="summary-empty"><span>✦</span><h3>Your summary will appear here</h3><p>Upload a source file and choose the summary style.</p></div>}
    </div>
  );
}

function QuizzesView({ role, published, answers, result, onAnswer, onSubmit, onGenerate, onPublish }: { role: Role; published: boolean; answers: Record<number, number>; result: number | null; onAnswer: (question: number, answer: number) => void; onSubmit: () => void; onGenerate: () => void; onPublish: () => void }) {
  if (role === "student") {
    return (
      <section className="page-stack quiz-page">
        <FutureModuleNotice />
        <div className="quiz-topline"><div><span className="eyebrow">CS301 · QUIZ 04</span><h2>Search Strategies</h2><p>3 questions · 1 mark each · Attempt all questions</p></div><div className="quiz-timer"><span>TIME LEFT</span><b>14:32</b></div></div>
        {result !== null ? <div className="result-banner"><span>✦</span><div><h3>Quiz complete — {result}/{quizQuestions.length}</h3><p>{result === quizQuestions.length ? "Perfect score. Excellent work!" : "Review the summary and try the concepts again."}</p></div><div className="score-bubble">{Math.round((result / quizQuestions.length) * 100)}%</div></div> : null}
        <div className="question-list">{quizQuestions.map((question, questionIndex) => <article className="panel question-card" key={question.question}><div className="question-number">{String(questionIndex + 1).padStart(2, "0")}</div><div className="question-content"><h3>{question.question}</h3><div className="option-grid">{question.options.map((option, optionIndex) => <button className={answers[questionIndex] === optionIndex ? "selected" : ""} onClick={() => onAnswer(questionIndex, optionIndex)} key={option}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{result !== null ? <p className="answer-explanation"><b>Answer: {question.options[question.answer]}.</b> This follows directly from the published class summary.</p> : null}</div></article>)}</div>
        <div className="quiz-submit-bar"><span>{Object.keys(answers).length} of {quizQuestions.length} answered</span><div className="answer-progress"><i style={{ width: `${(Object.keys(answers).length / quizQuestions.length) * 100}%` }} /></div><button className="button primary" disabled={Object.keys(answers).length < quizQuestions.length} onClick={onSubmit}>Submit quiz</button></div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <FutureModuleNotice />
      <div className="section-title-row"><div><span className="eyebrow">AI QUIZ STUDIO</span><h2>Create a grounded quiz</h2><p>Generate questions from your notes, review every answer, then publish.</p></div><span className={published ? "status-pill success" : "status-pill draft"}>{published ? "✓ Published" : "○ Draft review"}</span></div>
      <div className="quiz-builder-layout">
        <div className="panel quiz-settings"><PanelHeader eyebrow="QUIZ SETTINGS" title="Search Strategies" /><label>Source material<select><option>Search Strategies.pdf</option><option>Intelligent Agents.pdf</option></select></label><div className="form-row"><label>Questions<select defaultValue="3"><option>3</option><option>5</option><option>10</option></select></label><label>Difficulty<select><option>Medium</option><option>Easy</option><option>Hard</option></select></label></div><label>Question type<div className="segmented-field"><button className="active">Multiple choice</button><button>True / false</button></div></label><div className="form-row"><label>Duration<input value="15 minutes" readOnly /></label><label>Marks<input value="1 each" readOnly /></label></div><button className="button yellow full" onClick={onGenerate}>✦ Regenerate questions</button><div className="grounded-note"><span>⌾</span><p><b>Grounded generation</b><br />Questions use only uploaded notes and require faculty review.</p></div></div>
        <div className="question-editor"><div className="editor-heading"><div><span className="eyebrow">QUESTION REVIEW</span><h3>{quizQuestions.length} generated questions</h3></div><button className="button primary" onClick={onPublish}>{published ? "Republish changes" : "Publish quiz"}</button></div>{quizQuestions.map((question, index) => <article className="panel editor-card" key={question.question}><div className="editor-card-top"><span>QUESTION {String(index + 1).padStart(2, "0")}</span><div><button aria-label="Edit question">✎</button><button aria-label="Delete question">×</button></div></div><h3>{question.question}</h3><div className="editor-options">{question.options.map((option, optionIndex) => <div className={optionIndex === question.answer ? "correct" : ""} key={option}><span>{String.fromCharCode(65 + optionIndex)}</span><p>{option}</p>{optionIndex === question.answer ? <b>✓ Correct</b> : null}</div>)}</div></article>)}</div>
      </div>
    </section>
  );
}
