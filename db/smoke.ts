import { sql } from "drizzle-orm";
import { closeDatabaseForTests, getDatabase } from "./client.ts";
import { academicPeriods, appConfig, students } from "./schema.ts";

try {
  const db = getDatabase();
  await db.select({ id: students.id }).from(students).limit(0);
  await db.select({ id: academicPeriods.id }).from(academicPeriods).limit(0);
  await db.select({ key: appConfig.key }).from(appConfig).limit(0);
  const tableResult = await db.execute(sql`SELECT count(*)::integer AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`);
  const publicTableCount = Number(tableResult.rows[0]?.count ?? 0);
  const relationResult = await db.execute(sql`SELECT count(*)::integer AS count FROM information_schema.referential_constraints WHERE constraint_schema = 'public'`);
  const foreignKeyCount = Number(relationResult.rows[0]?.count ?? 0);
  let foreignKeyRejectsOrphan = false;
  try {
    await db.execute(sql`INSERT INTO tasks (tarea_id, parcial_id, nombre) VALUES ('__docencia_smoke_fk__', '__missing_partial__', 'smoke')`);
  } catch (error) {
    let databaseError: unknown = error;
    for (let depth = 0; depth < 4 && databaseError; depth++) {
      const wrapped = databaseError as { code?: unknown; cause?: unknown };
      if (wrapped.code === "23503") {
        foreignKeyRejectsOrphan = true;
        break;
      }
      databaseError = wrapped.cause;
    }
  }

  if (publicTableCount < 21) throw new Error(`Se esperaban 21 tablas de Docencia; se encontraron ${publicTableCount}.`);
  if (foreignKeyCount < 32) throw new Error(`Se esperaban 32 relaciones referenciales; se encontraron ${foreignKeyCount}.`);
  if (!foreignKeyRejectsOrphan) throw new Error("PostgreSQL permitió guardar una tarea sin un parcial válido.");

  process.stdout.write(`PostgreSQL respondió mediante Drizzle; ${publicTableCount} tablas públicas, ${foreignKeyCount} relaciones referenciales y rechazo de relaciones huérfanas verificados.\n`);
} finally {
  await closeDatabaseForTests();
}
