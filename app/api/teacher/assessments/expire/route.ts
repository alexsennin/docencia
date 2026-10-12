import { getDataBackend } from "../../../../../lib/data-backend";
import { hasTeacherSession } from "../../../../../lib/teacher-auth";
import { finalizeExpiredAssessmentAttemptsInPostgres } from "../../../../../lib/exam-attempt-postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  if (getDataBackend() !== "postgres") return Response.json({ error: "Esta operación requiere PostgreSQL." }, { status: 503 });
  try {
    return Response.json({ result: await finalizeExpiredAssessmentAttemptsInPostgres() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron cerrar los intentos vencidos." }, { status: 502 });
  }
}
