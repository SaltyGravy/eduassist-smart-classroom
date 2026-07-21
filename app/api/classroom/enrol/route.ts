import { isSameOrigin } from "../../../lib/auth";
import { enrolStudent } from "../../../lib/classroom";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await enrolStudent(request, {
    classId: Number(body.classId),
    studentUserId: typeof body.studentUserId === "string" ? body.studentUserId : "",
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json(result);
}
