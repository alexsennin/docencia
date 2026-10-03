import { hasTeacherSession } from "../../../../../lib/teacher-auth";
import { ExamWorkflowError, finalizeExamAttemptByTeacherInPostgres } from "../../../../../lib/exam-attempt-postgres";
import { refreshGradeSnapshotsInPostgres } from "../../../../../lib/teacher-session-postgres";
import { getDataBackend } from "../../../../../lib/data-backend";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  if (getDataBackend() !== "postgres") return Response.json({ error: "La finalización docente sólo está disponible con PostgreSQL." }, { status: 503 });
  try {
    const body = await request.json() as { attemptId?: string };
    const result = await finalizeExamAttemptByTeacherInPostgres(body);
    let academicSyncPending = false;
    try { if (result.partialId) await refreshGradeSnapshotsInPostgres(result.partialId); }
    catch { academicSyncPending = true; }
    return Response.json({ result, academicSyncPending }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo finalizar el examen." }, { status: error instanceof ExamWorkflowError ? error.status : 502 });
  }
}
