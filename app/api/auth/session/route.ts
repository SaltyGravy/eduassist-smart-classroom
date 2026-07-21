import { getSession } from "../../../lib/auth";

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session) {
    return Response.json({ user: null }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  return Response.json({ user: session.user }, { headers: { "cache-control": "no-store" } });
}
