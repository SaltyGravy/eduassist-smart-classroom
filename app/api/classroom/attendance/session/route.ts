import { getAttendanceSession } from "../../../../lib/classroom";

export async function GET(request: Request) {
  const sessionId = Number(new URL(request.url).searchParams.get("sessionId"));
  if (!Number.isInteger(sessionId) || sessionId < 1) return Response.json({ message: "Choose an attendance session." }, { status: 400 });
  const result = await getAttendanceSession(request, sessionId);
  if (!result) return Response.json({ message: "Attendance session not found." }, { status: 404 });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
