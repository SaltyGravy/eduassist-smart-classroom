import { isSameOrigin } from "../../../lib/auth";
import { joinClass } from "../../../lib/classroom";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await joinClass(request, typeof body.classCode === "string" ? body.classCode : "");
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json(result);
}
