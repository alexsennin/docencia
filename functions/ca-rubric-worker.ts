import { attachDatabasePool } from "@neon/functions";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { Pool as NodePool } from "pg";
import { backgroundJobs } from "../db/schema.ts";
import { getDatabase, getDatabasePool } from "../db/client.ts";
import { advanceCaRubricJobPostgres } from "../lib/ca-rubric-postgres.ts";

const JOB_TYPE = "ca_rubric_group";
const MAX_STUDENTS_PER_INVOCATION = 6;
let poolAttached = false;

function database() {
  if (process.env.DATABASE_DRIVER !== "pg") {
    throw new Error("La función requiere DATABASE_DRIVER=pg para reutilizar el pool de Node.js.");
  }
  const db = getDatabase();
  if (!poolAttached) {
    attachDatabasePool(getDatabasePool() as NodePool);
    poolAttached = true;
  }
  return db;
}

export async function drainCaRubricQueue(scheduledAt?: string) {
  const db = database();
  let attempted = 0;
  let progressed = 0;
  let blocked: string | undefined;

  while (attempted < MAX_STUDENTS_PER_INVOCATION) {
    const [candidate] = await db.select({ id: backgroundJobs.id, payload: backgroundJobs.payload })
      .from(backgroundJobs)
      .where(and(
        eq(backgroundJobs.type, JOB_TYPE),
        lte(backgroundJobs.runAfter, new Date().toISOString()),
        sql`(${backgroundJobs.status} = 'queued' OR (${backgroundJobs.status} = 'processing' AND (${backgroundJobs.lockedAt} IS NULL OR ${backgroundJobs.lockedAt} < NOW() - INTERVAL '7 minutes')))`
      ))
      .orderBy(asc(backgroundJobs.createdAt))
      .limit(1);

    if (!candidate) break;
    if (!process.env.GEMINI_API_KEY) {
      blocked = "gemini_key_missing";
      break;
    }
    attempted += 1;
    const cursorBefore = Number((candidate.payload as { cursor?: unknown } | null)?.cursor ?? 0);
    const result = await advanceCaRubricJobPostgres(candidate.id);
    const cursorAfter = Number(result?.completed ?? cursorBefore);
    if (cursorAfter > cursorBefore || result?.status === "Completado" || result?.status === "Completado_con_errores") progressed += 1;
    if (cursorAfter <= cursorBefore && result?.status === "En_proceso") break;
  }

  const [remaining] = await db.select({ count: sql<number>`count(*)::int` })
    .from(backgroundJobs)
    .where(and(eq(backgroundJobs.type, JOB_TYPE), sql`${backgroundJobs.status} in ('queued', 'processing')`));

  return {
    ok: true,
    scheduledAt: scheduledAt ?? null,
    attempted,
    progressed,
    remaining: Number(remaining?.count ?? 0),
    ...(blocked ? { blocked } : {}),
  };
}

export async function handleCaRubricWorker(request: Request) {
  if (request.method !== "POST") return Response.json({ error: "Método no permitido." }, { status: 405 });
  if (!request.headers.has("x-neon-trigger-invocation-id")) {
    return Response.json({ error: "Sólo se aceptan invocaciones programadas de Neon." }, { status: 403 });
  }

  let scheduledAt: string | undefined;
  try {
    const body = await request.json() as { data?: { scheduled_at?: unknown } };
    if (typeof body.data?.scheduled_at === "string") scheduledAt = body.data.scheduled_at;
  } catch {
    return Response.json({ error: "El cuerpo del disparador no es JSON válido." }, { status: 400 });
  }

  try {
    const result = await drainCaRubricQueue(scheduledAt);
    console.log(`ca-rubric-worker scheduled_at=${scheduledAt ?? "unknown"} attempted=${result.attempted} progressed=${result.progressed} remaining=${result.remaining}`);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("ca-rubric-worker failed while draining the queue");
    return Response.json({ error: "No se pudo procesar la cola de rúbrica." }, { status: 500 });
  }
}

const caRubricWorker = { fetch: handleCaRubricWorker };
export default caRubricWorker;
