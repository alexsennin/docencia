import "server-only";
import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNode, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool as NodePool } from "pg";
import * as schema from "./schema.ts";

type Database = NodePgDatabase<typeof schema>;
type Pool = NodePool | NeonPool;
type CachedDatabase = {
  driver: "pg" | "neon";
  db: Database;
  pool: Pool;
};

const globalForDb = globalThis as unknown as { docenciaDatabase?: CachedDatabase };

function getDatabaseDriver(connectionString: string): "pg" | "neon" {
  const configuredDriver = process.env.DATABASE_DRIVER;
  if (configuredDriver === "pg" || configuredDriver === "neon") return configuredDriver;
  if (configuredDriver) throw new Error("DATABASE_DRIVER debe ser 'pg' o 'neon'.");

  const hostname = new URL(connectionString).hostname;
  return hostname.endsWith(".neon.tech") ? "neon" : "pg";
}

function nodePgConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  if (url.hostname.endsWith(".neon.tech") && ["prefer", "require", "verify-ca"].includes(url.searchParams.get("sslmode") ?? "")) {
    url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  }
  return connectionString;
}

export function getDatabase(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL no está configurada en el servidor.");

  const driver = getDatabaseDriver(connectionString);
  const cached = globalForDb.docenciaDatabase;
  if (cached?.driver === driver) return cached.db;

  const pool = driver === "neon"
    ? new NeonPool({ connectionString, max: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 5_000 })
    : new NodePool({ connectionString: nodePgConnectionString(connectionString), max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000 });
  const db = driver === "neon"
    ? drizzleNeon(pool as NeonPool, { schema }) as unknown as Database
    : drizzleNode(pool as NodePool, { schema });

  globalForDb.docenciaDatabase = { driver, db, pool };
  return db;
}

export function getDatabasePool(): Pool {
  getDatabase();
  return globalForDb.docenciaDatabase!.pool;
}

export async function closeDatabaseForTests(): Promise<void> {
  const cached = globalForDb.docenciaDatabase;
  if (!cached) return;
  globalForDb.docenciaDatabase = undefined;
  await cached.pool.end();
}
