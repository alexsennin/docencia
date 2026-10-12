import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDatabaseForTests, getDatabase } from "../db/client.ts";
import { academicPeriods, classSessions, examAttempts, exams, studentGrades, studentGroups, students, tasks } from "../db/schema.ts";
import { saveAssessmentTemplateInPostgres, approveAssessmentTemplateInPostgres, getAssessmentTemplateInPostgres } from "../lib/assessment-templates-postgres.ts";
import { getTeacherPreviewDefinitionInPostgres, listTeacherPreviewOptionsInPostgres } from "../lib/assessment-preview-postgres.ts";
import { evaluateAutomatic, toPublicExam } from "../lib/exam-engine.ts";
import { assignAssessmentInPostgres } from "../lib/assessment-assignment-postgres.ts";
import { startExamAttemptInPostgres, saveExamAnswersInPostgres, recordExamEventInPostgres, submitExamAttemptInPostgres, getTeacherExamResultsInPostgres, finalizeExpiredAssessmentAttemptsInPostgres, revokeExamAttemptsInPostgres } from "../lib/exam-attempt-postgres.ts";
import { calculateStudentPartial } from "../lib/academic-engine.ts";

if (process.env.ASSESSMENT_SYNTHETIC_DB !== "YES" || !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL ?? "postgres://invalid:invalid@invalid/invalid").hostname)) {
  throw new Error("Esta prueba requiere una base PostgreSQL local aislada y ASSESSMENT_SYNTHETIC_DB=YES.");
}

const db = getDatabase();
const suffix = randomUUID();
const studentId = `SYNTH-${suffix}`;
const partialId = `SYNTH-P-${suffix}`;
const sessionId = `SYNTH-S-${suffix}`;
const gradeId = `SYNTH-G-${suffix}`;
const groupId = `SYNTH-GR-${suffix}`;
const snapshot = (exam, attempt, task) => ({
  partials: [{ parcial_id: partialId, modo_evaluacion_continua: "Promedio" }],
  students: [{ id: studentId, grado: "1°", grupo: "A" }], sessions: [], absences: [], conduct: [], reports: [], grades: [],
  tasks: task ? [{ tarea_id: task.id, parcial_id: partialId, grupo: "1° A", nombre: task.name, estado_banco: "En_calificacion", activa: true, obligatoria: true, puntaje_maximo: 10, evaluacion_examen_id: exam.id }] : [],
  taskScores: [],
  exams: [{ examen_id: exam.id, parcial_id: partialId, estado: "Publicado", grado: "1°", grupo: "A", proposito: exam.purpose, modo_asignacion: "Explicit", puntaje_maximo: 100 }],
  attempts: [{ examen_id: exam.id, alumno_id: studentId, estado: attempt.status, puntaje_total: attempt.totalScore, ai_pendiente: attempt.aiPending }],
  assignments: [{ examen_id: exam.id, alumno_id: studentId, estado: "Activo" }],
});

after(async () => { await closeDatabaseForTests(); });

test("un borrador incompleto se guarda, se reabre y se prueba sin crear intentos; aprobar exige contenido completo", async () => {
  const base = { name: "Actividad en revisión", instructions: "Responde.", grade: "1°", group: "TODOS",
    questions: [{ order: 1, topic: "Prueba", type: "opcion_multiple", prompt: "Elige la respuesta", options: ["Primera", "Segunda"],
      correctAnswer: null, maxScore: 100, evaluationMethod: "automatic", rubric: null }] };
  const saved = await saveAssessmentTemplateInPostgres({ kind: "Actividad", draft: base, timeMode: "Libre", lockOnFocusLoss: false });
  const stored = await getAssessmentTemplateInPostgres(saved.templateId);
  assert.equal(stored.status, "Borrador");
  assert.equal(stored.questions.length, 1);
  assert.ok((await listTeacherPreviewOptionsInPostgres()).some((item) => item.id === saved.templateId && item.kind === "Actividad"));
  const before = await db.select().from(examAttempts);
  const preview = await getTeacherPreviewDefinitionInPostgres(saved.templateId);
  assert.equal(preview.purpose, "Actividad");
  assert.equal(toPublicExam(preview).questions[0].correctAnswer, undefined);
  assert.equal(preview.timeMode, "Libre");
  assert.equal(evaluateAutomatic(preview, { [preview.questions[0].id]: "A" }, "preview", "docente").items.length, 1);
  assert.deepEqual(await db.select().from(examAttempts), before);
  await assert.rejects(approveAssessmentTemplateInPostgres(saved.templateId), /clave/);
  const fixed = await saveAssessmentTemplateInPostgres({ kind: "Actividad", draft: { ...base, questions: [{ ...base.questions[0], correctAnswer: "A" }] },
    sourceTemplateId: saved.templateId, timeMode: "Libre", lockOnFocusLoss: false });
  assert.equal(fixed.version, 2);
  await approveAssessmentTemplateInPostgres(fixed.templateId);
  const ready = await getTeacherPreviewDefinitionInPostgres(fixed.templateId);
  assert.equal(evaluateAutomatic(ready, { [ready.questions[0].id]: "A" }, "preview", "docente").grade10, 10);
  assert.deepEqual(await db.select().from(examAttempts), before);
});

test("plantillas separadas, asignación explícita y nota única de trabajo en EC", async () => {
  await db.insert(studentGrades).values({ id: gradeId, name: `Grado ${suffix}` });
  await db.insert(studentGroups).values({ id: groupId, gradeId, name: `Grupo ${suffix}`, studentGrade: "1°", section: "A" });
  await db.insert(students).values({ id: studentId, name: "Alumno sintético", grade: "1°", group: "A", active: true });
  await db.insert(academicPeriods).values({ id: partialId, name: "Parcial sintético", status: "Abierto" });
  await db.insert(classSessions).values({ id: sessionId, partialId, group: "1° A", classDate: "2026-10-12", status: "Realizada" });
  const draft = { name: "Trabajo sintético", instructions: "Contesta la pregunta.", grade: "1°", group: "TODOS", questions: [{ order: 1, topic: "Prueba", type: "opcion_multiple", prompt: "Elige A", options: ["A", "B"], correctAnswer: "A", maxScore: 100, evaluationMethod: "automatic", rubric: null, sourceMatch: true }] };
  const saved = await saveAssessmentTemplateInPostgres({ kind: "Actividad", draft, timeMode: "Libre", lockOnFocusLoss: false });
  await approveAssessmentTemplateInPostgres(saved.templateId);
  const requestId = randomUUID();
  const assignment = await assignAssessmentInPostgres({ templateId: saved.templateId, requestId, partialId, groupId, sessionId, taskType: "Trabajo en clase" });
  const retry = await assignAssessmentInPostgres({ templateId: saved.templateId, requestId, partialId, groupId, sessionId, taskType: "Trabajo en clase" });
  assert.equal(retry.examId, assignment.examId);
  assert.equal(retry.alreadyAssigned, true);
  const [exam] = await db.select().from(exams).where(eq(exams.id, assignment.examId));
  const [task] = await db.select().from(tasks).where(eq(tasks.assessmentExamId, exam.id));
  assert.equal(exam.purpose, "Actividad");
  assert.equal(exam.timeMode, "Libre");
  assert.equal(exam.lockOnFocusLoss, false);
  assert.equal(task.id, assignment.taskId);
  const start = await startExamAttemptInPostgres({ examId: exam.id, studentId });
  assert.equal(start.deadlineAt, null);
  assert.equal(start.exam.questions.length, 1);
  const submitted = await submitExamAttemptInPostgres({ attemptId: start.attemptId, examId: exam.id, studentId, answers: { [start.exam.questions[0].id]: "A" } });
  assert.equal(submitted.result.grade10, 10);
  const [attempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, start.attemptId));
  const grade = calculateStudentPartial(snapshot(exam, attempt, task), { id: studentId, grado: "1°", grupo: "A" }, { parcial_id: partialId, modo_evaluacion_continua: "Promedio" });
  assert.equal(grade.ec, 100);
  assert.equal(grade.ex, null);
  assert.equal(grade.ecDetails.length, 1);
  const examResults = await getTeacherExamResultsInPostgres({ kind: "Examen" });
  const workResults = await getTeacherExamResultsInPostgres({ kind: "Actividad" });
  assert.equal(examResults.exams.some((item) => item.examId === exam.id), false);
  assert.equal(workResults.exams.some((item) => item.examId === exam.id), true);

  const examTemplate = await saveAssessmentTemplateInPostgres({ kind: "Examen", draft: { ...draft, name: "Examen sintético" }, timeMode: "Estricto", durationMinutes: 1, lockOnFocusLoss: true });
  await approveAssessmentTemplateInPostgres(examTemplate.templateId);
  const examAssignment = await assignAssessmentInPostgres({ templateId: examTemplate.templateId, requestId: randomUUID(), partialId, groupId });
  const startedAt = new Date("2026-10-12T12:00:00.000Z");
  const timed = await startExamAttemptInPostgres({ examId: examAssignment.examId, studentId }, startedAt);
  assert.equal(timed.deadlineAt, "2026-10-12T12:01:00.000Z");
  await saveExamAnswersInPostgres({ attemptId: timed.attemptId, examId: examAssignment.examId, studentId, answers: { [timed.exam.questions[0].id]: "A" } }, new Date("2026-10-12T12:00:05.000Z"));
  await recordExamEventInPostgres({ attemptId: timed.attemptId, examId: examAssignment.examId, studentId, event: "window_blur" }, new Date("2026-10-12T12:00:10.000Z"));
  const [blocked] = await db.select().from(examAttempts).where(eq(examAttempts.id, timed.attemptId));
  assert.equal(blocked.status, "Bloqueado");
  const recovered = await startExamAttemptInPostgres({ examId: examAssignment.examId, studentId }, new Date("2026-10-12T12:01:01.000Z"));
  assert.equal(recovered.submissionPending, true);
  const examResult = await submitExamAttemptInPostgres({ attemptId: timed.attemptId, examId: examAssignment.examId, studentId, answers: {} });
  assert.equal(examResult.result.grade10, 10);
  const [finalExam] = await db.select().from(exams).where(eq(exams.id, examAssignment.examId));
  const [finalAttempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, timed.attemptId));
  const examGrade = calculateStudentPartial(snapshot(finalExam, finalAttempt, null), { id: studentId, grado: "1°", grupo: "A" }, { parcial_id: partialId, modo_evaluacion_continua: "Promedio" });
  assert.equal(examGrade.ex, 100);
  await revokeExamAttemptsInPostgres({ studentId, examId: examAssignment.examId });
  const retake = await startExamAttemptInPostgres({ examId: examAssignment.examId, studentId }, new Date("2026-10-12T13:00:00.000Z"));
  assert.notEqual(retake.attemptId, timed.attemptId);
  await saveExamAnswersInPostgres({ attemptId: retake.attemptId, examId: examAssignment.examId, studentId, answers: { [retake.exam.questions[0].id]: "A" } }, new Date("2026-10-12T13:00:05.000Z"));
  const swept = await finalizeExpiredAssessmentAttemptsInPostgres(new Date("2026-10-12T13:01:01.000Z"));
  assert.equal(swept.failed, 0);
  assert.ok(swept.finalized >= 1);
  const [closed] = await db.select().from(examAttempts).where(eq(examAttempts.id, retake.attemptId));
  assert.equal(closed.status, "Definitivo");
});
