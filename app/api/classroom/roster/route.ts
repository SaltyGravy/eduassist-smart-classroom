import { getClassRoster } from "../../../lib/classroom";

export async function GET(request: Request) {
  const classId = Number(new URL(request.url).searchParams.get("classId"));
  if (!Number.isInteger(classId) || classId < 1) return Response.json({ message: "Choose a class." }, { status: 400 });
  const result = await getClassRoster(request, classId);
  if (!result) return Response.json({ message: "Class not found or faculty access is required." }, { status: 404 });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
