import assert from "node:assert/strict";
import test, { after } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDatabaseForTests, getDatabase } from "../db/client.ts";
import { aiEvaluations, auditEvents, examAnswers, examAssignments, examAttempts, examQuestions, exams, grades } from "../db/schema.ts";
import { finalizeExamAttemptByTeacherInPostgres, getTeacherExamResultsInPostgres, reevaluateOpenAnswerInPostgres, revokeExamAttemptsInPostgres, saveExamAnswersInPostgres, startExamAttemptInPostgres, submitExamAttemptInPostgres, unlockExamAttemptInPostgres, updateManualExamScoresInPostgres } from "../lib/exam-attempt-postgres.ts";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:13000";
const examId = "SYNTH-EXAM-ATTEMPT-001";
const questionId = "SYNTH-QUESTION-ATTEMPT-001";
const aiExamId = "SYNTH-EXAM-ATTEMPT-AI-001";
const aiQuestionId = "SYNTH-QUESTION-ATTEMPT-AI-001";
const revokeExamId = "SYNTH-EXAM-ATTEMPT-REVOKE-001";
const revokeQuestionId = "SYNTH-QUESTION-ATTEMPT-REVOKE-001";
const finalizeExamId = "SYNTH-EXAM-ATTEMPT-FINALIZE-001";
const finalizeQuestionId = "SYNTH-QUESTION-ATTEMPT-FINALIZE-001";
const studentId = "SYNTH-001";
let originalGradeRows;
let originalAuditEventIds;

async function post(path, body) {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function cleanFixture() {
  const db = getDatabase();
  const fixtureExamIds = [examId, aiExamId, revokeExamId, finalizeExamId];
  const attempts = await db.select({ id: examAttempts.id }).from(examAttempts).where(inArray(examAttempts.examId, fixtureExamIds));
  const attemptIds = attempts.map((row) => row.id);
  await db.delete(auditEvents).where(inArray(auditEvents.entityId, [...attemptIds, revokeExamId]));
  if (attemptIds.length) {
    await db.delete(aiEvaluations).where(inArray(aiEvaluations.attemptId, attemptIds));
    await db.delete(examAnswers).where(inArray(examAnswers.attemptId, attemptIds));
    await db.delete(examAttempts).where(inArray(examAttempts.id, attemptIds));
  }
  if (originalGradeRows !== undefined) {
    await db.delete(grades).where(eq(grades.partialId, "SYNTH-P1"));
    if (originalGradeRows.length) await db.insert(grades).values(originalGradeRows);
    const restoredGradeRows = await db.select({ id: grades.id }).from(grades).where(eq(grades.partialId, "SYNTH-P1"));
    assert.deepEqual(
      restoredGradeRows.map((row) => row.id).sort(),
      originalGradeRows.map((row) => row.id).sort(),
      "la prueba debe restaurar todos los snapshots del parcial, incluidos los ajenos al alumno sintético",
    );
  }
  if (originalAuditEventIds !== undefined) {
    const events = await db.select({ id: auditEvents.id }).from(auditEvents).where(and(eq(auditEvents.partialId, "SYNTH-P1"), eq(auditEvents.studentId, studentId)));
    const baselineIds = new Set(originalAuditEventIds);
    const newEventIds = events.filter((event) => !baselineIds.has(event.id)).map((event) => event.id);
    if (newEventIds.length) await db.delete(auditEvents).where(inArray(auditEvents.id, newEventIds));
  }
  await db.delete(examAssignments).where(inArray(examAssignments.examId, fixtureExamIds));
  await db.delete(examQuestions).where(inArray(examQuestions.id, [questionId, aiQuestionId, revokeQuestionId, finalizeQuestionId]));
  await db.delete(exams).where(inArray(exams.id, fixtureExamIds));
}

after(async () => {
  await cleanFixture();
  await closeDatabaseForTests();
});

test("intento de examen Postgres: autorización, reanudación, autosave, bloqueo, desbloqueo y envío idempotente", async () => {
  const db = getDatabase();
  originalGradeRows = await db.select().from(grades).where(eq(grades.partialId, "SYNTH-P1"));
  originalAuditEventIds = (await db.select({ id: auditEvents.id }).from(auditEvents).where(and(eq(auditEvents.partialId, "SYNTH-P1"), eq(auditEvents.studentId, studentId)))).map((event) => event.id);
  await cleanFixture();
  const now = new Date().toISOString();
  await db.insert(exams).values({
    id: examId, partialId: "SYNTH-P1", name: "Examen sintético de recorrido", subject: "Español",
    grade: "1", group: "A", status: "Publicado", durationMinutes: 30, maxScore: "10",
    requiresFullscreen: false, instructions: "Prueba local con información ficticia.", createdAt: now, updatedAt: now,
  });
  await db.insert(examQuestions).values({
    id: questionId, examId, order: 1, topic: "Prueba", type: "opcion_multiple", prompt: "Reactivo sintético",
    options: ["A", "B"], correctAnswer: "A", maxScore: "10", evaluationMethod: "automatic", active: true,
  });

  const denied = await post("/api/exam/start", { studentId: "SYNTH-NOT-A-STUDENT", examId });
  assert.equal(denied.status, 403);

  const startedResponse = await post("/api/exam/start", { studentId, examId });
  const started = await startedResponse.json();
  assert.equal(startedResponse.status, 200);
  assert.equal(started.source, "postgres");
  assert.ok(started.attemptId);
  assert.equal("correctAnswer" in started.exam.questions[0], false);
  assert.equal("rubric" in started.exam.questions[0], false);

  const resumedResponse = await post("/api/exam/start", { studentId, examId });
  const resumed = await resumedResponse.json();
  assert.equal(resumed.attemptId, started.attemptId);
  assert.equal(resumed.resumed, true);

  const invalidQuestion = await post("/api/exam/save", {
    attemptId: started.attemptId, examId, studentId, answers: { "SYNTH-UNRELATED-QUESTION": "A" },
  });
  assert.equal(invalidQuestion.status, 403);

  const saved = await post("/api/exam/save", { attemptId: started.attemptId, examId, studentId, answers: { [questionId]: "A" } });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).source, "postgres");
  const [durableAnswer] = await db.select().from(examAnswers).where(and(eq(examAnswers.attemptId, started.attemptId), eq(examAnswers.questionId, questionId)));
  assert.equal(durableAnswer.answer, "A");
  assert.equal((await getTeacherExamResultsInPostgres()).results.some((item) => item.attemptId === started.attemptId), false);
  const activeReport = (await getTeacherExamResultsInPostgres({ includeInProgress: true })).results.find((item) => item.attemptId === started.attemptId);
  assert.equal(activeReport.status, "Activo");
  assert.equal(activeReport.answers[0].answer, "A");
  assert.equal(activeReport.answers[0].score, null, "no calificar un intento sin enviar");

  const locked = await post("/api/exam/event", { attemptId: started.attemptId, examId, studentId, event: "visibility_hidden" });
  assert.equal(locked.status, 200);
  const blockedSave = await post("/api/exam/save", { attemptId: started.attemptId, examId, studentId, answers: { [questionId]: "B" } });
  assert.equal(blockedSave.status, 409);

  process.env.EXAM_UNLOCK_PASSWORD = "synthetic-unlock-password";
  const unlocked = await unlockExamAttemptInPostgres({ attemptId: started.attemptId, password: "synthetic-unlock-password" }, new Date(Date.now() + 120_000));
  assert.equal(unlocked.ok, true);
  assert.ok(Date.parse(unlocked.deadlineAt) > Date.parse(started.deadlineAt));

  const submitted = await post("/api/exam/submit", { attemptId: started.attemptId, examId, studentId, answers: { [questionId]: "A" } });
  const firstResult = await submitted.json();
  assert.equal(submitted.status, 200);
  assert.equal(firstResult.source, "postgres");
  assert.equal(firstResult.result.totalScore, 10);
  assert.equal(firstResult.result.grade10, 10);
  const repeated = await post("/api/exam/submit", { attemptId: started.attemptId, examId, studentId, answers: { [questionId]: "B" } });
  const repeatedResult = await repeated.json();
  assert.equal(repeated.status, 200);
  assert.equal(repeatedResult.recovered, true);
  assert.deepEqual(repeatedResult.result, firstResult.result);

  const [finalAttempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, started.attemptId));
  assert.equal(finalAttempt.status, "Definitivo");
  assert.equal(Number(finalAttempt.totalScore), 10);
  const [scoredAnswer] = await db.select().from(examAnswers).where(and(eq(examAnswers.attemptId, started.attemptId), eq(examAnswers.questionId, questionId)));
  assert.equal(Number(scoredAnswer.score), 10, "el envío persiste el puntaje automático por pregunta");
  await db.update(examAnswers).set({ score: null }).where(eq(examAnswers.id, scoredAnswer.id));
  const legacyReport = (await getTeacherExamResultsInPostgres()).results.find((item) => item.attemptId === started.attemptId);
  assert.equal(legacyReport.answers[0].score, 10, "los exámenes ya entregados recuperan el puntaje del mismo motor del alumno");
  const [unmodifiedLegacyAnswer] = await db.select().from(examAnswers).where(eq(examAnswers.id, scoredAnswer.id));
  assert.equal(unmodifiedLegacyAnswer.score, null, "consultar el desglose no modifica datos históricos");

  const manuallyGraded = await updateManualExamScoresInPostgres({
    attemptId: started.attemptId, scores: [{ questionId, score: 4 }], reason: "Ajuste sintético para comprobar edición docente.",
  });
  assert.equal(manuallyGraded.result.items[0].score, 4);
  assert.equal(manuallyGraded.result.items[0].status, "correcta", "el ajuste de puntos no altera si la respuesta fue correcta");
  const [manualAnswer] = await db.select().from(examAnswers).where(eq(examAnswers.id, scoredAnswer.id));
  assert.equal(Number(manualAnswer.manualScore), 4);
  assert.equal(manualAnswer.answer, "A", "la edición de puntaje conserva la respuesta original");
  assert.ok((await db.select().from(auditEvents).where(and(eq(auditEvents.type, "exam_manual_scores_updated"), eq(auditEvents.entityId, started.attemptId)))).length);

  await db.insert(exams).values({
    id: finalizeExamId, partialId: "SYNTH-P1", name: "Examen sintético para finalización docente", subject: "Español",
    grade: "1", group: "A", status: "Publicado", durationMinutes: 30, maxScore: "10",
    requiresFullscreen: false, instructions: "Prueba local con información ficticia.", createdAt: now, updatedAt: now,
  });
  await db.insert(examQuestions).values({
    id: finalizeQuestionId, examId: finalizeExamId, order: 1, topic: "Prueba", type: "opcion_multiple", prompt: "Reactivo guardado sintético",
    options: ["A", "B"], correctAnswer: "A", maxScore: "10", evaluationMethod: "automatic", active: true,
  });
  const pendingTeacherFinalize = await startExamAttemptInPostgres({ studentId, examId: finalizeExamId });
  await saveExamAnswersInPostgres({ attemptId: pendingTeacherFinalize.attemptId, examId: finalizeExamId, studentId, answers: { [finalizeQuestionId]: "A" } });
  await db.update(examAttempts).set({ status: "Bloqueado", locked: true, lockedAt: now }).where(eq(examAttempts.id, pendingTeacherFinalize.attemptId));
  const teacherFinalized = await finalizeExamAttemptByTeacherInPostgres({ attemptId: pendingTeacherFinalize.attemptId });
  assert.equal(teacherFinalized.result.grade10, 10);
  assert.equal(teacherFinalized.result.items[0].score, 10);
  const [finalizedAttempt] = await db.select().from(examAttempts).where(eq(examAttempts.id, pendingTeacherFinalize.attemptId));
  assert.equal(finalizedAttempt.status, "Definitivo");
  assert.ok((await db.select().from(auditEvents).where(and(eq(auditEvents.type, "exam_teacher_finalization_accepted"), eq(auditEvents.entityId, pendingTeacherFinalize.attemptId)))).length);

  await db.insert(exams).values({
    id: aiExamId, partialId: "SYNTH-P1", name: "Examen sintético con respuesta abierta", subject: "Español",
    grade: "1", group: "A", status: "Publicado", durationMinutes: 30, maxScore: "5",
    requiresFullscreen: false, instructions: "Prueba local con información ficticia.", createdAt: now, updatedAt: now,
  });
  await db.insert(examQuestions).values({
    id: aiQuestionId, examId: aiExamId, order: 1, topic: "Prueba", type: "abierta", prompt: "Explica la respuesta sintética",
    options: null, correctAnswer: null, maxScore: "5", evaluationMethod: "ai", rubric: "Criterios ficticios de prueba", active: true,
  });
  const aiAttempt = await startExamAttemptInPostgres({ studentId, examId: aiExamId });
  const provisional = await submitExamAttemptInPostgres({
    attemptId: aiAttempt.attemptId, examId: aiExamId, studentId, answers: { [aiQuestionId]: "Respuesta sintética evaluada por un mock." },
  }, async (_exam, question, answer) => {
    assert.equal(question.id, aiQuestionId);
    assert.equal(answer, "Respuesta sintética evaluada por un mock.");
    throw new Error("Fallo ficticio recuperable del evaluador.");
  });
  assert.equal(provisional.result.aiPending, true);
  assert.equal(provisional.result.totalScore, null);
  const provisionalReport = await getTeacherExamResultsInPostgres();
  const pendingReport = provisionalReport.results.find((item) => item.attemptId === aiAttempt.attemptId);
  assert.equal(pendingReport.status, "Provisional");
  assert.equal(pendingReport.studentName, "Alumno ficticio 1");
  assert.equal(pendingReport.answers[0].status, "Pendiente");

  const unauthenticatedReport = await fetch(new URL("/api/teacher/results", baseUrl));
  assert.equal(unauthenticatedReport.status, 401);
  const unauthenticatedReevaluation = await post("/api/teacher/results/reevaluate", { attemptId: aiAttempt.attemptId, questionId: aiQuestionId });
  assert.equal(unauthenticatedReevaluation.status, 401);
  const unauthenticatedRevocation = await post("/api/admin/revoke-exam", { studentId, examId: revokeExamId });
  assert.equal(unauthenticatedRevocation.status, 401);

  await db.insert(exams).values({
    id: revokeExamId, partialId: "SYNTH-P1", name: "Examen sintético para revocación", subject: "Español",
    grade: "1", group: "A", status: "Publicado", durationMinutes: 30, maxScore: "5",
    requiresFullscreen: false, instructions: "Prueba local con información ficticia.", createdAt: now, updatedAt: now,
  });
  await db.insert(examQuestions).values({
    id: revokeQuestionId, examId: revokeExamId, order: 1, topic: "Prueba", type: "abierta", prompt: "Respuesta sintética para revocar",
    options: null, correctAnswer: null, maxScore: "5", evaluationMethod: "ai", rubric: "Criterios ficticios de prueba", active: true,
  });
  await db.insert(examAssignments).values({
    id: "SYNTH-ASSIGNMENT-REVOKE-001", studentId, examId: revokeExamId, status: "Activa", createdAt: now, updatedAt: now,
  });
  const revokeAttempt = await startExamAttemptInPostgres({ studentId, examId: revokeExamId });
  await submitExamAttemptInPostgres({
    attemptId: revokeAttempt.attemptId, examId: revokeExamId, studentId,
    answers: { [revokeQuestionId]: "Respuesta sintética de prueba." },
  }, async () => ({ score: 4, level: "Adecuada", feedback: "Evaluación ficticia.", strengths: [], opportunities: [] }));

  if (process.env.TEST_TEACHER_PASSWORD) {
    const login = await post("/api/teacher/login", { password: process.env.TEST_TEACHER_PASSWORD });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie, "el acceso docente debe emitir su cookie de sesión");
    const authenticatedReport = await fetch(new URL("/api/teacher/results", baseUrl), { headers: { cookie } });
    assert.equal(authenticatedReport.status, 200);
    const authenticatedData = await authenticatedReport.json();
    assert.ok(authenticatedData.results.some((item) => item.attemptId === aiAttempt.attemptId));
    const noGeminiKey = await fetch(new URL("/api/teacher/results/reevaluate", baseUrl), {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ attemptId: aiAttempt.attemptId, questionId: aiQuestionId }),
    });
    assert.equal(noGeminiKey.status, 503, "la acción autenticada debe dejar el resultado provisional cuando falta Gemini");
    const stillPending = await getTeacherExamResultsInPostgres();
    assert.equal(stillPending.results.find((item) => item.attemptId === aiAttempt.attemptId).status, "Provisional");
    const revokeResponse = await fetch(new URL("/api/admin/revoke-exam", baseUrl), {
      method: "POST", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ studentId, examId: revokeExamId }),
    });
    const revokePayload = await revokeResponse.json();
    assert.equal(revokeResponse.status, 200);
    assert.equal(revokePayload.source, "postgres");
    assert.equal(revokePayload.result.deletedAttempts, 1);
  } else {
    const revoked = await revokeExamAttemptsInPostgres({ studentId, examId: revokeExamId });
    assert.equal(revoked.deletedAttempts, 1);
  }
  assert.equal((await db.select().from(examAttempts).where(eq(examAttempts.id, revokeAttempt.attemptId))).length, 0);
  assert.equal((await db.select().from(examAnswers).where(eq(examAnswers.attemptId, revokeAttempt.attemptId))).length, 0);
  assert.equal((await db.select().from(aiEvaluations).where(eq(aiEvaluations.attemptId, revokeAttempt.attemptId))).length, 0);
  assert.equal((await db.select().from(examAssignments).where(eq(examAssignments.id, "SYNTH-ASSIGNMENT-REVOKE-001"))).length, 1);
  const revocationEvent = (await db.select().from(auditEvents).where(and(
    eq(auditEvents.type, "exam_revoked"), eq(auditEvents.entityId, revokeExamId), eq(auditEvents.studentId, studentId),
  ))).at(-1);
  assert.ok(revocationEvent);
  assert.deepEqual(revocationEvent.details.attemptIds, [revokeAttempt.attemptId]);

  const interrupted = await startExamAttemptInPostgres({ studentId, examId: revokeExamId });
  await saveExamAnswersInPostgres({ attemptId: interrupted.attemptId, examId: revokeExamId, studentId, answers: { [revokeQuestionId]: "Respuesta autoguardada ficticia" } });
  const expiredTime = new Date(Date.now() + 36 * 60_000);
  const resumedExpired = await startExamAttemptInPostgres({ studentId, examId: revokeExamId }, expiredTime);
  assert.equal(resumedExpired.attemptId, interrupted.attemptId);
  assert.equal(resumedExpired.submissionPending, true);
  assert.equal(resumedExpired.answers[revokeQuestionId], "Respuesta autoguardada ficticia");
  const recoveredExpired = await submitExamAttemptInPostgres({ attemptId: interrupted.attemptId, examId: revokeExamId, studentId, answers: {} }, async (_exam, _question, answer) => {
    assert.equal(answer, "Respuesta autoguardada ficticia", "recuperar el autoguardado, sin reemplazarlo por el payload vacío");
    return { score: 4, level: "Adecuada", feedback: "Recuperación ficticia", strengths: [], opportunities: [] };
  }, expiredTime);
  assert.equal(recoveredExpired.result.aiPending, false);
  assert.equal(recoveredExpired.result.grade10, 8);

  const originalGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    reevaluateOpenAnswerInPostgres({ attemptId: aiAttempt.attemptId, questionId: aiQuestionId }),
    (error) => error.status === 503 && /clave de Gemini/.test(error.message),
  );
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;

  const aiResult = await reevaluateOpenAnswerInPostgres({ attemptId: aiAttempt.attemptId, questionId: aiQuestionId }, async (_exam, question, answer) => {
    assert.equal(question.id, aiQuestionId);
    assert.equal(answer, "Respuesta sintética evaluada por un mock.");
    return { score: 4, level: "Adecuada", feedback: "Evaluación ficticia aceptada.", strengths: ["Explica"], opportunities: [] };
  });
  assert.equal(aiResult.aiPending, false);
  assert.equal(aiResult.aiScore, 4);
  assert.equal(aiResult.grade10, 8);
  assert.equal(aiResult.status, "Definitivo");
  const [durableEvaluation] = await db.select().from(aiEvaluations).where(and(
    eq(aiEvaluations.attemptId, aiAttempt.attemptId), eq(aiEvaluations.questionId, aiQuestionId),
  ));
  assert.equal(durableEvaluation.status, "Evaluada");
  assert.equal(Number(durableEvaluation.score), 4);
  const finalReport = await getTeacherExamResultsInPostgres();
  const completedReport = finalReport.results.find((item) => item.attemptId === aiAttempt.attemptId);
  assert.equal(completedReport.status, "Definitivo");
  assert.equal(completedReport.grade10, 8);
  assert.equal(completedReport.answers[0].status, "Evaluada");
});
