"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type AuthUser = {
  userId: string;
  displayName: string;
  role: "admin" | "faculty" | "student";
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
  deviceChangesUsed: number;
  deviceChangesRemaining: number;
  deviceChangeWindowEnds: string | null;
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

function getDeviceId() {
  const key = "eduassist-device-registration";
  try {
    const current = localStorage.getItem(key);
    if (current) return current;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function deviceLabel() {
  return `${navigator.userAgent.includes("Firefox/") ? "Firefox" : navigator.userAgent.includes("Edg/") ? "Edge" : navigator.userAgent.includes("Chrome/") ? "Chrome" : "Browser"} admin session`;
}

function headers(deviceId: string, json = false) {
  return { "x-eduassist-device-id": deviceId, ...(json ? { "content-type": "application/json" } : {}) };
}

function dateLabel(value: string | null) {
  if (!value) return "Never";
  const parsed = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function temporaryPassword() {
  return `Edu${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).slice(0, 5)}@${Math.floor(10 + Math.random() * 89)}Aa`;
}

export function AdminPortal() {
  const [deviceId, setDeviceId] = useState("");
  const [state, setState] = useState<"loading" | "guest" | "password" | "ready">("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [view, setView] = useState<"users" | "audit">("users");
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function initialize() {
      const currentDeviceId = getDeviceId();
      setDeviceId(currentDeviceId);
      await fetch("/api/auth/session", { cache: "no-store", headers: headers(currentDeviceId) })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json() as { user: AuthUser };
        if (result.user.role !== "admin") {
          await fetch("/api/auth/logout", { method: "POST", headers: headers(currentDeviceId) });
          setError("Administrator credentials are required for this link.");
          setState("guest");
          return;
        }
        setUser(result.user);
        setState(result.user.mustChangePassword ? "password" : "ready");
      })
      .catch(() => setState("guest"));
    }
    void initialize();
  }, []);

  useEffect(() => {
    if (state !== "ready" || !deviceId) return;
    void refresh();
  }, [state, deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    setBusy(true);
    try {
      const [usersResponse, auditResponse] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store", headers: headers(deviceId) }),
        fetch("/api/admin/audit", { cache: "no-store", headers: headers(deviceId) }),
      ]);
      if (!usersResponse.ok) throw new Error("Administrator session expired.");
      const userResult = await usersResponse.json() as { users: ManagedUser[] };
      const auditResult = auditResponse.ok ? await auditResponse.json() as { events: AuditEvent[] } : { events: [] };
      setUsers(userResult.users);
      setEvents(auditResult.events);
      setSelectedId((current) => current && userResult.users.some((item) => item.userId === current) ? current : userResult.users[0]?.userId ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The admin data could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "admin", userId: form.get("userId"), password: form.get("password"), deviceId, deviceLabel: deviceLabel() }),
      });
      const result = await response.json() as { user?: AuthUser; message?: string };
      if (!response.ok || !result.user) throw new Error(result.message ?? "Unable to sign in.");
      setUser(result.user);
      setState(result.user.mustChangePassword ? "password" : "ready");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation) { setError("The passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: headers(deviceId, true), body: JSON.stringify({ newPassword: password }) });
      const result = await response.json() as { user?: AuthUser; message?: string };
      if (!response.ok || !result.user) throw new Error(result.message ?? "Password could not be changed.");
      setUser(result.user); setState("ready");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Password could not be changed."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", headers: headers(deviceId) }).catch(() => null);
    setUser(null); setUsers([]); setState("guest"); setNotice("Signed out.");
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: headers(deviceId, true), body: JSON.stringify(Object.fromEntries(form)) });
      const result = await response.json() as { user?: ManagedUser; message?: string };
      if (!response.ok || !result.user) throw new Error(result.message ?? "User could not be created.");
      setShowCreate(false); setNotice(`${result.user.userId} created.`); await refresh(); setSelectedId(result.user.userId);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "User could not be created."); }
    finally { setBusy(false); }
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const originalUserId = String(form.get("originalUserId") ?? "");
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH", headers: headers(deviceId, true), body: JSON.stringify({
          originalUserId,
          userId: form.get("userId"),
          displayName: form.get("displayName"),
          role: form.get("role"),
          status: form.get("status"),
          mustChangePassword: form.get("mustChangePassword") === "on",
        }),
      });
      const result = await response.json() as { user?: ManagedUser; message?: string };
      if (!response.ok || !result.user) throw new Error(result.message ?? "User could not be updated.");
      setUsers((current) => current.map((item) => item.userId === originalUserId ? result.user as ManagedUser : item));
      setSelectedId(result.user.userId);
      if (user?.userId === originalUserId) setUser({ ...user, userId: result.user.userId, displayName: result.user.displayName, mustChangePassword: result.user.mustChangePassword });
      setNotice(`${result.user.userId} updated.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "User could not be updated."); }
    finally { setBusy(false); }
  }

  async function accountAction(target: ManagedUser, action: "release_device" | "reset_device_changes" | "reset_password", password?: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/user-action", { method: "POST", headers: headers(deviceId, true), body: JSON.stringify({ userId: target.userId, action, temporaryPassword: password }) });
      const result = await response.json() as { user?: ManagedUser; message?: string };
      if (!response.ok || !result.user) throw new Error(result.message ?? "Action could not be completed.");
      setUsers((current) => current.map((item) => item.userId === target.userId ? result.user as ManagedUser : item));
      setNotice(action === "release_device" ? "Student device released." : action === "reset_device_changes" ? "Device-change allowance reset." : "Temporary password saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Action could not be completed."); }
    finally { setBusy(false); }
  }

  if (state === "loading") return <main className="minimal-admin-center"><p>Loading administrator access…</p></main>;
  if (state === "guest") return <main className="minimal-admin-center"><form className="minimal-admin-login" onSubmit={login}><h1>EduAssist administration</h1><p>Restricted administrator sign-in</p>{notice ? <output>{notice}</output> : null}{error ? <div role="alert">{error}</div> : null}<label>User ID<input name="userId" required autoComplete="username" /></label><label>Password<input name="password" type="password" required autoComplete="current-password" /></label><button disabled={busy || !deviceId}>{busy ? "Signing in…" : "Sign in"}</button><Link href="/">Return to faculty/student login</Link></form></main>;
  if (state === "password") return <main className="minimal-admin-center"><form className="minimal-admin-login" onSubmit={changePassword}><h1>Set administrator password</h1><p>Replace the temporary password before continuing.</p>{error ? <div role="alert">{error}</div> : null}<label>New password<input name="password" type="password" minLength={8} required autoComplete="new-password" /></label><label>Confirm password<input name="confirmation" type="password" minLength={8} required autoComplete="new-password" /></label><button disabled={busy}>{busy ? "Saving…" : "Save password"}</button></form></main>;

  const selected = users.find((item) => item.userId === selectedId) ?? null;
  const visibleUsers = users.filter((item) => `${item.displayName} ${item.userId} ${item.role} ${item.status}`.toLowerCase().includes(search.toLowerCase()));

  return <div className="minimal-admin-shell">
    <header><div><strong>EduAssist Admin</strong><span>/admin</span></div><p>{user?.displayName} · {user?.userId}</p><button onClick={() => void signOut()}>Sign out</button></header>
    <aside><nav><button className={view === "users" ? "active" : ""} onClick={() => setView("users")}>Users</button><button className={view === "audit" ? "active" : ""} onClick={() => setView("audit")}>Audit log</button></nav><small>Device registration applies only to students. Two changes are allowed per rolling six months.</small></aside>
    <main>
      {error ? <div className="minimal-admin-message error" role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div> : null}
      {notice ? <div className="minimal-admin-message">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div> : null}
      {view === "users" ? <section className="minimal-admin-users"><div className="minimal-admin-toolbar"><div><h1>User management</h1><p>{users.length} accounts</p></div><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" /><button onClick={() => setShowCreate(true)}>Add user</button></div><div className="minimal-admin-grid"><div className="minimal-admin-table"><table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Device policy</th><th>Last login</th></tr></thead><tbody>{visibleUsers.map((item) => <tr className={selectedId === item.userId ? "selected" : ""} key={item.userId} onClick={() => setSelectedId(item.userId)}><td><b>{item.displayName}</b><small>{item.userId}</small></td><td>{item.role}</td><td>{item.status}</td><td>{item.role === "student" ? item.deviceRegistered ? `Bound · ${item.deviceChangesRemaining}/2 changes left` : `Unbound · ${item.deviceChangesRemaining}/2 changes left` : "Not applicable"}</td><td>{dateLabel(item.lastLoginAt)}</td></tr>)}</tbody></table></div>{selected ? <UserEditor key={selected.userId} user={selected} currentAdminId={user?.userId ?? ""} busy={busy} onSave={saveUser} onAction={accountAction} /> : <aside className="minimal-admin-editor"><p>Select an account to edit it.</p></aside>}</div></section> : <section><div className="minimal-admin-toolbar"><div><h1>Audit log</h1><p>Latest 100 security and account events</p></div><button onClick={() => void refresh()}>Refresh</button></div><div className="minimal-admin-audit"><table><thead><tr><th>Time</th><th>Action</th><th>Target</th><th>Actor</th><th>Detail</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{dateLabel(event.createdAt)}</td><td>{event.action}</td><td>{event.targetUserId}</td><td>{event.actorUserId}</td><td>{event.detail || "—"}</td></tr>)}</tbody></table></div></section>}
    </main>
    {showCreate ? <CreateUser busy={busy} onClose={() => setShowCreate(false)} onSubmit={createUser} /> : null}
  </div>;
}

function UserEditor({ user, currentAdminId, busy, onSave, onAction }: { user: ManagedUser; currentAdminId: string; busy: boolean; onSave: (event: FormEvent<HTMLFormElement>) => void; onAction: (user: ManagedUser, action: "release_device" | "reset_device_changes" | "reset_password", password?: string) => Promise<void> }) {
  const [password, setPassword] = useState(temporaryPassword);
  return <aside className="minimal-admin-editor"><h2>Edit account</h2><form onSubmit={onSave}><input type="hidden" name="originalUserId" value={user.userId} />{user.role === "admin" ? <input type="hidden" name="role" value="faculty" /> : null}{user.userId === currentAdminId ? <input type="hidden" name="status" value="active" /> : null}<label>Display name<input name="displayName" defaultValue={user.displayName} required /></label><label>User ID<input name="userId" defaultValue={user.userId} required pattern="[A-Za-z0-9_-]{3,20}" /></label><label>Role<select name="role" defaultValue={user.role === "admin" ? "faculty" : user.role} disabled={user.role === "admin"}><option value="faculty">Faculty</option><option value="student">Student</option></select>{user.role === "admin" ? <small>Administrator role is protected.</small> : null}</label><label>Status<select name="status" defaultValue={user.status} disabled={user.userId === currentAdminId}><option value="active">Active</option><option value="suspended">Suspended</option></select></label><label className="minimal-admin-check"><input name="mustChangePassword" type="checkbox" defaultChecked={user.mustChangePassword} />Require password change on next login</label><button disabled={busy}>{busy ? "Saving…" : "Save all changes"}</button></form><dl><div><dt>Created</dt><dd>{dateLabel(user.createdAt)}</dd></div><div><dt>Last login</dt><dd>{dateLabel(user.lastLoginAt)}</dd></div></dl><section><h3>Password recovery</h3><label>Temporary password<input value={password} onChange={(event) => setPassword(event.target.value)} /></label><button disabled={busy} onClick={() => void onAction(user, "reset_password", password)}>Reset password</button></section>{user.role === "student" ? <section><h3>Student device</h3><p>{user.deviceRegistered ? `${user.deviceLabel} · registered ${dateLabel(user.deviceRegisteredAt)}` : "No device is currently registered."}</p><p>{user.deviceChangesUsed} of 2 changes used in the rolling six-month window{user.deviceChangeWindowEnds ? ` · next available ${dateLabel(user.deviceChangeWindowEnds)}` : ""}.</p><div><button disabled={busy || !user.deviceRegistered || user.deviceChangesRemaining === 0} onClick={() => void onAction(user, "release_device")}>Release device</button><button disabled={busy || user.deviceChangesUsed === 0} onClick={() => void onAction(user, "reset_device_changes")}>Reset allowance</button></div></section> : <section><h3>Device policy</h3><p>Permanent device registration is disabled for {user.role} accounts.</p></section>}</aside>;
}

function CreateUser({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [password, setPassword] = useState(temporaryPassword);
  return <div className="minimal-admin-dialog"><form onSubmit={onSubmit}><h2>Add user</h2><label>Display name<input name="displayName" required /></label><label>User ID<input name="userId" required pattern="[A-Za-z0-9_-]{3,20}" /></label><label>Role<select name="role"><option value="student">Student</option><option value="faculty">Faculty</option></select></label><label>Temporary password<input name="temporaryPassword" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label><div><button type="button" onClick={onClose}>Cancel</button><button disabled={busy}>{busy ? "Creating…" : "Create"}</button></div></form></div>;
}
