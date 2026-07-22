import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { getDatabaseClient } from "./client";

export function getDb() {
  return drizzle(getDatabaseClient(), { schema });
}
