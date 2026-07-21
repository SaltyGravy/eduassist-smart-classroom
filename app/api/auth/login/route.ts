import { isSameOrigin, loginWithDevice, type AuthRole } from "../../../lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ message: "Cross-site login requests are not allowed." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ message: "Enter your user ID and password." }, { status: 400 });
  }

  const role = body.role === "faculty" || body.role === "student" ? (body.role as AuthRole) : null;
  if (!role || typeof body.userId !== "string" || typeof body.password !== "string" || typeof body.deviceId !== "string") {
    return Response.json({ message: "Complete all login fields." }, { status: 400 });
  }

  const result = await loginWithDevice({
    request,
    role,
    userId: body.userId,
    password: body.password,
    deviceId: body.deviceId,
    deviceLabel: typeof body.deviceLabel === "string" ? body.deviceLabel : "Registered browser",
  });

  if (!result.ok) {
    return Response.json({ code: result.code, message: result.message }, { status: result.status });
  }

  return Response.json(
    { user: result.user, registeredNow: result.registeredNow },
    { headers: { "set-cookie": result.cookie, "cache-control": "no-store" } },
  );
}
