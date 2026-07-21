import { isSameOrigin, manageUser } from "../../../lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await manageUser(request, {
    userId: typeof body.userId === "string" ? body.userId : "",
    action: typeof body.action === "string" ? body.action : "",
    temporaryPassword: typeof body.temporaryPassword === "string" ? body.temporaryPassword : undefined,
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ user: result.user });
}
