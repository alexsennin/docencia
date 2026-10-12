import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/client.ts";
import {
  academicPeriods, assessmentTemplateQuestions, assessmentTemplates, auditEvents, classSessions,
  examAssignments, examQuestions, exams, studentGroups, students, tasks,
} from "../db/schema.ts";
import { ExamAuthoringError } from "./exam-authoring-postgres.ts";
import { refreshGradeSnapshotsInPostgres } from "./teacher-session-postgres.ts";

export type AssessmentAssignmentInput = {
  templateId?: unknown;
  requestId?: unknown;
  partialId?: unknown;
  groupId?: unknown;
  sessionId?: unknown;
  taskType?: unknown;
};

export async function assignAssessmentInPostgres(input: AssessmentAssignmentInput) {
  const templateId = String(input.templateId ?? "").trim();
  const requestId = String(input.requestId ?? "").trim();
  const partialId = String(input.partialId ?? "").trim();
  const groupId = String(input.groupId ?? "").trim();
  const sessionId = String(input.sessionId ?? "").trim();
  const taskType = String(input.taskType ?? "Trabajo en clase");
  if (!templateId || !partialId || !groupId || !/^[a-zA-Z0-9-]{20,80}$/.test(requestId)) {
    throw new ExamAuthoringError("Selecciona contenido, parcial y grupo; vuelve a iniciar la asignación.");
  }
  const fingerprint = createHash("sha256").update(JSON.stringify([templateId, partialId, groupId, sessionId, taskType])).digest("hex");
  const db = getDatabase();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${requestId}))`);
    const [existing] = await tx.select().from(exams).where(eq(exams.assignmentRequestId, requestId)).limit(1);
    if (existing) {
      if (existing.assignmentFingerprint !== fingerprint) throw new ExamAuthoringError("La solicitud ya se usó para otra asignación.", 409);
      const [task] = await tx.select().from(tasks).where(eq(tasks.assessmentExamId, existing.id)).limit(1);
      return { examId: existing.id, taskId: task?.id ?? null, partialId: existing.partialId, alreadyAssigned: true };
    }
    const [template] = await tx.select().from(assessmentTemplates).where(eq(assessmentTemplates.id, templateId)).limit(1);
    if (!template || template.status !== "Aprobada") throw new ExamAuthoringError("Selecciona una versión aprobada.", 409);
    const [partial] = await tx.select().from(academicPeriods).where(eq(academicPeriods.id, partialId)).limit(1);
    if (!partial || partial.status === "Cerrado") throw new ExamAuthoringError("El parcial no está abierto.", 409);
    const [catalogGroup] = await tx.select().from(studentGroups).where(eq(studentGroups.id, groupId)).limit(1);
    if (!catalogGroup || !catalogGroup.active || (template.grade && template.grade !== catalogGroup.studentGrade)) {
      throw new ExamAuthoringError("El grupo no corresponde al contenido aprobado.", 409);
    }
    const group = `${catalogGroup.studentGrade} ${catalogGroup.section}`.trim();
    const roster = await tx.select().from(students).where(and(
      eq(students.active, true), eq(students.grade, catalogGroup.studentGrade), eq(students.group, catalogGroup.section),
    ));
    if (!roster.length) throw new ExamAuthoringError("El grupo no tiene alumnos activos.", 409);
    let session: typeof classSessions.$inferSelect | undefined;
    if (template.kind === "Actividad") {
      if (!sessionId || !["Tarea", "Trabajo en clase"].includes(taskType)) throw new ExamAuthoringError("Selecciona sesión y tipo de trabajo.");
      [session] = await tx.select().from(classSessions).where(eq(classSessions.id, sessionId)).for("update").limit(1);
      if (!session || session.status === "Cancelada" || session.partialId !== partialId || session.group !== group) {
        throw new ExamAuthoringError("La sesión no corresponde al grupo y parcial.", 409);
      }
    } else if (sessionId) {
      throw new ExamAuthoringError("Los exámenes se asignan sin sesión de clase.");
    }
    const questions = await tx.select().from(assessmentTemplateQuestions)
      .where(eq(assessmentTemplateQuestions.templateId, templateId)).orderBy(asc(assessmentTemplateQuestions.order));
    if (!questions.length || Math.abs(questions.reduce((sum, item) => sum + Number(item.maxScore), 0) - 100) > 0.01) {
      throw new ExamAuthoringError("La plantilla ya no tiene reactivos válidos.", 409);
    }
    const now = new Date().toISOString();
    const examId = `assessment-${randomUUID()}`;
    await tx.insert(exams).values({
      id: examId, partialId, name: template.name, subject: template.subject || partial.subject || "Español",
      grade: catalogGroup.studentGrade, group: catalogGroup.section, status: "Publicado",
      durationMinutes: template.durationMinutes, maxScore: "100", requiresFullscreen: template.lockOnFocusLoss,
      instructions: template.instructions, createdAt: now, updatedAt: now, version: template.version,
      sourceTemplateId: template.id, purpose: template.kind, assignmentMode: "Explicit", policyVersion: "v1",
      timeMode: template.timeMode, lockOnFocusLoss: template.lockOnFocusLoss,
      assignmentRequestId: requestId, assignmentFingerprint: fingerprint,
    });
    await tx.insert(examQuestions).values(questions.map((question) => ({
      id: `question-${randomUUID()}`, examId, order: question.order, topic: question.topic,
      type: question.type, prompt: question.prompt, options: question.options,
      correctAnswer: question.correctAnswer, maxScore: question.maxScore,
      evaluationMethod: question.evaluationMethod, rubric: question.rubric,
      active: true, createdAt: now, updatedAt: now,
    })));
    await tx.insert(examAssignments).values(roster.map((student) => ({
      id: `assignment-${randomUUID()}`, studentId: student.id, examId, status: "Activo", createdAt: now, updatedAt: now,
    })));
    let taskId: string | null = null;
    if (template.kind === "Actividad" && session) {
      taskId = `task-${randomUUID()}`;
      await tx.insert(tasks).values({
        id: taskId, partialId, group, name: template.name, type: taskType,
        assignedOn: session.classDate, dueOn: null, maxScore: "10", mandatory: true, active: true,
        createdAt: now, updatedAt: now, sessionId: session.id, description: template.instructions.slice(0, 2000),
        bankStatus: taskType === "Tarea" ? "Pendiente" : "En_calificacion",
        gradingSessionId: taskType === "Trabajo en clase" ? session.id : null,
        assessmentExamId: examId,
      });
    }
    await tx.insert(auditEvents).values({
      id: `event-${randomUUID()}`, type: "assessment_assigned", entity: "EXAMENES",
      entityId: examId, partialId, actorId: "docente", occurredAt: now,
      details: { templateId, kind: template.kind, groupId, studentCount: roster.length, taskId },
    });
    return { examId, taskId, partialId, alreadyAssigned: false };
  });
  try {
    await refreshGradeSnapshotsInPostgres(result.partialId);
    return { ...result, academicSyncPending: false };
  } catch {
    return { ...result, academicSyncPending: true };
  }
}
