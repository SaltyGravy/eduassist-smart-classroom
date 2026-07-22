import { createClient } from "@libsql/client";
import { tableOrder } from "./schema.mjs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) throw new Error("Set TURSO_DATABASE_URL before verification.");
const client = createClient({ url, authToken });
try {
  const counts = {};
  for (const table of tableOrder) {
    const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
    counts[table] = Number(result.rows[0]?.count ?? 0);
  }
  const foreignKeys = await client.execute("PRAGMA foreign_key_check");
  const integrity = await client.execute("PRAGMA integrity_check");
  const result = {
    counts,
    foreignKeyErrors: foreignKeys.rows,
    integrity: integrity.rows[0]?.integrity_check ?? null,
    ok: foreignKeys.rows.length === 0 && integrity.rows[0]?.integrity_check === "ok",
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  client.close();
}
