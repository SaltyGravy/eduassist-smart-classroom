"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AdminUser = {
  userId: string;
  displayName: string;
  role: "admin";
  deviceLabel: string;
  deviceRegisteredAt: string;
  mustChangePassword: boolean;
};

type ManagedUser = {
  userId: string;
  displayName: string;
  role: "admin" | "faculty" | "student";
  status: "active" | "suspended";
  mustChangePassword: boolean;
  deviceRegistered: boolean;
  deviceLabel: string | null;
  deviceRegisteredAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

type AuditEvent = {
  id: number;
  actorUserId: string;
  action: string;
  targetUserId: string;
  detail: string;
  createdAt: string;
};

type AdminView = "overview" | "users" | "devices" | "audit";

const adminNav: Array<{ id: AdminView; label: string; icon: string }> = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "users", label: "Users", icon: "♙" },
  { id: "devices", label: "Devices", icon: "▣" },
  { id: "audit", label: "Audit log", icon: "↗" },
];

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Never";
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", includeTime
    ? { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }
    : { day: "numeric", month: "short", year: "numeric" });
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    login: "Signed in",
    login_blocked: "Blocked sign-in",
    device_blocked: "Second device blocked",
    device_released: "Released own device",
    device_released_admin: "Device released by admin",
    password_changed: "Password changed",
    password_reset_admin: "Temporary password issued",
    user_created: "Account created",
    account_active: "Account activated",
    account_suspended: "Account suspended",
  };
  return labels[action] ?? action.replaceAll("_", " ");
}

function generateTemporaryPassword() {
  const words = ["Campus", "Learn", "Class", "Study", "Bright", "Smart"];
  const word = words[Math.floor(Math.random() * words.length)];
  return `${word}@${Math.floor(1000 + Math.random() * 9000)}`;
}

export function AdminPanel({
  user,
  deviceId,
  onSignOut,
  onReleaseDevice,
}: {
  user: AdminUser;
  deviceId: string;
  onSignOut: () => Promise<void>;
  onReleaseDevice: () => Promise<void>;
}) {
  const [view, setView] = useState<AdminView>("overview");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | ManagedUser["role"]>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [resetUser, setResetUser] = useState<ManagedUser | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const [busyUser, setBusyUser] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/admin/users", { cache: "no-store", headers: { "x-eduassist-device-id": deviceId } }),
      fetch("/api/admin/audit", { cache: "no-store", headers: { "x-eduassist-device-id": deviceId } }),
    ])
      .then(async ([usersResponse, auditResponse]) => {
        if (!usersResponse.ok || !auditResponse.ok) throw new Error("The administrator session could not be verified.");
        const userResult = (await usersResponse.json()) as { users: ManagedUser[] };
        const auditResult = (await auditResponse.json()) as { events: AuditEvent[] };
        if (active) {
          setUsers(userResult.users);
          setEvents(auditResult.events);
        }
      })
      .catch((reason: Error) => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deviceId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((item) => {
      const matchesRole = roleFilter === "all" || item.role === roleFilter;
      const matchesTerm = !term || item.displayName.toLowerCase().includes(term) || item.userId.toLowerCase().includes(term);
      return matchesRole && matchesTerm;
    });
  }, [users, search, roleFilter]);

  const stats = useMemo(() => ({
    students: users.filter((item) => item.role === "student" && item.status === "active").length,
    faculty: users.filter((item) => item.role === "faculty" && item.status === "active").length,
    devices: users.filter((item) => item.deviceRegistered).length,
    attention: users.filter((item) => item.status === "suspended" || (item.mustChangePassword && item.role !== "admin")).length,
  }), [users]);

  async function reloadAudit() {
    const response = await fetch("/api/admin/audit", { cache: "no-store", headers: { "x-eduassist-device-id": deviceId } });
    if (response.ok) setEvents(((await response.json()) as { events: AuditEvent[] }).events);
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusyUser("create");
    setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json", "x-eduassist-device-id": deviceId },
        body: JSON.stringify({
          displayName: form.get("displayName"),
          userId: form.get("userId"),
          role: form.get("role"),
          temporaryPassword: form.get("temporaryPassword"),
        }),
      });
      const result = (await response.json()) as { user?: ManagedUser; message?: string };
      if (!response.ok || !result.user) throw new Error(result.message ?? "The account could not be created.");
      setUsers((current) => [...current, result.user as ManagedUser]);
      setShowCreate(false);
      setToast(`${result.user.displayName}'s ${result.user.role} account was created.`);
      await reloadAudit();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The account could not be created.");
    } finally {
      setBusyUser("");
    }
  }

  async function manageAccount(target: ManagedUser, action: "release_device" | "suspend" | "activate" | "reset_password", temporaryPassword?: string) {
    setBusyUser(target.userId);
    setError("");
    try {
      const response = await fetch("/api/admin/user-action", {
        method: "POST",
        headers: { "content-type": "application/json", "x-eduassist-device-id": deviceId },
        body: JSON.stringify({ userId: target.userId, action, temporaryPassword }),
      });
      const result = (await response.json()) as { user?: ManagedUser; message?: string };
      if (!response.ok || !result.user) throw new Error(result.message ?? "The account could not be updated.");
      setUsers((current) => current.map((item) => item.userId === result.user?.userId ? result.user as ManagedUser : item));
      setResetUser(null);
      const message = action === "release_device" ? "Device released. The next login can register a new device."
        : action === "suspend" ? "Account suspended and active sessions closed."
          : action === "activate" ? "Account reactivated."
            : "Temporary password saved. The user must replace it on next login.";
      setToast(`${target.userId}: ${message}`);
      await reloadAudit();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The account could not be updated.");
    } finally {
      setBusyUser("");
    }
  }

  const title = adminNav.find((item) => item.id === view)?.label ?? "Overview";

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <button className="admin-brand" onClick={() => setView("overview")}><span className="brand-mark"><i /><i /><i /></span><span>Edu<b>Assist</b></span></button>
        <div className="admin-mode"><span>⚙</span><div><b>Administration</b><small>Project control centre</small></div></div>
        <span className="admin-nav-label">MANAGE</span>
        <nav>{adminNav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}{item.id === "devices" && stats.attention ? <i>{stats.attention}</i> : null}</button>)}</nav>
        <div className="admin-sidebar-note"><span>✓</span><p><b>Device binding active</b>Every account is limited to one registered browser at a time.</p></div>
        <button className="admin-signout" onClick={() => void onSignOut()}><span>↪</span> Sign out</button>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div><span>Administrator workspace</span><h1>{title}</h1></div>
          <button className="admin-add-mobile" onClick={() => setShowCreate(true)}>＋ Add user</button>
          <button className="admin-profile" onClick={() => setShowAccount((current) => !current)}><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{user.userId} · Super admin</small></p><i>⌄</i></button>
          {showAccount ? <div className="admin-account-popover"><div><span>{initials(user.displayName)}</span><p><b>{user.displayName}</b><small>{user.userId}</small></p></div><section><b>Registered device</b><p>{user.deviceLabel}</p><small>Bound {formatDate(user.deviceRegisteredAt)}</small></section><p>Release only when moving this admin account to another browser.</p><button onClick={() => void onReleaseDevice()}><span>⇄</span> Release this device</button><button className="danger" onClick={() => void onSignOut()}><span>↪</span> Sign out</button></div> : null}
        </header>

        <div className="admin-content">
          {error ? <div className="admin-alert"><span>!</span><p><b>Action needed</b>{error}</p><button onClick={() => setError("")}>×</button></div> : null}
          {loading ? <div className="admin-loading"><span className="auth-loader"><i /><i /><i /></span><p>Loading account controls…</p></div> : null}

          {!loading && view === "overview" ? <AdminOverview stats={stats} users={users} events={events} onAdd={() => setShowCreate(true)} onView={setView} /> : null}
          {!loading && view === "users" ? <UsersView users={filteredUsers} allUsers={users} search={search} roleFilter={roleFilter} busyUser={busyUser} adminId={user.userId} onSearch={setSearch} onFilter={setRoleFilter} onAdd={() => setShowCreate(true)} onReset={setResetUser} onAction={(target, action) => void manageAccount(target, action)} /> : null}
          {!loading && view === "devices" ? <DevicesView users={users} busyUser={busyUser} adminId={user.userId} onRelease={(target) => void manageAccount(target, "release_device")} /> : null}
          {!loading && view === "audit" ? <AuditView events={events} /> : null}
        </div>
      </main>

      <nav className="admin-mobile-nav">{adminNav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>

      {showCreate ? <CreateUserModal busy={busyUser === "create"} onClose={() => setShowCreate(false)} onSubmit={createUser} /> : null}
      {resetUser ? <ResetPasswordModal user={resetUser} busy={busyUser === resetUser.userId} onClose={() => setResetUser(null)} onSubmit={(temporaryPassword) => void manageAccount(resetUser, "reset_password", temporaryPassword)} /> : null}
      {toast ? <div className="toast"><span>✓</span>{toast}</div> : null}
    </div>
  );
}

function AdminOverview({ stats, users, events, onAdd, onView }: { stats: { students: number; faculty: number; devices: number; attention: number }; users: ManagedUser[]; events: AuditEvent[]; onAdd: () => void; onView: (view: AdminView) => void }) {
  return <section className="admin-page-stack">
    <div className="admin-welcome"><div><span className="eyebrow">CONTROL CENTRE</span><h2>Your classroom access, at a glance.</h2><p>Create accounts, recover devices, and keep a clear record of security activity.</p></div><button className="button primary" onClick={onAdd}>＋ Add a new user</button></div>
    <div className="admin-metrics">
      <article><span className="mint">♙</span><p><b>{stats.students}</b><small>Active students</small></p><i>Managed accounts</i></article>
      <article><span className="blue">▤</span><p><b>{stats.faculty}</b><small>Active faculty</small></p><i>Teaching access</i></article>
      <article><span className="yellow">▣</span><p><b>{stats.devices}</b><small>Bound devices</small></p><i>One per account</i></article>
      <article><span className="coral">!</span><p><b>{stats.attention}</b><small>Need attention</small></p><i>Review accounts</i></article>
    </div>
    <div className="admin-overview-grid">
      <article className="admin-panel-card"><div className="admin-card-title"><div><span className="eyebrow">RECENT ACCOUNTS</span><h3>People and access</h3></div><button onClick={() => onView("users")}>View all →</button></div><div className="overview-users">{users.slice(0, 5).map((item) => <div key={item.userId}><span className={`user-avatar ${item.role}`}>{initials(item.displayName)}</span><p><b>{item.displayName}</b><small>{item.userId} · {item.role}</small></p><i className={item.status === "active" ? "active" : "suspended"}>{item.status}</i></div>)}</div></article>
      <article className="admin-panel-card"><div className="admin-card-title"><div><span className="eyebrow">SECURITY FEED</span><h3>Latest activity</h3></div><button onClick={() => onView("audit")}>Audit log →</button></div><div className="overview-events">{events.slice(0, 5).map((event) => <div key={event.id}><span>{event.action.includes("blocked") ? "!" : event.action.includes("device") ? "▣" : "✓"}</span><p><b>{activityLabel(event.action)}</b><small>{event.targetUserId} · {formatDate(event.createdAt, true)}</small></p></div>)}{events.length === 0 ? <p className="admin-empty">Security activity will appear here.</p> : null}</div></article>
    </div>
    <article className="admin-safety-banner"><span>⌾</span><div><b>How first-login registration works</b><p>The first valid login binds an account to that browser and requires a new private password. A second browser is blocked until the user releases the old device while logged in—or you perform an admin recovery.</p></div><button onClick={() => onView("devices")}>Manage devices</button></article>
  </section>;
}

function UsersView({ users, allUsers, search, roleFilter, busyUser, adminId, onSearch, onFilter, onAdd, onReset, onAction }: { users: ManagedUser[]; allUsers: ManagedUser[]; search: string; roleFilter: "all" | ManagedUser["role"]; busyUser: string; adminId: string; onSearch: (value: string) => void; onFilter: (value: "all" | ManagedUser["role"]) => void; onAdd: () => void; onReset: (user: ManagedUser) => void; onAction: (user: ManagedUser, action: "release_device" | "suspend" | "activate") => void }) {
  return <section className="admin-page-stack"><div className="admin-section-heading"><div><span className="eyebrow">ACCOUNT DIRECTORY</span><h2>Users</h2><p>{allUsers.length} accounts · create, suspend, reset passwords, and recover devices.</p></div><button className="button primary" onClick={onAdd}>＋ Add user</button></div><div className="admin-panel-card admin-users-card"><div className="admin-table-tools"><label><span>⌕</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search name or user ID" /></label><div>{(["all", "admin", "faculty", "student"] as const).map((role) => <button key={role} className={roleFilter === role ? "active" : ""} onClick={() => onFilter(role)}>{role === "all" ? "All users" : role}</button>)}</div></div><div className="admin-user-table"><div className="admin-user-row head"><span>User</span><span>Role</span><span>Account</span><span>Device</span><span>Last login</span><span>Actions</span></div>{users.map((item) => <div className="admin-user-row" key={item.userId}><span className="admin-user-cell"><i className={`user-avatar ${item.role}`}>{initials(item.displayName)}</i><p><b>{item.displayName}</b><small>{item.userId}</small></p></span><span><i className={`role-chip ${item.role}`}>{item.role}</i></span><span><i className={`account-chip ${item.status}`}>{item.status === "active" ? "● Active" : "● Suspended"}</i>{item.mustChangePassword ? <small className="temporary-label">Temporary password</small> : null}</span><span className="device-cell"><b>{item.deviceRegistered ? "▣ Registered" : "○ Not registered"}</b><small>{item.deviceLabel ?? "First login pending"}</small></span><span className="last-login">{formatDate(item.lastLoginAt, true)}</span><span className="user-actions">{item.userId === adminId ? <i>Current account</i> : <><button disabled={busyUser === item.userId} onClick={() => onReset(item)}>Reset password</button>{item.deviceRegistered ? <button disabled={busyUser === item.userId} onClick={() => onAction(item, "release_device")}>Release device</button> : null}<button className={item.status === "active" ? "danger" : "success"} disabled={busyUser === item.userId} onClick={() => onAction(item, item.status === "active" ? "suspend" : "activate")}>{item.status === "active" ? "Suspend" : "Activate"}</button></>}</span></div>)}{users.length === 0 ? <div className="admin-empty table">No accounts match your search.</div> : null}</div></div></section>;
}

function DevicesView({ users, busyUser, adminId, onRelease }: { users: ManagedUser[]; busyUser: string; adminId: string; onRelease: (user: ManagedUser) => void }) {
  const registered = users.filter((item) => item.deviceRegistered);
  const pending = users.filter((item) => !item.deviceRegistered && item.role !== "admin");
  return <section className="admin-page-stack"><div className="admin-section-heading"><div><span className="eyebrow">DEVICE REGISTRY</span><h2>One account, one device.</h2><p>See registered browsers and perform recovery when a user loses access.</p></div><span className="device-policy-pill"><i /> Protection active</span></div><div className="admin-device-summary"><div><span>▣</span><p><b>{registered.length}</b><small>Registered now</small></p></div><div><span>○</span><p><b>{pending.length}</b><small>Waiting for first login</small></p></div><div><span>⌁</span><p><b>1</b><small>Device maximum</small></p></div></div><div className="admin-panel-card"><div className="admin-card-title"><div><span className="eyebrow">ACTIVE REGISTRATIONS</span><h3>Registered browsers</h3></div></div><div className="device-list">{registered.map((item) => <div key={item.userId}><span className={`device-owner ${item.role}`}>{initials(item.displayName)}</span><p><b>{item.displayName}</b><small>{item.userId} · {item.role}</small></p><section><b>▣ {item.deviceLabel}</b><small>Registered {formatDate(item.deviceRegisteredAt)}</small></section><i className="verified">✓ Verified</i>{item.userId !== adminId ? <button disabled={busyUser === item.userId} onClick={() => onRelease(item)}>{busyUser === item.userId ? "Releasing…" : "Release device"}</button> : <span className="own-device-label">Use account menu</span>}</div>)}{registered.length === 0 ? <p className="admin-empty">No devices have been registered yet.</p> : null}</div></div><article className="admin-recovery-note"><span>!</span><div><b>Use recovery only for genuine mishaps</b><p>Releasing a device immediately closes that user’s active session. Their next successful login will register the new browser and preserve the single-device rule.</p></div></article></section>;
}

function AuditView({ events }: { events: AuditEvent[] }) {
  return <section className="admin-page-stack"><div className="admin-section-heading"><div><span className="eyebrow">SECURITY HISTORY</span><h2>Audit log</h2><p>The 100 most recent account, password, login, and device events.</p></div><span className="audit-retention">Read-only record</span></div><div className="admin-panel-card audit-card"><div className="audit-row head"><span>Event</span><span>Target</span><span>Performed by</span><span>Details</span><span>Date & time</span></div>{events.map((event) => <div className="audit-row" key={event.id}><span><i className={event.action.includes("blocked") || event.action.includes("suspended") ? "warn" : ""}>{event.action.includes("blocked") ? "!" : event.action.includes("device") ? "▣" : "✓"}</i><b>{activityLabel(event.action)}</b></span><span>{event.targetUserId}</span><span>{event.actorUserId === event.targetUserId ? "Account owner" : event.actorUserId}</span><span>{event.detail || "—"}</span><span>{formatDate(event.createdAt, true)}</span></div>)}{events.length === 0 ? <p className="admin-empty">No security events recorded yet.</p> : null}</div></section>;
}

function CreateUserModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [password, setPassword] = useState(generateTemporaryPassword);
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal admin-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="add-user-title"><div className="modal-header"><div><span className="eyebrow">NEW ACCESS</span><h2 id="add-user-title">Add a user</h2><p>Create a faculty or student login for your project.</p></div><button onClick={onClose} aria-label="Close">×</button></div><form onSubmit={onSubmit}><label>Full name<input name="displayName" required minLength={2} placeholder="e.g. Ananya Singh" autoFocus /></label><div className="form-row"><label>User ID<input name="userId" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_-]+" placeholder="e.g. STU101" /></label><label>Role<select name="role" defaultValue="student"><option value="student">Student</option><option value="faculty">Faculty</option></select></label></div><label>Temporary password<div className="generated-password"><input name="temporaryPassword" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /><button type="button" onClick={() => setPassword(generateTemporaryPassword())}>Generate</button></div></label><div className="modal-note"><span>⌾</span><p><b>First-login protection</b><br />Share this temporary password privately. The user must replace it after their first device is registered.</p></div><div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button></div></form></div></div>;
}

function ResetPasswordModal({ user, busy, onClose, onSubmit }: { user: ManagedUser; busy: boolean; onClose: () => void; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState(generateTemporaryPassword);
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal admin-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="reset-title"><div className="modal-header"><div><span className="eyebrow">ACCOUNT RECOVERY</span><h2 id="reset-title">Reset password</h2><p>{user.displayName} · {user.userId}</p></div><button onClick={onClose} aria-label="Close">×</button></div><form onSubmit={(event) => { event.preventDefault(); onSubmit(password); }}><label>New temporary password<div className="generated-password"><input value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoFocus /><button type="button" onClick={() => setPassword(generateTemporaryPassword())}>Generate</button></div></label><div className="modal-note warning"><span>!</span><p><b>Active sessions will close.</b><br />The user must sign in again and replace this temporary password.</p></div><div className="modal-actions"><button type="button" className="button ghost" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Resetting…" : "Reset password"}</button></div></form></div></div>;
}
