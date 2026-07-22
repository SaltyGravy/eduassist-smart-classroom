import { createClient, type Client, type InArgs, type InStatement, type ResultSet } from "@libsql/client";

export type AppQueryResult<T = Record<string, unknown>> = {
  results: T[];
  success: true;
  meta: {
    changes: number;
    last_row_id: number;
  };
};

export class AppPreparedStatement {
  constructor(
    private readonly client: Client,
    readonly sql: string,
    readonly args: InArgs = [],
  ) {}

  bind(...args: unknown[]) {
    return new AppPreparedStatement(this.client, this.sql, args as InArgs);
  }

  statement(): InStatement {
    return { sql: this.sql, args: this.args };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const result = await this.client.execute(this.statement());
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<AppQueryResult<T>> {
    return mapResult<T>(await this.client.execute(this.statement()));
  }

  async run(): Promise<AppQueryResult> {
    return mapResult(await this.client.execute(this.statement()));
  }
}

export class AppDatabase {
  constructor(private readonly client: Client) {}

  prepare(sql: string) {
    return new AppPreparedStatement(this.client, sql);
  }

  async batch(statements: AppPreparedStatement[]) {
    const results = await this.client.batch(statements.map((statement) => statement.statement()), "write");
    return results.map((result) => mapResult(result));
  }
}

let client: Client | null = null;
let database: AppDatabase | null = null;

export function getDatabaseClient() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("EduAssist requires TURSO_DATABASE_URL.");
  if (!url.startsWith("file:") && !authToken) throw new Error("EduAssist requires TURSO_AUTH_TOKEN for a remote database.");
  client = createClient({ url, authToken });
  return client;
}

export function getDatabase() {
  if (!database) database = new AppDatabase(getDatabaseClient());
  return database;
}

function mapResult<T = Record<string, unknown>>(result: ResultSet): AppQueryResult<T> {
  const lastInsertRowid = result.lastInsertRowid;
  return {
    results: result.rows as unknown as T[],
    success: true,
    meta: {
      changes: result.rowsAffected,
      last_row_id: typeof lastInsertRowid === "bigint" ? Number(lastInsertRowid) : Number(lastInsertRowid ?? 0),
    },
  };
}
