import { demoExams } from "../../../../lib/demo-exams";
import { evaluateAutomatic, evaluateOpenWithGemini, toPublicExam } from "../../../../lib/exam-engine";
import { hasSheetsBridge, sheetsBridge } from "../../../../lib/sheets-bridge";
import { hasTeacherSession } from "../../../../lib/teacher-auth";
import { getDataBackend } from "../../../../lib/data-backend";
import { getTeacherPreviewDefinitionInPostgres, listTeacherPreviewOptionsInPostgres } from "../../../../lib/assessment-preview-postgres";
import { deleteAssessmentTemplateDraftInPostgres } from "../../../../lib/assessment-templates-postgres";
import { ExamAuthoringError } from "../../../../lib/exam-authoring-postgres";
import { evaluateOpenAnswerWithGeminiInPostgres } from "../../../../lib/exam-attempt-postgres";
import type { AnswerMap, ExamDefinition } from "../../../../lib/exam-types";

export const dynamic = "force-dynamic";

async function definition(examId: string) {
  if (getDataBackend() === "postgres") {
    if (examId.startsWith("template-")) return getTeacherPreviewDefinitionInPostgres(examId);
    const exam = demoExams.find((item) => item.id === examId);
    if (!exam) throw new Error("Examen de prueba no encontrado.");
    return exam;
  }
  if (hasSheetsBridge()) return (await sheetsBridge<{ exam: ExamDefinition }>("getExamDefinition", { examId })).exam;
  const exam = demoExams.find((item) => item.id === examId);
  if (!exam) throw new Error("Examen no encontrado.");
  return exam;
}

export async function GET(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  try {
    const examId = new URL(request.url).searchParams.get("examId") || "";
    if (!examId) {
      const saved = getDataBackend() === "postgres" ? await listTeacherPreviewOptionsInPostgres() : [];
      return Response.json({ options: [
        ...demoExams.map((item) => ({ id: item.id, label: `${item.grade} · Demostración`, kind: "Demostración", status: "Ejemplo" })),
        ...saved,
      ] }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!/^exam-[123]-esp-1$/.test(examId) && !/^template-[0-9a-f-]{36}$/.test(examId)) return Response.json({ error: "Evaluación no válida." }, { status: 400 });
    return Response.json({ exam: toPublicExam(await definition(examId)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo abrir la prueba." }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  try {
    const body = await request.json() as { examId?: string; answers?: AnswerMap };
    if (!body.examId || (!/^exam-[123]-esp-1$/.test(body.examId) && !/^template-[0-9a-f-]{36}$/.test(body.examId)) || !body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) return Response.json({ error: "Prueba no válida." }, { status: 400 });
    const backend = getDataBackend();
    const exam = await definition(body.examId);
    const result = evaluateAutomatic(exam, body.answers, "vista-docente", "docente");
    for (const question of exam.questions.filter((item) => item.evaluationMethod === "ai" && body.answers?.[item.id])) {
      try {
        const ai = backend === "sheets" && hasSheetsBridge()
          ? (await sheetsBridge<{ evaluation: NonNullable<Awaited<ReturnType<typeof evaluateOpenWithGemini>>> }>("evaluateOpenAnswer", { examId: exam.id, questionId: question.id, answer: body.answers[question.id] })).evaluation
          : backend === "postgres"
            ? await evaluateOpenAnswerWithGeminiInPostgres(exam, question, body.answers[question.id])
            : await evaluateOpenWithGemini(exam, question, body.answers[question.id]);
        const item = result.items.find((entry) => entry.questionId === question.id);
        if (ai && item) {
          item.score = Math.max(0, Math.min(question.maxScore, Number(ai.score) || 0));
          item.status = "correcta";
          item.feedback = ai.feedback || "Evaluación generada por IA.";
          item.strengths = Array.isArray(ai.strengths) ? ai.strengths : [];
          item.opportunities = Array.isArray(ai.opportunities) ? ai.opportunities : [];
        }
      } catch { /* La prueba sigue visible con el reactivo pendiente. */ }
    }
    result.aiPending = result.items.some((item) => item.status === "pendiente_ia");
    result.aiScore = result.items.filter((item) => exam.questions.some((question) => question.id === item.questionId && question.evaluationMethod === "ai")).reduce((sum, item) => sum + (item.score || 0), 0);
    if (!result.aiPending) {
      result.totalScore = result.items.reduce((sum, item) => sum + (item.score || 0), 0);
      result.grade10 = Number(((result.totalScore / result.maxScore) * 10).toFixed(2));
    }
    return Response.json({ result, preview: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "No se pudo evaluar la prueba." }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  if (!(await hasTeacherSession())) return Response.json({ error: "Acceso docente requerido." }, { status: 401 });
  if (getDataBackend() !== "postgres") return Response.json({ error: "Los repositorios de evaluaciones requieren PostgreSQL." }, { status: 503 });
  try {
    const url = new URL(request.url);
    let templateId = url.searchParams.get("examId") || url.searchParams.get("id") || "";
    if (!templateId) {
      const body = await request.json().catch(() => ({})) as { examId?: string; templateId?: string };
      templateId = String(body.templateId ?? body.examId ?? "");
    }
    const result = await deleteAssessmentTemplateDraftInPostgres(templateId);
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar el borrador en prueba." },
      { status: error instanceof ExamAuthoringError ? error.status : 500 },
    );
  }
}
