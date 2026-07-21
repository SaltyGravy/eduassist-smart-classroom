import { isSameOrigin } from "../../../../lib/auth";
import { startAttendance } from "../../../../lib/classroom";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await startAttendance(request, { classId: Number(body.classId), durationMinutes: Number(body.durationMinutes) });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ attendanceSession: result.attendanceSession }, { status: 201 });
}
