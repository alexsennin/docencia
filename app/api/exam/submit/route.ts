import { demoExams } from "../../../../lib/demo-exams";
import { getDataBackend } from "../../../../lib/data-backend";
import { evaluateAutomatic, evaluateOpenWithGemini } from "../../../../lib/exam-engine";
import { ExamWorkflowError, submitExamAttemptInPostgres } from "../../../../lib/exam-attempt-postgres";
import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import { calculateStudentPartial, toGradeSnapshotRow, type AcademicSnapshot } from "../../../../lib/academic-engine";
import { refreshGradeSnapshotsInPostgres } from "../../../../lib/teacher-session-postgres";
import type { AnswerMap, ExamResult } from "../../../../lib/exam-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { attemptId?: string; examId?: string; studentId?: string; answers?: AnswerMap; reason?: string };
    if (!payload.attemptId || !payload.examId || !payload.studentId || !payload.answers) return Response.json({ error: "No se puede enviar un intento incompleto." }, { status: 400 });
    if (getDataBackend() === "postgres") {
      const submitted = await submitExamAttemptInPostgres(payload);
      let academicSyncPending = false;
      try { await refreshGradeSnapshotsInPostgres(submitted.partialId); }
      catch { academicSyncPending = true; }
      return Response.json({ ...submitted, academicSyncPending }, { headers: { "Cache-Control": "no-store" } });
    }
    if (hasSheetsBridge()) {
      const accepted = await sheetsBridge<{ acceptedAt?: string; answers?: AnswerMap; alreadySubmitted?: boolean; result?: ExamResult }>("acceptExamSubmission", payload);
      if (accepted.alreadySubmitted && accepted.result) {
        let academicSyncPending = false;
        try {
          const remote = await sheetsBridge<{ exam: Parameters<typeof evaluateAutomatic>[0] }>("getExamDefinition", { examId: payload.examId });
          await syncStudentGrade_(payload.studentId, String(remote.exam.partialId ?? ""));
        } catch (syncError) {
          console.error("El resultado existe; quedó pendiente sincronizar la matriz académica.", syncError);
          academicSyncPending = true;
        }
        return Response.json({ result: accepted.result, source: "sheets", recovered: true, academicSyncPending });
      }
      const submittedAnswers = accepted.answers ?? payload.answers;
      const remote = await sheetsBridge<{ exam: Parameters<typeof evaluateAutomatic>[0] }>("getExamDefinition", { examId: payload.examId });
      const result = evaluateAutomatic(remote.exam, submittedAnswers, payload.attemptId, payload.studentId);
      await evaluateAi_(remote.exam, submittedAnswers, result, async (question, answer) => {
        const response = await sheetsBridge<{ evaluation: NonNullable<Awaited<ReturnType<typeof evaluateOpenWithGemini>>> }>("evaluateOpenAnswer", {
          examId: payload.examId, questionId: question.id, answer, attemptId: payload.attemptId, studentId: payload.studentId,
        });
        return response.evaluation;
      });
      result.submittedAt = accepted.acceptedAt || result.submittedAt;
      const finalized = await sheetsBridge<{ result?: ExamResult }>("finalizeAttempt", { ...payload, answers: submittedAnswers, result, model: process.env.GEMINI_MODEL || "gemini-3.6-flash" });
      const durableResult = finalized.result ?? result;
      let academicSyncPending = false;
      try {
        await syncStudentGrade_(payload.studentId, String(remote.exam.partialId ?? ""));
      } catch (syncError) {
        console.error("El intento quedó guardado; falló la actualización de la matriz académica.", syncError);
        academicSyncPending = true;
      }
      return Response.json({ result: durableResult, source: "sheets", academicSyncPending });
    }
    const exam = demoExams.find((item) => item.id === payload.examId);
    if (!exam) return Response.json({ error: "Examen no encontrado." }, { status: 404 });
    const result = evaluateAutomatic(exam, payload.answers, payload.attemptId, payload.studentId);
    await evaluateAi_(exam, payload.answers, result);
    return Response.json({ result: result as ExamResult, source: "demo" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo evaluar el examen.", status: error instanceof ExamWorkflowError ? error.status : 500 }, { status: error instanceof ExamWorkflowError ? error.status : 500 });
  }
}

async function syncStudentGrade_(studentId: string | undefined, partialId: string) {
  const snapshot = await sheetsBridge<AcademicSnapshot>("getAcademicSnapshot", {});
  const student = snapshot.students.find((item) => String(item.id ?? "").trim().toUpperCase() === studentId?.trim().toUpperCase());
  const partial = snapshot.partials.find((item) => String(item.parcial_id ?? "") === partialId);
  if (!student || !partial) throw new Error("No se encontró al alumno o parcial para sincronizar la matriz académica.");
  const grade = calculateStudentPartial(snapshot, student, partial);
  await sheetsBridge("saveGradeSnapshot", { rows: [toGradeSnapshotRow(grade)] });
}

async function evaluateAi_(exam: Parameters<typeof evaluateAutomatic>[0], answers: AnswerMap, result: ExamResult, evaluate = evaluateOpenWithGemini) {
  if (evaluate === evaluateOpenWithGemini) return;
  for (const question of exam.questions.filter((item) => item.evaluationMethod === "ai")) {
    const answer = answers[question.id];
    if (!answer) continue;
    try {
      const ai = await evaluate(exam, question, answer);
      if (ai) {
        const item = result.items.find((candidate) => candidate.questionId === question.id);
      if (item) {
        item.score = Math.max(0, Math.min(question.maxScore, Number(ai.score) || 0));
        item.status = "correcta";
        item.feedback = ai.feedback || "Evaluación generada por IA.";
        item.strengths = Array.isArray(ai.strengths) ? ai.strengths : [];
        item.opportunities = Array.isArray(ai.opportunities) ? ai.opportunities : [];
      }
      }
    } catch {
      // Keep the item pending so the teacher can review it rather than inventing a grade.
    }
  }
  const aiItems = result.items.filter((item) => item.status !== "pendiente_ia").filter((item) => exam.questions.find((question) => question.id === item.questionId)?.evaluationMethod === "ai");
  const pending = result.items.some((item) => item.status === "pendiente_ia");
  result.aiScore = aiItems.reduce((sum, item) => sum + (item.score ?? 0), 0);
  result.aiPending = pending;
  if (!pending) { result.totalScore = result.items.reduce((sum, item) => sum + (item.score ?? 0), 0); result.grade10 = Number(((result.totalScore / result.maxScore) * 10).toFixed(2)); }
}
