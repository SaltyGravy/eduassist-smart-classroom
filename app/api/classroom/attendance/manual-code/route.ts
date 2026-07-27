import { isSameOrigin } from "../../../../lib/auth";
import { enableManualAttendanceCode } from "../../../../lib/classroom";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionId = Number(body.sessionId);
  if (!Number.isInteger(sessionId) || sessionId < 1) {
    return Response.json({ message: "Choose an active attendance session." }, { status: 400 });
  }
  const result = await enableManualAttendanceCode(request, sessionId);
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ attendanceSession: result.attendanceSession });
}
