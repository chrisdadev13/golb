import { mkdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const DB_DIR = join(os.homedir(), ".golb");
const DB_PATH = join(DB_DIR, "data.db");

let _db: LibSQLDatabase<typeof schema> | null = null;

export function getDb(): LibSQLDatabase<typeof schema> {
  if (!_db) {
    mkdirSync(DB_DIR, { recursive: true });
    _db = drizzle({
      connection: `file:${DB_PATH}`,
      schema,
    });
  }
  return _db;
}

export async function migrateDb(): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder: join(import.meta.dir, "drizzle") });
}
