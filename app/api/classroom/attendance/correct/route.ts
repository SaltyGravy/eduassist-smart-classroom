import { isSameOrigin } from "../../../../lib/auth";
import { correctAttendance } from "../../../../lib/classroom";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await correctAttendance(request, {
    sessionId: Number(body.sessionId),
    studentUserId: typeof body.studentUserId === "string" ? body.studentUserId : "",
    status: typeof body.status === "string" ? body.status : "",
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ ok: true });
}
