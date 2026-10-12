import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/client.ts";
import { assessmentTemplateQuestions, assessmentTemplates, auditEvents } from "../db/schema.ts";
import { ExamAuthoringError, validateDraft } from "./exam-authoring-postgres.ts";

export type AssessmentKind = "Examen" | "Actividad";
export type TimeMode = "Estricto" | "Libre";

function policy(input: { timeMode?: unknown; durationMinutes?: unknown; lockOnFocusLoss?: unknown }) {
  const timeMode = input.timeMode === "Libre" ? "Libre" as const : input.timeMode === "Estricto" ? "Estricto" as const : null;
  const durationMinutes = Number(input.durationMinutes);
  if (!timeMode || (timeMode === "Estricto" && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240))) {
    throw new ExamAuthoringError("Selecciona tiempo Estricto (1–240 minutos) o Libre.");
  }
  if (typeof input.lockOnFocusLoss !== "boolean") throw new ExamAuthoringError("Selecciona si se aplicará el bloqueo de pantalla.");
  return { timeMode, durationMinutes: timeMode === "Estricto" ? durationMinutes : null, lockOnFocusLoss: input.lockOnFocusLoss };
}

export async function listAssessmentTemplatesInPostgres(kind: AssessmentKind) {
  if (kind !== "Examen" && kind !== "Actividad") throw new ExamAuthoringError("Tipo de repositorio inválido.");
  const db = getDatabase();
  const rows = await db.select().from(assessmentTemplates).where(eq(assessmentTemplates.kind, kind))
    .orderBy(asc(assessmentTemplates.name), asc(assessmentTemplates.version));
  return rows;
}

export async function getAssessmentTemplateInPostgres(templateId: string) {
  const db = getDatabase();
  const [template] = await db.select().from(assessmentTemplates).where(eq(assessmentTemplates.id, templateId)).limit(1);
  if (!template) throw new ExamAuthoringError("No se encontró el contenido.", 404);
  const questions = await db.select().from(assessmentTemplateQuestions)
    .where(eq(assessmentTemplateQuestions.templateId, templateId))
    .orderBy(asc(assessmentTemplateQuestions.order));
  return { ...template, questions };
}

export async function saveAssessmentTemplateInPostgres(input: {
  kind?: unknown;
  draft?: unknown;
  sourceTemplateId?: unknown;
  timeMode?: unknown;
  durationMinutes?: unknown;
  lockOnFocusLoss?: unknown;
}) {
  if (input.kind !== "Examen" && input.kind !== "Actividad") throw new ExamAuthoringError("Selecciona Examen o Actividad.");
  const kind = input.kind;
  const draft = validateDraft(input.draft, false, true);
  const chosen = policy(input);
  const sourceTemplateId = String(input.sourceTemplateId ?? "").trim();
  const db = getDatabase();
  return db.transaction(async (tx) => {
    let familyId = `family-${randomUUID()}`;
    let version = 1;
    if (sourceTemplateId) {
      const [source] = await tx.select().from(assessmentTemplates).where(eq(assessmentTemplates.id, sourceTemplateId)).limit(1);
      if (!source || source.kind !== kind) throw new ExamAuthoringError("La versión origen no pertenece a este repositorio.", 404);
      familyId = source.familyId;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${familyId}))`);
      const versions = await tx.select({ version: assessmentTemplates.version }).from(assessmentTemplates)
        .where(eq(assessmentTemplates.familyId, familyId));
      version = Math.max(...versions.map((item) => item.version)) + 1;
    }
    const id = `template-${randomUUID()}`;
    const now = new Date().toISOString();
    await tx.insert(assessmentTemplates).values({
      id, familyId, version, kind, name: draft.name, instructions: draft.instructions,
      status: "Borrador", subject: "Español", grade: draft.grade,
      ...chosen, createdAt: now, updatedAt: now,
    });
    await tx.insert(assessmentTemplateQuestions).values(draft.questions.map((question) => ({
      id: `template-question-${randomUUID()}`, templateId: id, order: question.order,
      topic: question.topic, type: question.type, prompt: question.prompt.trim(),
      options: question.options, correctAnswer: question.correctAnswer, maxScore: String(question.maxScore),
      evaluationMethod: question.evaluationMethod, rubric: question.rubric ? JSON.stringify(question.rubric) : null,
    })));
    await tx.insert(auditEvents).values({
      id: `event-${randomUUID()}`, type: "assessment_template_saved", entity: "ASSESSMENT_TEMPLATES",
      entityId: id, actorId: "docente", occurredAt: now,
      details: { kind: input.kind, version, questionCount: draft.questions.length },
    });
    return { templateId: id, familyId, version, kind: input.kind, status: "Borrador" };
  });
}

export async function approveAssessmentTemplateInPostgres(templateId: string) {
  return getDatabase().transaction(async (tx) => {
    const [template] = await tx.select().from(assessmentTemplates)
      .where(eq(assessmentTemplates.id, templateId)).for("update").limit(1);
    if (!template || template.status !== "Borrador") throw new ExamAuthoringError("No se encontró un borrador pendiente.", 404);
    const questions = await tx.select().from(assessmentTemplateQuestions)
      .where(eq(assessmentTemplateQuestions.templateId, templateId));
    validateDraft({ name: template.name, grade: template.grade, group: "TODOS", questions: questions.map((question) => ({
      type: question.type, prompt: question.prompt, options: question.options, correctAnswer: question.correctAnswer,
      maxScore: Number(question.maxScore), rubric: question.rubric ? JSON.parse(question.rubric) : null,
    })) }, false);
    const now = new Date().toISOString();
    await tx.update(assessmentTemplates).set({ status: "Aprobada", updatedAt: now })
      .where(and(eq(assessmentTemplates.id, templateId), eq(assessmentTemplates.status, "Borrador")));
    await tx.insert(auditEvents).values({
      id: `event-${randomUUID()}`, type: "assessment_template_approved", entity: "ASSESSMENT_TEMPLATES",
      entityId: templateId, actorId: "docente", occurredAt: now,
      details: { kind: template.kind, version: template.version },
    });
    return { templateId, status: "Aprobada" };
  });
}
