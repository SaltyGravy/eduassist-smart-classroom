import { expiredSessionCookie, isSameOrigin, logoutSession } from "../../../lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  await logoutSession(request);
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": expiredSessionCookie(request), "cache-control": "no-store" } },
  );
}
