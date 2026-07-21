"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Role = "faculty" | "student";
type View =
  | "overview"
  | "classes"
  | "attendance"
  | "materials"
  | "quizzes"
  | "students"
  | "analytics";

type ClassItem = {
  code: string;
  name: string;
  section: string;
  students: number;
  accent: string;
  next: string;
};

const facultyNav: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "classes", label: "My Classes", icon: "▣" },
  { id: "attendance", label: "Attendance", icon: "◷" },
  { id: "materials", label: "Study Materials", icon: "▤" },
  { id: "quizzes", label: "Quizzes", icon: "◇" },
  { id: "students", label: "Students", icon: "♙" },
  { id: "analytics", label: "Analytics", icon: "↗" },
];

const studentNav: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "My Overview", icon: "⌂" },
  { id: "classes", label: "My Classes", icon: "▣" },
  { id: "attendance", label: "Attendance", icon: "◷" },
  { id: "materials", label: "Study Materials", icon: "▤" },
  { id: "quizzes", label: "Quizzes", icon: "◇" },
  { id: "analytics", label: "My Results", icon: "↗" },
];

const starterClasses: ClassItem[] = [
  {
    code: "CS301",
    name: "Artificial Intelligence",
    section: "Semester 5 · Section A",
    students: 42,
    accent: "navy",
    next: "Today, 11:30 AM",
  },
  {
    code: "CS305",
    name: "Machine Learning",
    section: "Semester 5 · Section B",
    students: 38,
    accent: "mint",
    next: "Tomorrow, 9:00 AM",
  },
  {
    code: "CS212",
    name: "Data Structures",
    section: "Semester 3 · Section A",
    students: 46,
    accent: "yellow",
    next: "Wed, 2:00 PM",
  },
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
  { icon: "✓", tone: "mint", title: "Attendance completed", detail: "AI · Semester 5A", time: "10 min ago" },
  { icon: "▤", tone: "blue", title: "Notes summary generated", detail: "Intelligent Agents.pdf", time: "1 hr ago" },
  { icon: "◇", tone: "yellow", title: "Quiz published", detail: "Search Strategies · 10 questions", time: "Yesterday" },
];

const students = [
  ["Aarav Sharma", "22CS001", "94%", "88"],
  ["Diya Patel", "22CS008", "91%", "92"],
  ["Kabir Mehta", "22CS019", "87%", "76"],
  ["Meera Nair", "22CS024", "96%", "95"],
  ["Rohan Verma", "22CS036", "82%", "71"],
];

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function makeQrCells() {
  const cells: boolean[] = [];
  for (let y = 0; y < 21; y += 1) {
    for (let x = 0; x < 21; x += 1) {
      const inFinder =
        (x < 7 && y < 7) ||
        (x > 13 && y < 7) ||
        (x < 7 && y > 13);
      const finderOn =
        (x % 7 === 0 || x % 7 === 6 || y % 7 === 0 || y % 7 === 6) ||
        (x % 7 >= 2 && x % 7 <= 4 && y % 7 >= 2 && y % 7 <= 4);
      cells.push(inFinder ? finderOn : ((x * 3 + y * 5 + x * y) % 7 < 3));
    }
  }
  return cells;
}

const qrCells = makeQrCells();

export function ClassroomApp() {
  const [role, setRole] = useState<Role>("faculty");
  const [view, setView] = useState<View>("overview");
  const [classes, setClasses] = useState<ClassItem[]>(starterClasses);
  const [showCreate, setShowCreate] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState("");
  const [activeSession, setActiveSession] = useState(false);
  const [countdown, setCountdown] = useState(240);
  const [studentPresent, setStudentPresent] = useState(false);
  const [uploadedFile, setUploadedFile] = useState("");
  const [summaryReady, setSummaryReady] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [quizPublished, setQuizPublished] = useState(true);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizResult, setQuizResult] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const nav = role === "faculty" ? facultyNav : studentNav;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!activeSession || countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((current) => current - 1), 1000);
    return () => window.clearInterval(timer);
  }, [activeSession, countdown]);

  useEffect(() => {
    if (countdown === 0) {
      setActiveSession(false);
      setToast("Attendance session expired safely.");
    }
  }, [countdown]);

  const filteredClasses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return classes;
    return classes.filter((item) => `${item.code} ${item.name} ${item.section}`.toLowerCase().includes(query));
  }, [classes, search]);

  function switchRole(nextRole: Role) {
    setRole(nextRole);
    setView("overview");
    setSearch("");
    setToast(nextRole === "faculty" ? "Faculty workspace ready." : "Student workspace ready.");
  }

  function navigate(nextView: View) {
    setView(nextView);
    setSearch("");
  }

  function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = String(data.get("subject") || "New Class");
    const code = String(data.get("code") || "NEW101").toUpperCase();
    const semester = String(data.get("semester") || "Semester 1");
    const section = String(data.get("section") || "A").toUpperCase();
    setClasses((current) => [
      ...current,
      {
        code,
        name: subject,
        section: `${semester} · Section ${section}`,
        students: 0,
        accent: "coral",
        next: "Schedule pending",
      },
    ]);
    setShowCreate(false);
    setView("classes");
    setToast(`${subject} created. Class code: ${code}-${section}`);
  }

  function startSession() {
    setActiveSession(true);
    setCountdown(240);
    setStudentPresent(false);
    setView("attendance");
    setToast("Secure QR session started for CS301.");
  }

  function closeSession() {
    setActiveSession(false);
    setToast("Attendance saved: 39 present, 3 absent.");
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
            <div className="storage-top"><span>Storage</span><b>6.4 GB / 10 GB</b></div>
            <div className="storage-bar"><i /></div>
            <button onClick={() => navigate("materials")}>Manage storage →</button>
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
          <div className="role-switch" aria-label="Preview role">
            <button className={role === "faculty" ? "selected" : ""} onClick={() => switchRole("faculty")}>Faculty</button>
            <button className={role === "student" ? "selected" : ""} onClick={() => switchRole("student")}>Student</button>
          </div>
          <button className="icon-button" onClick={() => setShowNotifications((current) => !current)} aria-label="Notifications">
            ♢<span />
          </button>
          <button className="profile-button" onClick={() => setToast("Signed in as Dr. Maya Kapoor.")} aria-label="Open profile">
            <span className="avatar">MK</span>
            <span className="profile-copy"><b>{role === "faculty" ? "Dr. Maya Kapoor" : "Aarav Sharma"}</b><small>{role === "faculty" ? "Faculty" : "22CS001"}</small></span>
            <span className="chevron">⌄</span>
          </button>
          {showNotifications ? (
            <div className="notification-popover">
              <div><b>Notifications</b><span>3 new</span></div>
              <p><i className="dot mint" /> 39 students marked present.</p>
              <p><i className="dot yellow" /> Quiz 4 is ready for review.</p>
              <p><i className="dot blue" /> AI summary completed.</p>
            </div>
          ) : null}
        </header>

        <div className="content-area">
          {view === "overview" ? (
            role === "faculty" ? (
              <FacultyOverview onNavigate={navigate} onStartAttendance={startSession} onCreate={() => setShowCreate(true)} />
            ) : (
              <StudentOverview onNavigate={navigate} present={studentPresent} />
            )
          ) : null}
          {view === "classes" ? (
            <ClassesView
              role={role}
              classes={filteredClasses}
              onCreate={() => setShowCreate(true)}
              onOpen={() => setToast("Class workspace opened for CS301.")}
            />
          ) : null}
          {view === "attendance" ? (
            <AttendanceView
              role={role}
              active={activeSession}
              countdown={countdown}
              present={studentPresent}
              onStart={startSession}
              onClose={closeSession}
              onMark={() => {
                setStudentPresent(true);
                setToast("Attendance marked successfully at 11:34 AM.");
              }}
            />
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
          {view === "students" ? <StudentsView /> : null}
          {view === "analytics" ? <AnalyticsView role={role} /> : null}
        </div>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.slice(0, 5).map((item) => (
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
  onNavigate,
  onStartAttendance,
  onCreate,
}: {
  onNavigate: (view: View) => void;
  onStartAttendance: () => void;
  onCreate: () => void;
}) {
  return (
    <>
      <section className="welcome-row">
        <div><span className="eyebrow">TUESDAY · 21 JULY</span><h2>Good morning, Dr. Kapoor <span>✦</span></h2><p>Here’s what’s happening across your classes today.</p></div>
        <button className="button primary" onClick={onCreate}><span>＋</span>Create class</button>
      </section>

      <section className="metrics-grid">
        <MetricCard icon="▣" tone="navy" value="3" label="Active classes" note="120 students total" />
        <MetricCard icon="✓" tone="mint" value="89%" label="Today's attendance" note="↑ 4% from last week" positive />
        <MetricCard icon="▤" tone="blue" value="12" label="Study materials" note="3 added this month" />
        <MetricCard icon="◇" tone="yellow" value="7" label="Published quizzes" note="84% average score" />
      </section>

      <section className="dashboard-grid">
        <div className="panel schedule-panel">
          <PanelHeader eyebrow="TODAY" title="Upcoming classes" action="View schedule" onAction={() => onNavigate("classes")} />
          <div className="class-schedule-list">
            <ScheduleItem time="11:30" meridiem="AM" code="CS301" title="Artificial Intelligence" meta="Semester 5 · Section A · Room 204" color="navy" active />
            <ScheduleItem time="02:00" meridiem="PM" code="CS212" title="Data Structures" meta="Semester 3 · Section A · Lab 2" color="yellow" />
            <ScheduleItem time="04:15" meridiem="PM" code="CS305" title="Machine Learning" meta="Semester 5 · Section B · Room 310" color="mint" />
          </div>
        </div>

        <div className="panel attendance-chart-panel">
          <PanelHeader eyebrow="THIS WEEK" title="Attendance overview" action="View report" onAction={() => onNavigate("analytics")} />
          <div className="chart-top"><div><b>89.2%</b><span>class average</span></div><span className="trend-pill">↗ 3.8%</span></div>
          <div className="attendance-chart">
            {[72, 86, 78, 92, 89].map((height, index) => (
              <div className="bar-column" key={height + index}><div className="bar-track"><i style={{ height: `${height}%` }} className={index === 4 ? "current" : ""} /></div><span>{["Mon", "Tue", "Wed", "Thu", "Fri"][index]}</span></div>
            ))}
          </div>
        </div>

        <div className="panel quick-actions-panel">
          <PanelHeader eyebrow="SHORTCUTS" title="Quick actions" />
          <div className="quick-grid">
            <QuickAction icon="◫" tone="navy" title="Start attendance" detail="Create secure QR" onClick={onStartAttendance} />
            <QuickAction icon="↑" tone="blue" title="Upload notes" detail="PDF, DOCX, PPTX" onClick={() => onNavigate("materials")} />
            <QuickAction icon="✦" tone="yellow" title="Generate quiz" detail="From your notes" onClick={() => onNavigate("quizzes")} />
            <QuickAction icon="♙" tone="mint" title="Manage students" detail="42 in CS301" onClick={() => onNavigate("students")} />
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

function StudentOverview({ onNavigate, present }: { onNavigate: (view: View) => void; present: boolean }) {
  return (
    <>
      <section className="student-hero">
        <div className="student-hero-copy">
          <span className="eyebrow light">YOUR LEARNING SPACE</span>
          <h2>Ready for a productive day, Aarav?</h2>
          <p>Your AI class begins at 11:30 AM. Attendance opens when your faculty starts the session.</p>
          <div className="hero-actions"><button className="button yellow" onClick={() => onNavigate("attendance")}>{present ? "Attendance marked ✓" : "Scan attendance QR"}</button><button className="text-button light" onClick={() => onNavigate("classes")}>View today’s classes →</button></div>
        </div>
        <div className="hero-orbit" aria-hidden="true"><span className="orbit one">AI</span><span className="orbit two">✓</span><span className="orbit three">A+</span><div>✦</div></div>
      </section>

      <section className="metrics-grid student-metrics">
        <MetricCard icon="▣" tone="navy" value="3" label="Enrolled classes" note="Next: AI at 11:30" />
        <MetricCard icon="✓" tone="mint" value="91%" label="My attendance" note="On track this semester" positive />
        <MetricCard icon="▤" tone="blue" value="4" label="New summaries" note="2 unread this week" />
        <MetricCard icon="◇" tone="yellow" value="2" label="Quizzes due" note="Nearest due tomorrow" />
      </section>

      <section className="dashboard-grid student-grid">
        <div className="panel learning-panel">
          <PanelHeader eyebrow="CONTINUE LEARNING" title="Recent study materials" action="View all" onAction={() => onNavigate("materials")} />
          <div className="material-card-list">
            <button onClick={() => onNavigate("materials")}><span className="file-icon pdf">PDF</span><div><b>Intelligent Agents</b><p>AI-generated revision notes · 8 min read</p></div><em>68%</em></button>
            <button onClick={() => onNavigate("materials")}><span className="file-icon doc">DOC</span><div><b>Search Strategies</b><p>Key points and definitions · 6 min read</p></div><em>New</em></button>
          </div>
        </div>
        <div className="panel deadline-panel">
          <PanelHeader eyebrow="UP NEXT" title="Quiz deadline" />
          <div className="deadline-body"><span className="quiz-big-icon">◇</span><div><b>Search Strategies</b><p>10 questions · 15 minutes</p><div className="deadline"><span>Due tomorrow</span><b>6:00 PM</b></div></div></div>
          <button className="button primary full" onClick={() => onNavigate("quizzes")}>Start quiz</button>
        </div>
        <div className="panel progress-panel">
          <PanelHeader eyebrow="SEMESTER 5" title="Learning progress" action="View results" onAction={() => onNavigate("analytics")} />
          <div className="progress-score"><div className="score-ring"><span>88<b>%</b></span></div><div><b>Great momentum!</b><p>You improved 6% over your last three quizzes.</p><span className="trend-pill">↗ Keep it up</span></div></div>
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

function ClassesView({ role, classes, onCreate, onOpen }: { role: Role; classes: ClassItem[]; onCreate: () => void; onOpen: () => void }) {
  return (
    <section className="page-stack">
      <div className="section-title-row"><div><span className="eyebrow">ACADEMIC YEAR 2026–27</span><h2>{role === "faculty" ? "Your classes" : "Enrolled classes"}</h2><p>{role === "faculty" ? "Organise lessons, learners and performance in one place." : "Everything you need for your active semester."}</p></div>{role === "faculty" ? <button className="button primary" onClick={onCreate}>＋ Create class</button> : <button className="button primary" onClick={onOpen}>Join with code</button>}</div>
      <div className="filter-row"><button className="filter-chip active">All classes <span>{classes.length}</span></button><button className="filter-chip">Semester 5</button><button className="filter-chip">Semester 3</button><select aria-label="Sort classes"><option>Recently active</option><option>Subject name</option></select></div>
      <div className="class-card-grid">
        {classes.map((item, index) => (
          <article className="class-card" key={`${item.code}-${index}`}>
            <div className={`class-card-top ${item.accent}`}><span>{item.code}</span><button aria-label="Class menu">•••</button><div className="class-monogram">{item.name.split(" ").map((word) => word[0]).slice(0, 2).join("")}</div></div>
            <div className="class-card-body"><h3>{item.name}</h3><p>{item.section}</p><div className="class-stats"><span><b>{item.students}</b> students</span><span><b>{index + 3}</b> materials</span><span><b>{index + 1}</b> quizzes</span></div><div className="next-class"><span>Next class</span><b>{item.next}</b></div><button className="button outline full" onClick={onOpen}>Open class <span>→</span></button></div>
          </article>
        ))}
        {classes.length === 0 ? <div className="empty-state"><span>⌕</span><h3>No classes match that search</h3><p>Try a subject name, class code or section.</p></div> : null}
      </div>
    </section>
  );
}

function AttendanceView({ role, active, countdown, present, onStart, onClose, onMark }: { role: Role; active: boolean; countdown: number; present: boolean; onStart: () => void; onClose: () => void; onMark: () => void }) {
  if (role === "student") {
    return (
      <section className="attendance-student-page page-stack">
        <div className="section-title-row"><div><span className="eyebrow">CS301 · ARTIFICIAL INTELLIGENCE</span><h2>Mark attendance</h2><p>Scan the faculty QR code while the session is active.</p></div><span className={present ? "status-pill success" : "status-pill waiting"}>{present ? "✓ Present" : "● Waiting for scan"}</span></div>
        <div className="scanner-layout">
          <div className="scanner-card panel"><div className={present ? "scanner-frame complete" : "scanner-frame"}><span className="corner c1" /><span className="corner c2" /><span className="corner c3" /><span className="corner c4" /><div className="scan-symbol">{present ? "✓" : "⌗"}</div>{!present ? <i className="scan-line" /> : null}</div><h3>{present ? "Attendance recorded!" : "Point your camera at the QR"}</h3><p>{present ? "Tuesday, 21 July · 11:34 AM" : "For this demo, use the secure session below."}</p>{present ? <div className="confirmation-card"><span>CS301</span><div><b>Artificial Intelligence</b><p>Room 204 · Dr. Maya Kapoor</p></div></div> : <button className="button primary full" onClick={onMark}>Simulate secure scan</button>}</div>
          <div className="panel attendance-history"><PanelHeader eyebrow="THIS SEMESTER" title="Attendance history" /><div className="history-summary"><div className="score-ring small"><span>91<b>%</b></span></div><div><b>41 of 45 sessions</b><p>You are safely above the required 75%.</p></div></div>{[["18 Jul", "Present"], ["16 Jul", "Present"], ["14 Jul", "Absent"], ["11 Jul", "Present"]].map((row) => <div className="history-row" key={row[0]}><span>{row[0]}</span><b>{row[1]}</b><i className={row[1] === "Present" ? "present" : "absent"} /></div>)}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="section-title-row"><div><span className="eyebrow">CS301 · ARTIFICIAL INTELLIGENCE</span><h2>Attendance session</h2><p>Create a temporary QR code valid only for enrolled students.</p></div>{active ? <button className="button danger" onClick={onClose}>Close & save session</button> : <button className="button primary" onClick={onStart}>◫ Start attendance</button>}</div>
      <div className="attendance-layout">
        <div className="panel qr-panel">
          <div className="qr-header"><div><span className={active ? "status-pill success" : "status-pill waiting"}>{active ? "● Session active" : "○ Session closed"}</span><h3>Tuesday lecture</h3><p>Room 204 · 11:30 AM</p></div><div className="timer"><span>EXPIRES IN</span><b>{active ? formatTime(countdown) : "04:00"}</b></div></div>
          <div className={active ? "qr-code" : "qr-code disabled"}>{qrCells.map((on, index) => <i key={index} className={on ? "on" : ""} />)}</div>
          <div className="session-code"><span>Session ID</span><b>ATT-CS301-721</b><button onClick={() => navigator.clipboard?.writeText("ATT-CS301-721")}>Copy</button></div>
          {!active ? <button className="button primary full" onClick={onStart}>Generate secure QR</button> : <p className="secure-note">⌾ Login, enrolment and one-scan validation are active.</p>}
        </div>
        <div className="panel live-attendance-panel">
          <PanelHeader eyebrow="LIVE ROSTER" title="Student check-ins" />
          <div className="roster-summary"><div><b>{active ? "39" : "0"}<span>/ 42</span></b><p>Students present</p></div><span className="trend-pill">{active ? "93%" : "Not started"}</span></div>
          <div className="roster-progress"><i style={{ width: active ? "93%" : "0%" }} /></div>
          <div className="student-checkins">
            {(active ? students.slice(0, 4) : students.slice(0, 3)).map((student, index) => <div key={student[1]}><span className={`student-avatar a${index}`}>{student[0].split(" ").map((word) => word[0]).join("")}</span><div><b>{student[0]}</b><p>{student[1]}</p></div><time>{active ? `${index + 1} min ago` : "Not marked"}</time><span className={active ? "check" : "pending"}>{active ? "✓" : "—"}</span></div>)}
          </div>
          <button className="text-button centered">View full roster →</button>
        </div>
      </div>
    </section>
  );
}

function MaterialsView({ role, fileName, summaryReady, loading, onFile, onGenerate }: { role: Role; fileName: string; summaryReady: boolean; loading: boolean; onFile: (name: string) => void; onGenerate: () => void }) {
  return (
    <section className="page-stack">
      <div className="section-title-row"><div><span className="eyebrow">AI-POWERED LEARNING</span><h2>{role === "faculty" ? "Study materials" : "Notes & summaries"}</h2><p>{role === "faculty" ? "Upload source notes, then turn them into clear revision material." : "Read concise, faculty-reviewed summaries for your subjects."}</p></div>{role === "faculty" ? <label className="button primary upload-button">↑ Upload notes<input type="file" accept=".pdf,.docx,.pptx,.txt" onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0].name)} /></label> : null}</div>
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
        <div className="quiz-topline"><div><span className="eyebrow">CS301 · QUIZ 04</span><h2>Search Strategies</h2><p>3 questions · 1 mark each · Attempt all questions</p></div><div className="quiz-timer"><span>TIME LEFT</span><b>14:32</b></div></div>
        {result !== null ? <div className="result-banner"><span>✦</span><div><h3>Quiz complete — {result}/{quizQuestions.length}</h3><p>{result === quizQuestions.length ? "Perfect score. Excellent work!" : "Review the summary and try the concepts again."}</p></div><div className="score-bubble">{Math.round((result / quizQuestions.length) * 100)}%</div></div> : null}
        <div className="question-list">{quizQuestions.map((question, questionIndex) => <article className="panel question-card" key={question.question}><div className="question-number">{String(questionIndex + 1).padStart(2, "0")}</div><div className="question-content"><h3>{question.question}</h3><div className="option-grid">{question.options.map((option, optionIndex) => <button className={answers[questionIndex] === optionIndex ? "selected" : ""} onClick={() => onAnswer(questionIndex, optionIndex)} key={option}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>{result !== null ? <p className="answer-explanation"><b>Answer: {question.options[question.answer]}.</b> This follows directly from the published class summary.</p> : null}</div></article>)}</div>
        <div className="quiz-submit-bar"><span>{Object.keys(answers).length} of {quizQuestions.length} answered</span><div className="answer-progress"><i style={{ width: `${(Object.keys(answers).length / quizQuestions.length) * 100}%` }} /></div><button className="button primary" disabled={Object.keys(answers).length < quizQuestions.length} onClick={onSubmit}>Submit quiz</button></div>
      </section>
    );
  }

  return (
    <section className="page-stack">
      <div className="section-title-row"><div><span className="eyebrow">AI QUIZ STUDIO</span><h2>Create a grounded quiz</h2><p>Generate questions from your notes, review every answer, then publish.</p></div><span className={published ? "status-pill success" : "status-pill draft"}>{published ? "✓ Published" : "○ Draft review"}</span></div>
      <div className="quiz-builder-layout">
        <div className="panel quiz-settings"><PanelHeader eyebrow="QUIZ SETTINGS" title="Search Strategies" /><label>Source material<select><option>Search Strategies.pdf</option><option>Intelligent Agents.pdf</option></select></label><div className="form-row"><label>Questions<select defaultValue="3"><option>3</option><option>5</option><option>10</option></select></label><label>Difficulty<select><option>Medium</option><option>Easy</option><option>Hard</option></select></label></div><label>Question type<div className="segmented-field"><button className="active">Multiple choice</button><button>True / false</button></div></label><div className="form-row"><label>Duration<input value="15 minutes" readOnly /></label><label>Marks<input value="1 each" readOnly /></label></div><button className="button yellow full" onClick={onGenerate}>✦ Regenerate questions</button><div className="grounded-note"><span>⌾</span><p><b>Grounded generation</b><br />Questions use only uploaded notes and require faculty review.</p></div></div>
        <div className="question-editor"><div className="editor-heading"><div><span className="eyebrow">QUESTION REVIEW</span><h3>{quizQuestions.length} generated questions</h3></div><button className="button primary" onClick={onPublish}>{published ? "Republish changes" : "Publish quiz"}</button></div>{quizQuestions.map((question, index) => <article className="panel editor-card" key={question.question}><div className="editor-card-top"><span>QUESTION {String(index + 1).padStart(2, "0")}</span><div><button aria-label="Edit question">✎</button><button aria-label="Delete question">×</button></div></div><h3>{question.question}</h3><div className="editor-options">{question.options.map((option, optionIndex) => <div className={optionIndex === question.answer ? "correct" : ""} key={option}><span>{String.fromCharCode(65 + optionIndex)}</span><p>{option}</p>{optionIndex === question.answer ? <b>✓ Correct</b> : null}</div>)}</div></article>)}</div>
      </div>
    </section>
  );
}

function StudentsView() {
  return (
    <section className="page-stack"><div className="section-title-row"><div><span className="eyebrow">CS301 · SECTION A</span><h2>Student roster</h2><p>Track attendance and quiz performance for 42 enrolled learners.</p></div><button className="button primary">＋ Add student</button></div><div className="panel data-panel"><div className="table-toolbar"><div className="mini-search">⌕ <input placeholder="Search student or roll number" /></div><button className="button outline">Export CSV ↓</button></div><div className="student-table"><div className="table-row table-head"><span>Student</span><span>Roll number</span><span>Attendance</span><span>Quiz average</span><span>Status</span><span /></div>{students.map((student, index) => <div className="table-row" key={student[1]}><span className="student-cell"><i className={`student-avatar a${index}`}>{student[0].split(" ").map((word) => word[0]).join("")}</i><b>{student[0]}</b></span><span>{student[1]}</span><span><b>{student[2]}</b></span><span><b>{student[3]}%</b></span><span><i className={Number.parseInt(student[2]) > 85 ? "status-dot good" : "status-dot watch"} />{Number.parseInt(student[2]) > 85 ? "On track" : "Needs attention"}</span><button>•••</button></div>)}</div></div></section>
  );
}

function AnalyticsView({ role }: { role: Role }) {
  return (
    <section className="page-stack"><div className="section-title-row"><div><span className="eyebrow">SEMESTER 5 · 2026–27</span><h2>{role === "faculty" ? "Class analytics" : "My performance"}</h2><p>{role === "faculty" ? "Turn attendance and assessment data into timely action." : "See your progress across attendance and quiz outcomes."}</p></div><button className="button outline">Download report ↓</button></div><section className="metrics-grid"><MetricCard icon="✓" tone="mint" value={role === "faculty" ? "89%" : "91%"} label="Attendance average" note="↑ 3.8% this month" positive /><MetricCard icon="◇" tone="yellow" value={role === "faculty" ? "84%" : "88%"} label="Quiz average" note="↑ 6% over 3 quizzes" positive /><MetricCard icon="▣" tone="navy" value={role === "faculty" ? "39" : "7"} label={role === "faculty" ? "On-track students" : "Quizzes completed"} note="Consistent performance" /><MetricCard icon="↗" tone="blue" value="A" label="Current grade band" note="Strong academic progress" /></section><div className="analytics-grid"><div className="panel analytics-chart"><PanelHeader eyebrow="12-WEEK VIEW" title={role === "faculty" ? "Attendance trend" : "My score trend"} /><div className="line-chart"><div className="grid-lines"><i /><i /><i /><i /></div><div className="line-fill" /><div className="line-points">{[58, 44, 49, 32, 38, 22, 28].map((top, index) => <i key={top} style={{ left: `${index * 16.6}%`, top: `${top}%` }}><span>{[78, 84, 82, 89, 86, 94, 91][index]}%</span></i>)}</div></div><div className="chart-labels"><span>Week 1</span><span>Week 4</span><span>Week 8</span><span>Week 12</span></div></div><div className="panel insights-panel"><PanelHeader eyebrow="AI INSIGHTS" title="What to focus on" /><div className="insight good"><span>↗</span><div><b>Positive momentum</b><p>Performance improved most after revision summaries were published.</p></div></div><div className="insight warn"><span>!</span><div><b>Attention point</b><p>{role === "faculty" ? "Five learners are close to the attendance threshold." : "Graph search questions need one more revision pass."}</p></div></div><div className="insight info"><span>✦</span><div><b>Suggested next step</b><p>Review “Search Strategies” before the next assessment.</p></div></div></div></div></section>
  );
}
