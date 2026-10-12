import { getAssessmentTemplateInPostgres, listAssessmentTemplatesInPostgres } from "./assessment-templates-postgres.ts";
import type { ExamDefinition, ExamQuestion } from "./exam-types.ts";

export async function listTeacherPreviewOptionsInPostgres() {
  const [exams, activities] = await Promise.all([
    listAssessmentTemplatesInPostgres("Examen"),
    listAssessmentTemplatesInPostgres("Actividad"),
  ]);
  return [...exams, ...activities].map((item) => ({
    id: item.id, label: `${item.name} · v${item.version} · ${item.status}`,
    kind: item.kind, status: item.status,
  }));
}

export async function getTeacherPreviewDefinitionInPostgres(templateId: string): Promise<ExamDefinition> {
  const template = await getAssessmentTemplateInPostgres(templateId);
  return {
    id: template.id,
    partialId: "vista-docente",
    name: template.name,
    subject: template.subject || "Español",
    grade: template.grade || "",
    group: "TODOS",
    status: template.status === "Aprobada" ? "Publicado" : "Borrador",
    durationMinutes: template.durationMinutes ?? 0,
    maxScore: template.questions.reduce((sum, question) => sum + Number(question.maxScore), 0),
    requiresFullscreen: template.lockOnFocusLoss,
    purpose: template.kind === "Actividad" ? "Actividad" : "Examen",
    timeMode: template.timeMode === "Libre" ? "Libre" : "Estricto",
    lockOnFocusLoss: template.lockOnFocusLoss,
    policyVersion: "v1",
    instructions: template.instructions,
    questions: template.questions.map((question): ExamQuestion => ({
      id: question.id,
      order: question.order,
      topic: question.topic || "Español",
      type: question.type as ExamQuestion["type"],
      prompt: question.prompt,
      options: (Array.isArray(question.options) ? question.options : []).map((option, index) => ({
        value: String.fromCharCode(65 + index), label: String(option),
      })),
      correctAnswer: typeof question.correctAnswer === "string" || Array.isArray(question.correctAnswer)
        ? question.correctAnswer as string | string[] : undefined,
      maxScore: Number(question.maxScore),
      evaluationMethod: question.evaluationMethod === "ai" ? "ai" : "automatic",
      rubric: question.rubric ? JSON.parse(question.rubric) as ExamQuestion["rubric"] : undefined,
    })),
  };
}
