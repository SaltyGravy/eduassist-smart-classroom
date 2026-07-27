import {
  createManagedUser,
  editManagedUser,
  getAppDatabase,
  getManagedSystemSettings,
  isAdminBridgeRequest,
  listAuditEvents,
  listManagedUsers,
  manageUser,
  updateManagedSystemSettings,
  verifyAdminCredentials,
} from "../../../lib/auth";

const migrationTables = [
  "auth_users",
  "auth_sessions",
  "auth_audit_log",
  "auth_system_flags",
  "auth_device_changes",
  "classroom_classes",
  "class_enrolments",
  "attendance_sessions",
  "attendance_records",
] as const;

export async function POST(request: Request) {
  if (!(await isAdminBridgeRequest(request))) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "export_migration_snapshot") {
    const db = await getAppDatabase();
    const tables: Record<string, unknown[]> = {};
    for (const table of migrationTables) {
      const result = await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
      tables[table] = result.results ?? [];
    }
    return Response.json({
      format: "eduassist-migration-snapshot",
      version: 1,
      exportedAt: new Date().toISOString(),
      tables,
    }, { headers: { "cache-control": "no-store" } });
  }

  if (action === "authenticate") {
    const admin = await verifyAdminCredentials(
      typeof body.userId === "string" ? body.userId : "",
      typeof body.password === "string" ? body.password : "",
    );
    if (!admin) return Response.json({ message: "The administrator ID or password is incorrect." }, { status: 401 });
    return Response.json({ admin });
  }

  if (action === "list_users") {
    const result = await listManagedUsers(request);
    if (!result) return Response.json({ message: "Administrator access is required." }, { status: 403 });
    return Response.json(result);
  }

  if (action === "list_audit") {
    const events = await listAuditEvents(request);
    if (!events) return Response.json({ message: "Administrator access is required." }, { status: 403 });
    return Response.json({ events });
  }

  if (action === "get_settings") {
    const settings = await getManagedSystemSettings(request);
    if (!settings) return Response.json({ message: "Administrator access is required." }, { status: 403 });
    return Response.json({ settings });
  }

  if (action === "update_settings") {
    const result = await updateManagedSystemSettings(request, {
      qrRotationSeconds: typeof body.qrRotationSeconds === "number" ? body.qrRotationSeconds : Number.NaN,
    });
    if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
    return Response.json({ settings: result.settings });
  }

  if (action === "create_user") {
    const result = await createManagedUser(request, {
      userId: typeof body.userId === "string" ? body.userId : "",
      displayName: typeof body.displayName === "string" ? body.displayName : "",
      role: typeof body.role === "string" ? body.role : "",
      department: typeof body.department === "string" ? body.department : "",
      section: typeof body.section === "string" ? body.section : "",
      rollNumber: typeof body.rollNumber === "string" ? body.rollNumber : "",
      semester: typeof body.semester === "string" ? body.semester : "",
      temporaryPassword: typeof body.temporaryPassword === "string" ? body.temporaryPassword : "",
    });
    if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
    return Response.json({ user: result.user, initialPassword: result.initialPassword }, { status: 201 });
  }

  if (action === "edit_user") {
    const result = await editManagedUser(request, {
      originalUserId: typeof body.originalUserId === "string" ? body.originalUserId : "",
      userId: typeof body.userId === "string" ? body.userId : "",
      displayName: typeof body.displayName === "string" ? body.displayName : "",
      role: typeof body.role === "string" ? body.role : "",
      department: typeof body.department === "string" ? body.department : "",
      section: typeof body.section === "string" ? body.section : "",
      rollNumber: typeof body.rollNumber === "string" ? body.rollNumber : "",
      semester: typeof body.semester === "string" ? body.semester : "",
      status: typeof body.status === "string" ? body.status : "",
      mustChangePassword: body.mustChangePassword === true,
    });
    if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
    return Response.json({ user: result.user });
  }

  if (action === "manage_user") {
    const result = await manageUser(request, {
      userId: typeof body.userId === "string" ? body.userId : "",
      action: typeof body.userAction === "string" ? body.userAction : "",
      temporaryPassword: typeof body.temporaryPassword === "string" ? body.temporaryPassword : undefined,
    });
    if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
    return Response.json({ user: result.user });
  }

  return Response.json({ message: "Unsupported administration action." }, { status: 400 });
}
