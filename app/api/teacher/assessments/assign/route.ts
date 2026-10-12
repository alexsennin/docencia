import { getDataBackend } from "../../../../../lib/data-backend";
import { hasTeacherSession } from "../../../../../lib/teacher-auth";
import { assignAssessmentInPostgres } from "../../../../../lib/assessment-assignment-postgres";
import { ExamAuthoringError } from "../../../../../lib/exam-authoring-postgres";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  if (getDataBackend() !== "postgres") return Response.json({ error: "La asignación de evaluaciones requiere PostgreSQL." }, { status: 503 });
  try {
    const result = await assignAssessmentInPostgres(await request.json());
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo asignar la evaluación." },
      { status: error instanceof ExamAuthoringError ? error.status : 500 });
  }
}
