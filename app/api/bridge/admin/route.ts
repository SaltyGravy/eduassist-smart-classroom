import {
  createManagedUser,
  editManagedUser,
  isAdminBridgeRequest,
  listAuditEvents,
  listManagedUsers,
  manageUser,
  verifyAdminCredentials,
} from "../../../lib/auth";

export async function POST(request: Request) {
  if (!(await isAdminBridgeRequest(request))) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

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

  if (action === "create_user") {
    const result = await createManagedUser(request, {
      userId: typeof body.userId === "string" ? body.userId : "",
      displayName: typeof body.displayName === "string" ? body.displayName : "",
      role: typeof body.role === "string" ? body.role : "",
      temporaryPassword: typeof body.temporaryPassword === "string" ? body.temporaryPassword : "",
    });
    if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
    return Response.json({ user: result.user }, { status: 201 });
  }

  if (action === "edit_user") {
    const result = await editManagedUser(request, {
      originalUserId: typeof body.originalUserId === "string" ? body.originalUserId : "",
      userId: typeof body.userId === "string" ? body.userId : "",
      displayName: typeof body.displayName === "string" ? body.displayName : "",
      role: typeof body.role === "string" ? body.role : "",
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
