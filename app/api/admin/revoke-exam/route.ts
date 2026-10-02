import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import { calculateStudentPartial, toGradeSnapshotRow, type AcademicSnapshot } from "../../../../lib/academic-engine";
import { hasTeacherSession } from "../../../../lib/teacher-auth";
import { getDataBackend } from "../../../../lib/data-backend";
import { ExamWorkflowError, revokeExamAttemptsInPostgres } from "../../../../lib/exam-attempt-postgres";
import { refreshGradeSnapshotsInPostgres } from "../../../../lib/teacher-session-postgres";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Inicia sesión como docente." }, { status: 401 });
  try {
    const payload = await request.json() as { studentId?: string; examId?: string };
    if (!payload.studentId?.trim() || !payload.examId?.trim()) {
      return Response.json({ error: "Alumno y examen son obligatorios." }, { status: 400 });
    }
    if (getDataBackend() === "postgres") {
      const result = await revokeExamAttemptsInPostgres({ studentId: payload.studentId, examId: payload.examId });
      let academicSyncPending = false;
      try { await refreshGradeSnapshotsInPostgres(result.partialId); }
      catch { academicSyncPending = true; }
      return Response.json({ result, source: "postgres", academicSyncPending }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!hasSheetsBridge()) return Response.json({ error: "La administración requiere el puente seguro con Google Sheets." }, { status: 503 });
    const result = await sheetsBridge("revokeExam", {
      studentId: payload.studentId.trim(),
      examId: payload.examId.trim(),
    });
    const snapshot = await sheetsBridge<AcademicSnapshot>("getAcademicSnapshot", {});
    const student = snapshot.students.find((item) => String(item.id ?? "").trim().toUpperCase() === payload.studentId?.trim().toUpperCase());
    const exam = snapshot.exams.find((item) => String(item.examen_id ?? "") === payload.examId);
    const partial = snapshot.partials.find((item) => String(item.parcial_id ?? "") === String(exam?.parcial_id ?? ""));
    if (student && partial) {
      const grade = calculateStudentPartial(snapshot, student, partial);
      await sheetsBridge("saveGradeSnapshot", { rows: [toGradeSnapshotRow(grade)] });
    }
    return Response.json({ result, source: "sheets" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo revocar el examen.", status: error instanceof ExamWorkflowError ? error.status : 500 }, { status: error instanceof ExamWorkflowError ? error.status : 500 });
  }
}
