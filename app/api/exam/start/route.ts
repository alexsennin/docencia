import { demoExams, demoStudents } from "../../../../lib/demo-exams";
import { getDataBackend } from "../../../../lib/data-backend";
import { toPublicExam } from "../../../../lib/exam-engine";
import { ExamWorkflowError, startExamAttemptInPostgres } from "../../../../lib/exam-attempt-postgres";
import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { studentId?: string; examId?: string };
    if (!body.studentId || !body.examId) return Response.json({ error: "Faltan datos para iniciar el examen." }, { status: 400 });
    if (getDataBackend() === "postgres") return Response.json({ ...(await startExamAttemptInPostgres(body)), source: "postgres" });
    if (hasSheetsBridge()) return Response.json({ ...(await sheetsBridge<Record<string, unknown>>("startAttempt", body)), source: "sheets" });
    const student = demoStudents.find((item) => item.id.toUpperCase() === body.studentId?.toUpperCase());
    const exam = demoExams.find((item) => item.id === body.examId);
    if (!student || !exam || exam.grade !== student.grade || (exam.group !== "TODOS" && exam.group !== student.group)) return Response.json({ error: "El examen no está asignado a este alumno." }, { status: 403 });
    const startedAt = new Date();
    const deadlineAt = new Date(startedAt.getTime() + exam.durationMinutes * 60_000);
    return Response.json({ attemptId: `demo-attempt-${crypto.randomUUID()}`, startedAt: startedAt.toISOString(), deadlineAt: deadlineAt.toISOString(), exam: toPublicExam(exam), source: "demo" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo iniciar el examen." }, { status: error instanceof ExamWorkflowError ? error.status : 500 });
  }
}
