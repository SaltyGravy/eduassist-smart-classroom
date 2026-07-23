import { createClass, deleteClass, listClasses, updateClass } from "../../../lib/classroom";
import { isSameOrigin } from "../../../lib/auth";

export async function GET(request: Request) {
  const result = await listClasses(request);
  if (!result) return Response.json({ message: "Faculty or student access is required." }, { status: 403 });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await createClass(request, {
    subjectName: typeof body.subjectName === "string" ? body.subjectName : "",
    subjectCode: typeof body.subjectCode === "string" ? body.subjectCode : "",
    semester: typeof body.semester === "string" ? body.semester : "",
    section: typeof body.section === "string" ? body.section : "",
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ classroom: result.classroom }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await updateClass(request, {
    classId: typeof body.classId === "number" ? body.classId : Number(body.classId),
    subjectName: typeof body.subjectName === "string" ? body.subjectName : "",
    subjectCode: typeof body.subjectCode === "string" ? body.subjectCode : "",
    semester: typeof body.semester === "string" ? body.semester : "",
    section: typeof body.section === "string" ? body.section : "",
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ classroom: result.classroom });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await deleteClass(request, {
    classId: typeof body.classId === "number" ? body.classId : Number(body.classId),
    confirmationCode: typeof body.confirmationCode === "string" ? body.confirmationCode : "",
  });
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json({ className: result.className, removed: result.removed });
}
