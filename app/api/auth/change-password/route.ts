import { changeOwnPassword, isSameOrigin } from "../../../lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { newPassword?: unknown };
  if (typeof body.newPassword !== "string") return Response.json({ message: "Enter a new password." }, { status: 400 });
  const result = await changeOwnPassword(request, body.newPassword);
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ user: result.user }, { headers: { "cache-control": "no-store" } });
}
