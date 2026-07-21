import { facultyResetStudentDevice, isSameOrigin } from "../../../lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { userId?: unknown };
  if (typeof body.userId !== "string") return Response.json({ message: "Student ID is required." }, { status: 400 });
  const result = await facultyResetStudentDevice(request, body.userId);
  if (!result.authorized) return Response.json({ message: "Faculty access is required." }, { status: 403 });
  if (!result.found) return Response.json({ message: "No student account was found for that ID." }, { status: 404 });
  return Response.json({ ok: true, displayName: result.displayName });
}
