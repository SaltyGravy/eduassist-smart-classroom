import { createManagedUser, isSameOrigin, listManagedUsers } from "../../../lib/auth";

export async function GET(request: Request) {
  const result = await listManagedUsers(request);
  if (!result) return Response.json({ message: "Administrator access is required." }, { status: 403 });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await createManagedUser(request, {
    userId: typeof body.userId === "string" ? body.userId : "",
    displayName: typeof body.displayName === "string" ? body.displayName : "",
    role: typeof body.role === "string" ? body.role : "",
    temporaryPassword: typeof body.temporaryPassword === "string" ? body.temporaryPassword : "",
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ user: result.user }, { status: 201 });
}
