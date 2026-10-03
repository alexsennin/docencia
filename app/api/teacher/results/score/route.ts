import { hasTeacherSession } from "../../../../../lib/teacher-auth";
import { ExamWorkflowError, updateManualExamScoresInPostgres } from "../../../../../lib/exam-attempt-postgres";
import { refreshGradeSnapshotsInPostgres } from "../../../../../lib/teacher-session-postgres";
import { getDataBackend } from "../../../../../lib/data-backend";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  if (getDataBackend() !== "postgres") return Response.json({ error: "La edición manual sólo está disponible con PostgreSQL." }, { status: 503 });
  try {
    const body = await request.json() as { attemptId?: string; scores?: Array<{ questionId?: string; score?: number }>; reason?: string };
    const result = await updateManualExamScoresInPostgres(body);
    let academicSyncPending = false;
    try { await refreshGradeSnapshotsInPostgres(result.partialId); }
    catch { academicSyncPending = true; }
    return Response.json({ result, academicSyncPending }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudieron guardar los puntajes." }, { status: error instanceof ExamWorkflowError ? error.status : 502 });
  }
}
