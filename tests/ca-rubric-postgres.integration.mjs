import assert from "node:assert/strict";
import test, { after } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDatabaseForTests, getDatabase } from "../db/client.ts";
import { auditEvents, attendance, backgroundJobs, classSessions, conductAttitude, grades, students } from "../db/schema.ts";
import { CONDUCT_ATTITUDE_CRITERIA, CONDUCT_ATTITUDE_RUBRIC_VERSION } from "../lib/conduct-attitude-rubric.ts";
import { advanceCaRubricJobPostgres, getCaRubricJobPostgres, startCaRubricJobPostgres } from "../lib/ca-rubric-postgres.ts";
import { handleCaRubricWorker } from "../functions/ca-rubric-worker.ts";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:13000";
const studentId = "SYNTH-CA-001";
const sessionId = "SYNTH-CA-SESSION-001";
const attendanceId = "SYNTH-CA-ATTENDANCE-001";
const noteId = "SYNTH-CA-NOTE-001";
let jobIds = [];
const originalGeminiKey = process.env.GEMINI_API_KEY;
process.env.GEMINI_API_KEY = "synthetic-test-key-not-used-by-the-fake-evaluator";

after(async () => {
  const db = getDatabase();
  if (jobIds.length) {
    await db.delete(auditEvents).where(inArray(auditEvents.entityId, jobIds));
    await db.delete(backgroundJobs).where(inArray(backgroundJobs.id, jobIds));
  }
  const rubricRows = await db.select().from(conductAttitude).where(and(eq(conductAttitude.partialId, "SYNTH-P1"), eq(conductAttitude.studentId, studentId), eq(conductAttitude.type, "Rubrica C.A.")));
  if (rubricRows.length) await db.delete(auditEvents).where(inArray(auditEvents.entityId, rubricRows.map((row) => row.id)));
  await db.delete(conductAttitude).where(and(eq(conductAttitude.partialId, "SYNTH-P1"), eq(conductAttitude.studentId, studentId), eq(conductAttitude.type, "Rubrica C.A.")));
  await db.delete(conductAttitude).where(eq(conductAttitude.id, noteId));
  await db.delete(attendance).where(eq(attendance.id, attendanceId));
  await db.delete(grades).where(eq(grades.id, `grade-ca-SYNTH-P1-${studentId}`));
  await db.delete(classSessions).where(eq(classSessions.id, sessionId));
  await db.delete(students).where(eq(students.id, studentId));
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
  await closeDatabaseForTests();
});

test("la rúbrica C.A. guarda evidencia, reintenta por hash y asigna 10 sin incidencias", async () => {
  const deniedWorker = await handleCaRubricWorker(new Request("https://worker.test/", { method: "POST", body: "{}" }));
  assert.equal(deniedWorker.status, 403, "la URL pública debe rechazar invocaciones que no vengan de un trigger Neon");
  const deniedGet = await fetch(new URL("/api/teacher/ca-rubric-job?partialId=SYNTH-P1", baseUrl));
  assert.equal(deniedGet.status, 401);
  const deniedPost = await fetch(new URL("/api/teacher/ca-rubric-job", baseUrl), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ partialId: "SYNTH-P1", group: "1 A" }),
  });
  assert.equal(deniedPost.status, 401);

  const db = getDatabase();
  await db.insert(students).values({ id: studentId, name: "Alumno sintético de rúbrica", level: "Secundaria", grade: "1", group: "CA", schoolYear: "TEST-LOCAL", assignment: "Prueba", sourceSheet: "fixture" });
  await db.insert(classSessions).values({ id: sessionId, partialId: "SYNTH-P1", classDate: "2026-09-02", group: "1 CA", subject: "Español", status: "Realizada" });
  await db.insert(attendance).values({ id: attendanceId, sessionId, partialId: "SYNTH-P1", studentId, group: "1 CA", classDate: "2026-09-02", status: "R" });
  await db.insert(conductAttitude).values({
    id: noteId, partialId: "SYNTH-P1", studentId, group: "1 CA", date: "2026-09-02",
    type: "Anotacion", observation: "Dejó desordenado su lugar de trabajo.", infraction: "FALSE", status: "Registrada",
    sessionId, recordedBy: "fixture", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });

  delete process.env.GEMINI_API_KEY;
  await assert.rejects(startCaRubricJobPostgres({ partialId: "SYNTH-P1", group: "1 CA" }), /Configura GEMINI_API_KEY/);
  process.env.GEMINI_API_KEY = "synthetic-test-key-not-used-by-the-fake-evaluator";

  let prompt = "";
  const firstJob = await startCaRubricJobPostgres({ partialId: "SYNTH-P1", group: "1 CA" });
  jobIds.push(firstJob.id);
  assert.equal(firstJob.status, "En_proceso");
  assert.equal(firstJob.total, 1);
  const fakeAI = async (value) => {
    prompt = value;
    return {
      model: "fake-test-model",
      data: { criterios: CONDUCT_ATTITUDE_CRITERIA.map((criterio, index) => ({
        indice: index + 1, puntuacion: index === 0 ? 8 : index === 1 ? 9 : 10,
        evidencias: index === 0 ? [noteId] : index === 1 ? [attendanceId] : [], justificacion: "Resultado ficticio para prueba.",
      })) },
    };
  };
  const completed = await advanceCaRubricJobPostgres(firstJob.id, fakeAI);
  assert.equal(completed.status, "Completado");
  assert.equal(completed.completed, 1);
  assert.match(prompt, /Dejó desordenado su lugar de trabajo/);
  const [rubric] = await db.select().from(conductAttitude).where(and(
    eq(conductAttitude.partialId, "SYNTH-P1"), eq(conductAttitude.studentId, studentId), eq(conductAttitude.type, "Rubrica C.A."),
  ));
  assert.equal(rubric.rubricVersion, CONDUCT_ATTITUDE_RUBRIC_VERSION);
  assert.equal(rubric.status, "Evaluada_ai");
  assert.equal(Number(rubric.score), 9.4);
  assert.equal(rubric.sourceHash.length, 64);
  assert.equal((rubric.rubricCriteria)[0].evidencias[0], noteId);
  const [grade] = await db.select().from(grades).where(eq(grades.id, `grade-ca-SYNTH-P1-${studentId}`));
  assert.equal(Number(grade.conductAttitudeGrade), 94);
  assert.equal((await startCaRubricJobPostgres({ partialId: "SYNTH-P1", group: "1 CA" })).status, "Sin_pendientes");
  assert.equal((await getCaRubricJobPostgres("SYNTH-P1")).id, firstJob.id);

  await db.update(conductAttitude).set({ observation: "Corrigió y ordenó su lugar de trabajo después del recordatorio.", updatedAt: new Date().toISOString() }).where(eq(conductAttitude.id, noteId));
  const invalidJob = await startCaRubricJobPostgres({ partialId: "SYNTH-P1", group: "1 CA" });
  jobIds.push(invalidJob.id);
  const invalidResult = await advanceCaRubricJobPostgres(invalidJob.id, async () => ({
    model: "fake-invalid-model",
    data: { criterios: CONDUCT_ATTITUDE_CRITERIA.map((criterio, index) => ({ indice: index + 1, puntuacion: 8, evidencias: ["ID-INVALIDO"], justificacion: "Inválido." })) },
  }));
  assert.equal(invalidResult.status, "Completado_con_errores");
  assert.equal(invalidResult.failureCount, 1);
  const retryJob = await startCaRubricJobPostgres({ partialId: "SYNTH-P1", group: "1 CA" });
  jobIds.push(retryJob.id);
  assert.equal(retryJob.status, "En_proceso", "un alumno fallido debe poder reintentarse al volver a evaluar");
  assert.equal((await advanceCaRubricJobPostgres(retryJob.id, fakeAI)).status, "Completado");

  await db.delete(conductAttitude).where(eq(conductAttitude.id, noteId));
  await db.update(attendance).set({ status: "I" }).where(eq(attendance.id, attendanceId));
  const noEvidenceJob = await startCaRubricJobPostgres({ partialId: "SYNTH-P1", group: "1 CA" });
  jobIds.push(noEvidenceJob.id);
  const workerGeminiKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const blockedWorkerResponse = await handleCaRubricWorker(new Request("https://worker.test/", {
    method: "POST",
    headers: { "content-type": "application/json", "x-neon-trigger-invocation-id": "synthetic-trigger-invocation" },
    body: JSON.stringify({ data: { scheduled_at: "2026-09-30T12:00:00.000Z" } }),
  }));
  assert.equal(blockedWorkerResponse.status, 200);
  const blockedWorkerResult = await blockedWorkerResponse.json();
  assert.equal(blockedWorkerResult.attempted, 0);
  assert.equal(blockedWorkerResult.blocked, "gemini_key_missing");
  assert.equal((await getCaRubricJobPostgres("SYNTH-P1")).status, "En_proceso", "sin clave IA el worker conserva el job pendiente");
  process.env.GEMINI_API_KEY = workerGeminiKey;
  const workerResponse = await handleCaRubricWorker(new Request("https://worker.test/", {
    method: "POST",
    headers: { "content-type": "application/json", "x-neon-trigger-invocation-id": "synthetic-trigger-invocation" },
    body: JSON.stringify({ data: { scheduled_at: "2026-09-30T12:00:00.000Z" } }),
  }));
  assert.equal(workerResponse.status, 200);
  const workerResult = await workerResponse.json();
  assert.equal(workerResult.attempted, 1);
  assert.equal(workerResult.progressed, 1);
  const noEvidenceResult = await getCaRubricJobPostgres("SYNTH-P1");
  assert.equal(noEvidenceResult.status, "Completado");
  const [rubricWithoutEvidence] = await db.select().from(conductAttitude).where(and(
    eq(conductAttitude.partialId, "SYNTH-P1"), eq(conductAttitude.studentId, studentId), eq(conductAttitude.type, "Rubrica C.A."),
  ));
  assert.equal(rubricWithoutEvidence.rubricModel, "Regla sin incidencias");
  assert.ok(rubricWithoutEvidence.rubricCriteria.every((criterion) => criterion.puntuacion === 10));
});
