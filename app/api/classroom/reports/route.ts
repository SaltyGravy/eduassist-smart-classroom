import { getReports } from "../../../lib/classroom";

export async function GET(request: Request) {
  const classIdValue = new URL(request.url).searchParams.get("classId");
  const result = await getReports(request, classIdValue ? Number(classIdValue) : undefined);
  if (!result) return Response.json({ message: "Faculty or student access is required." }, { status: 403 });
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
