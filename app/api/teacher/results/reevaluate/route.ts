import { hasSheetsBridge, sheetsBridge } from "../../../../../lib/sheets-bridge";
import { hasTeacherSession } from "../../../../../lib/teacher-auth";
import type { AcademicSnapshot } from "../../../../../lib/academic-engine";
import { calculateStudentPartial, toGradeSnapshotRow } from "../../../../../lib/academic-engine";
import { getDataBackend } from "../../../../../lib/data-backend";
import { ExamWorkflowError, reevaluateOpenAnswerInPostgres } from "../../../../../lib/exam-attempt-postgres";
import { refreshGradeSnapshotsInPostgres } from "../../../../../lib/teacher-session-postgres";

export const dynamic = "force-dynamic";

type ReevaluateResult = {
  ok: boolean;
  attemptId: string;
  studentId: string;
  examId: string;
  partialId: string;
  questionId: string;
  aiPending: boolean;
};

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });

  try {
    const body = await request.json() as { attemptId?: string; questionId?: string };
    if (!body.attemptId?.trim() || !body.questionId?.trim()) return Response.json({ error: "Intento y reactivo son obligatorios." }, { status: 400 });

    if (getDataBackend() === "postgres") {
      const result = await reevaluateOpenAnswerInPostgres({ attemptId: body.attemptId.trim(), questionId: body.questionId.trim() });
      let academicSyncPending = false;
      try {
        if (result?.partialId) await refreshGradeSnapshotsInPostgres(result.partialId);
        else academicSyncPending = true;
      }
      catch { academicSyncPending = true; }
      return Response.json({ result, academicSyncPending }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!hasSheetsBridge()) return Response.json({ error: "No está configurada la conexión con Google Sheets." }, { status: 503 });

    const result = await sheetsBridge<ReevaluateResult>("reevaluatePendingAnswer", {
      attemptId: body.attemptId.trim(),
      questionId: body.questionId.trim(),
    });

    const snapshot = await sheetsBridge<AcademicSnapshot>("getAcademicSnapshot", {});
    const student = snapshot.students.find((item) => String(item.id ?? "").trim().toUpperCase() === result.studentId.trim().toUpperCase());
    const partial = snapshot.partials.find((item) => String(item.parcial_id ?? "") === String(result.partialId ?? ""));
    if (student && partial) {
      const grade = calculateStudentPartial(snapshot, student, partial);
      await sheetsBridge("saveGradeSnapshot", { rows: [toGradeSnapshotRow(grade)] });
    }

    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo re-evaluar el reactivo." }, { status: error instanceof ExamWorkflowError ? error.status : 502 });
  }
}
