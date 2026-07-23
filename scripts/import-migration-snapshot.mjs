import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { schemaStatements, tableColumns, tableOrder } from "./schema.mjs";

const snapshotPath = resolve(process.argv[2] ?? "data/eduassist-migration.snapshot.json");
const replace = process.argv.includes("--replace");
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) throw new Error("Set TURSO_DATABASE_URL before importing.");
if (!url.startsWith("file:") && !authToken) throw new Error("Set TURSO_AUTH_TOKEN for a remote database.");

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
if (snapshot?.format !== "eduassist-migration-snapshot" || snapshot?.version !== 1) throw new Error("Unsupported migration snapshot.");
for (const table of tableOrder) if (!Array.isArray(snapshot.tables?.[table])) throw new Error(`Snapshot is missing ${table}.`);

const client = createClient({ url, authToken });
try {
  await client.batch(schemaStatements.map((sql) => ({ sql, args: [] })), "write");
  const existingCounts = {};
  for (const table of tableOrder) {
    const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
    existingCounts[table] = Number(result.rows[0]?.count ?? 0);
  }
  if (Object.values(existingCounts).some((count) => count > 0) && !replace) {
    throw new Error("The target database is not empty. Use a fresh Turso database, or pass --replace only after verifying the target.");
  }
  if (replace) {
    for (const table of [...tableOrder].reverse()) await client.execute(`DELETE FROM ${table}`);
  }

  for (const table of tableOrder) {
    const columns = tableColumns[table];
    const rows = snapshot.tables[table];
    const statements = rows.map((row) => ({
      sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      args: columns.map((column) => column === "rotation_seconds" ? row[column] ?? 10 : row[column] ?? null),
    }));
    for (let index = 0; index < statements.length; index += 100) {
      await client.batch(statements.slice(index, index + 100), "write");
    }
  }

  // Cookies and browser-local device IDs cannot cross domains. Invalidate old
  // sessions and allow each student to register the same physical browser once
  // on the new domain without consuming a device-change allowance.
  await client.batch([
    { sql: "DELETE FROM auth_sessions", args: [] },
    { sql: `UPDATE auth_users SET device_hash = NULL, device_label = NULL,
      device_registered_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE role = 'student' AND is_admin = 0`, args: [] },
    { sql: `INSERT INTO auth_system_flags (key, value) VALUES ('vercel_device_cutover_v1', 'student devices re-register on the Vercel domain')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`, args: [] },
    { sql: `INSERT INTO auth_audit_log (actor_user_id, action, target_user_id, detail)
      VALUES ('SYSTEM', 'vercel_migration', 'ALL', 'Database imported; sessions invalidated; student devices prepared for domain cutover')`, args: [] },
  ], "write");

  const counts = {};
  for (const table of tableOrder) {
    const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
    counts[table] = Number(result.rows[0]?.count ?? 0);
  }
  console.log(JSON.stringify({ importedFrom: snapshotPath, sourceExportedAt: snapshot.exportedAt, counts }, null, 2));
} finally {
  client.close();
}
