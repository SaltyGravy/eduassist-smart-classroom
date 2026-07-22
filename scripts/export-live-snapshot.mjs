import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const baseUrl = process.env.CLASSROOM_API_URL;
const secret = process.env.ADMIN_BRIDGE_SECRET;
const outputPath = resolve(process.argv[2] ?? "data/eduassist-migration.snapshot.json");

if (!baseUrl) throw new Error("Set CLASSROOM_API_URL to the current classroom site URL.");
if (!secret || secret.length < 32) throw new Error("Set ADMIN_BRIDGE_SECRET to the current bridge secret.");

const response = await fetch(new URL("/api/bridge/admin", baseUrl), {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
  body: JSON.stringify({ action: "export_migration_snapshot" }),
});

if (!response.ok) throw new Error(`Snapshot export failed (${response.status}): ${await response.text()}`);
const snapshot = await response.json();
if (snapshot?.format !== "eduassist-migration-snapshot" || snapshot?.version !== 1) throw new Error("The server returned an unsupported snapshot.");

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
const counts = Object.fromEntries(Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length]));
console.log(JSON.stringify({ outputPath, exportedAt: snapshot.exportedAt, counts }, null, 2));
