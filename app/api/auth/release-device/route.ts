import { expiredSessionCookie, isSameOrigin, releaseOwnDevice } from "../../../lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const user = await releaseOwnDevice(request);
  if (!user) return Response.json({ message: "Your session has expired." }, { status: 401 });
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": expiredSessionCookie(request), "cache-control": "no-store" } },
  );
}
