import { listAuditEvents } from "../../../lib/auth";

export async function GET(request: Request) {
  const events = await listAuditEvents(request);
  if (!events) return Response.json({ message: "Administrator access is required." }, { status: 403 });
  return Response.json({ events }, { headers: { "cache-control": "no-store" } });
}
