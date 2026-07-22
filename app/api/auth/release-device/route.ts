import { expiredSessionCookie, isSameOrigin, releaseOwnDevice } from "../../../lib/auth";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ message: "Not allowed." }, { status: 403 });
  const result = await releaseOwnDevice(request);
  if (!result.ok) return Response.json({ message: result.message }, { status: result.status });
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": expiredSessionCookie(request), "cache-control": "no-store" } },
  );
}
