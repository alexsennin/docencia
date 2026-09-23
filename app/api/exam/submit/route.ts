import { demoExams } from "../../../../lib/demo-exams";
import { evaluateAutomatic, evaluateOpenWithGemini } from "../../../../lib/exam-engine";
import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import type { AnswerMap, ExamResult } from "../../../../lib/exam-types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { attemptId?: string; examId?: string; studentId?: string; answers?: AnswerMap; reason?: string };
    if (!payload.attemptId || !payload.examId || !payload.studentId || !payload.answers) return Response.json({ error: "No se puede enviar un intento incompleto." }, { status: 400 });
    if (hasSheetsBridge()) {
      const remote = await sheetsBridge<{ exam: Parameters<typeof evaluateAutomatic>[0] }>("getExamDefinition", { examId: payload.examId });
      const result = evaluateAutomatic(remote.exam, payload.answers, payload.attemptId, payload.studentId);
      await evaluateAi_(remote.exam, payload.answers, result);
      await sheetsBridge("finalizeAttempt", { ...payload, result, model: process.env.GEMINI_MODEL || "gemini-3.6-flash" });
      return Response.json({ result, source: "sheets" });
    }
    const exam = demoExams.find((item) => item.id === payload.examId);
    if (!exam) return Response.json({ error: "Examen no encontrado." }, { status: 404 });
    const result = evaluateAutomatic(exam, payload.answers, payload.attemptId, payload.studentId);
    await evaluateAi_(exam, payload.answers, result);
    return Response.json({ result: result as ExamResult, source: "demo" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo evaluar el examen." }, { status: 500 });
  }
}

async function evaluateAi_(exam: Parameters<typeof evaluateAutomatic>[0], answers: AnswerMap, result: ExamResult) {
  if (!process.env.GEMINI_API_KEY) return;
  for (const question of exam.questions.filter((item) => item.evaluationMethod === "ai")) {
    const answer = answers[question.id];
    if (!answer) continue;
    try {
      const ai = await evaluateOpenWithGemini(exam, question, answer);
      if (ai) {
        const item = result.items.find((candidate) => candidate.questionId === question.id);
        if (item) { item.score = Math.max(0, Math.min(question.maxScore, Number(ai.score) || 0)); item.status = "correcta"; item.feedback = ai.feedback || "Evaluación generada por IA."; }
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
