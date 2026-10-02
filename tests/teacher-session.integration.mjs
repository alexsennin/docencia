import assert from "node:assert/strict";
import test, { after } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDatabaseForTests, getDatabase } from "../db/client.ts";
import { academicPeriods, auditEvents, attendance, classSessions, conductAttitude, grades, taskGrades, tasks } from "../db/schema.ts";
import { attachTasksToSessionInPostgres, cancelClassSessionInPostgres, createAcademicPeriodInPostgres, createTaskInPostgres, deleteTaskInPostgres, getTeacherAcademicSnapshotInPostgres, saveClassSessionInPostgres, savePartialModeInPostgres, saveSessionWorkspaceInPostgres, saveTaskWeightsInPostgres } from "../lib/teacher-session-postgres.ts";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:13000";
const sessionId = "SYNTH-SESSION-001";
let createdTaskId = "";
let sessionTaskId = "";
let plannedSessionId = "";
let originalGradeRows = [];
let originalPartial;
let originalSeedSession;
let originalSeedAttendance;
let originalSeedConductRows;
let originalSeedTask;
let originalSeedTaskGrade;
let originalWeightAuditIds = [];
let originalTaskAttachAuditIds = [];
let teacherCookie = "";
const createdPartialIds = new Set();
const payload = {
  sessionId,
  attendance: [{ studentId: "SYNTH-001", status: "R" }],
  students: [{ studentId: "SYNTH-001", annotation: "Comentario ficticio de prueba de sesión." }],
  taskScores: [{ taskId: "SYNTH-TASK-001", entries: [{ studentId: "SYNTH-001", score: "8", state: "Calificada" }] }],
};

after(async () => {
  const db = getDatabase();
  for (const partialId of createdPartialIds) {
    await db.delete(grades).where(eq(grades.partialId, partialId));
    await db.delete(auditEvents).where(eq(auditEvents.entityId, partialId));
    await db.delete(academicPeriods).where(eq(academicPeriods.id, partialId));
  }
  await db.delete(conductAttitude).where(and(eq(conductAttitude.sessionId, sessionId), eq(conductAttitude.studentId, "SYNTH-001")));
  if (originalSeedConductRows.length) await db.insert(conductAttitude).values(originalSeedConductRows);
  await db.delete(attendance).where(and(eq(attendance.id, "SYNTH-ATTENDANCE-001"), eq(attendance.studentId, "SYNTH-001")));
  if (originalSeedAttendance) await db.insert(attendance).values(originalSeedAttendance);
  await db.delete(taskGrades).where(and(eq(taskGrades.id, "SYNTH-TASK-GRADE-001"), eq(taskGrades.studentId, "SYNTH-001")));
  if (originalSeedTaskGrade) await db.insert(taskGrades).values(originalSeedTaskGrade);
  if (originalSeedSession) {
    await db.update(classSessions).set({
      partialId: originalSeedSession.partialId,
      classDate: originalSeedSession.classDate,
      group: originalSeedSession.group,
      subject: originalSeedSession.subject,
      topic: originalSeedSession.topic,
      status: originalSeedSession.status,
      notes: originalSeedSession.notes,
      recordedBy: originalSeedSession.recordedBy,
      createdAt: originalSeedSession.createdAt,
      updatedAt: originalSeedSession.updatedAt,
      captureStatus: originalSeedSession.captureStatus,
      rollCallComplete: originalSeedSession.rollCallComplete,
    }).where(eq(classSessions.id, sessionId));
  }
  await db.delete(grades).where(eq(grades.partialId, "SYNTH-P1"));
  if (originalGradeRows.length) await db.insert(grades).values(originalGradeRows);
  if (originalPartial) await db.update(academicPeriods).set({ continuousAssessmentMode: originalPartial.continuousAssessmentMode, updatedAt: originalPartial.updatedAt }).where(eq(academicPeriods.id, originalPartial.id));
  if (originalSeedTask) await db.update(tasks).set({ active: originalSeedTask.active, bankStatus: originalSeedTask.bankStatus, continuousAssessmentWeight: originalSeedTask.continuousAssessmentWeight, updatedAt: originalSeedTask.updatedAt }).where(eq(tasks.id, originalSeedTask.id));
  await db.delete(auditEvents).where(eq(auditEvents.id, "partial-ec-mode-SYNTH-P1-Promedio"));
  await db.delete(auditEvents).where(eq(auditEvents.id, "partial-ec-mode-SYNTH-P1-Ponderado"));
  const weightEvents = await db.select().from(auditEvents).where(and(eq(auditEvents.partialId, "SYNTH-P1"), eq(auditEvents.type, "partial_ec_weights_saved")));
  const originalWeightIds = new Set(originalWeightAuditIds);
  const newWeightIds = weightEvents.filter((event) => !originalWeightIds.has(event.id)).map((event) => event.id);
  if (newWeightIds.length) await db.delete(auditEvents).where(inArray(auditEvents.id, newWeightIds));
  const taskAttachEvents = await db.select().from(auditEvents).where(and(eq(auditEvents.entityId, sessionId), eq(auditEvents.type, "tasks_attached_to_session")));
  const originalTaskAttachIds = new Set(originalTaskAttachAuditIds);
  const newTaskAttachIds = taskAttachEvents.filter((event) => !originalTaskAttachIds.has(event.id)).map((event) => event.id);
  if (newTaskAttachIds.length) await db.delete(auditEvents).where(inArray(auditEvents.id, newTaskAttachIds));
  if (sessionTaskId) {
    await db.delete(auditEvents).where(eq(auditEvents.entityId, sessionTaskId));
    await db.delete(tasks).where(eq(tasks.id, sessionTaskId));
  }
  if (plannedSessionId) await db.delete(auditEvents).where(eq(auditEvents.id, `session-archived-${plannedSessionId}`));
  if (createdTaskId) {
    await db.delete(auditEvents).where(eq(auditEvents.id, `task-archived-${createdTaskId}`));
    await db.delete(auditEvents).where(eq(auditEvents.entityId, createdTaskId));
    await db.delete(tasks).where(eq(tasks.id, createdTaskId));
  }
  if (plannedSessionId) {
    await db.delete(auditEvents).where(eq(auditEvents.entityId, plannedSessionId));
    await db.delete(classSessions).where(eq(classSessions.id, plannedSessionId));
  }
  await db.delete(auditEvents).where(and(eq(auditEvents.entityId, sessionId), eq(auditEvents.type, "session_workspace_saved")));
  if (originalSeedSession) assert.deepEqual((await db.select().from(classSessions).where(eq(classSessions.id, sessionId)))[0], originalSeedSession);
  assert.deepEqual((await db.select().from(attendance).where(and(eq(attendance.id, "SYNTH-ATTENDANCE-001"), eq(attendance.studentId, "SYNTH-001"))))[0], originalSeedAttendance);
  assert.deepEqual((await db.select().from(taskGrades).where(and(eq(taskGrades.id, "SYNTH-TASK-GRADE-001"), eq(taskGrades.studentId, "SYNTH-001"))))[0], originalSeedTaskGrade);
  const restoredConductRows = await db.select().from(conductAttitude).where(and(eq(conductAttitude.sessionId, sessionId), eq(conductAttitude.studentId, "SYNTH-001")));
  assert.deepEqual(restoredConductRows, originalSeedConductRows);
  await closeDatabaseForTests();
});

test("el guardado docente de sesión persiste P/I/R, comentario y tarea de forma idempotente", async () => {
  const db = getDatabase();
  [originalSeedSession] = await db.select().from(classSessions).where(eq(classSessions.id, sessionId));
  [originalSeedAttendance] = await db.select().from(attendance).where(and(eq(attendance.id, "SYNTH-ATTENDANCE-001"), eq(attendance.studentId, "SYNTH-001")));
  originalSeedConductRows = await db.select().from(conductAttitude).where(and(eq(conductAttitude.sessionId, sessionId), eq(conductAttitude.studentId, "SYNTH-001")));
  [originalSeedTaskGrade] = await db.select().from(taskGrades).where(and(eq(taskGrades.id, "SYNTH-TASK-GRADE-001"), eq(taskGrades.studentId, "SYNTH-001")));
  const periodName = `SYNTH-PARTIAL-${Date.now()}`;
  const beforePeriods = await db.select().from(academicPeriods);
  const [createdPeriod, duplicateAttempt] = await Promise.allSettled([
    createAcademicPeriodInPostgres({ name: periodName, cycle: "2026-2027" }),
    createAcademicPeriodInPostgres({ name: periodName, cycle: "2026-2027" }),
  ]);
  assert.equal(createdPeriod.status, "fulfilled");
  assert.equal(duplicateAttempt.status, "rejected", "dos solicitudes simultáneas con el mismo nombre no deben crear duplicados");
  const createdPeriodResult = createdPeriod.value;
  createdPartialIds.add(createdPeriodResult.partialId);
  const [createdPeriodRow] = await db.select().from(academicPeriods).where(eq(academicPeriods.id, createdPeriodResult.partialId));
  assert.equal(createdPeriodRow.name, periodName);
  assert.equal(createdPeriodRow.order, beforePeriods.reduce((maximum, item) => Math.max(maximum, Number(item.order) || 0), 0) + 1);
  assert.equal(createdPeriodRow.schoolYear, "2026-2027");
  assert.equal(createdPeriodRow.status, "Pendiente");
  assert.equal(createdPeriodRow.continuousAssessmentMode, "Promedio");
  assert.equal(Number(createdPeriodRow.continuousAssessmentWeight), 40);
  await assert.rejects(createAcademicPeriodInPostgres({ name: periodName.toLowerCase() }), /Ya existe un parcial/);

  // The authenticated route refreshes snapshots for every student in the selected partial.
  originalGradeRows = await db.select().from(grades).where(eq(grades.partialId, "SYNTH-P1"));
  [originalPartial] = await db.select().from(academicPeriods).where(eq(academicPeriods.id, "SYNTH-P1"));
  [originalSeedTask] = await db.select().from(tasks).where(eq(tasks.id, "SYNTH-TASK-001"));
  originalWeightAuditIds = (await db.select().from(auditEvents).where(and(eq(auditEvents.partialId, "SYNTH-P1"), eq(auditEvents.type, "partial_ec_weights_saved")))).map((event) => event.id);
  originalTaskAttachAuditIds = (await db.select().from(auditEvents).where(and(eq(auditEvents.entityId, sessionId), eq(auditEvents.type, "tasks_attached_to_session")))).map((event) => event.id);
  const unauthorized = await fetch(new URL("/api/teacher/academic", baseUrl));
  assert.equal(unauthorized.status, 401, "la lectura docente debe exigir sesión autenticada");
  const unauthorizedWrite = await fetch(new URL("/api/teacher/academic", baseUrl), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "saveSessionWorkspace", payload }),
  });
  assert.equal(unauthorizedWrite.status, 401, "la escritura docente debe exigir sesión autenticada");

  const plannedPayload = { partialId: "SYNTH-P1", group: "1 A", date: "2026-09-03", topic: "Sesión ficticia planeada", planned: true };
  const plannedSession = await saveClassSessionInPostgres(plannedPayload);
  plannedSessionId = plannedSession.sesion_id;
  const openedAgain = await saveClassSessionInPostgres(plannedPayload);
  assert.equal(plannedSession.sesion_id, openedAgain.sesion_id);
  assert.equal(openedAgain.alreadyExists, true, "reintentar la misma apertura no debe duplicar la sesión");

  const changedMode = await savePartialModeInPostgres({ partialId: "SYNTH-P1", mode: "Ponderado" });
  assert.deepEqual(changedMode, { partialId: "SYNTH-P1", mode: "Ponderado", alreadyApplied: false });
  assert.equal((await savePartialModeInPostgres({ partialId: "SYNTH-P1", mode: "Ponderado" })).alreadyApplied, true);
  await assert.rejects(savePartialModeInPostgres({ partialId: "SYNTH-P1", mode: "Otro" }), /Elige Promedio o Ponderado/);
  const weights = await saveTaskWeightsInPostgres({ partialId: "SYNTH-P1", group: "1 A", entries: [{ taskId: "SYNTH-TASK-001", weight: 100 }] });
  assert.deepEqual(weights, { partialId: "SYNTH-P1", group: "1 A", saved: 1, total: 100 });
  assert.equal(Number((await db.select().from(tasks).where(eq(tasks.id, "SYNTH-TASK-001")))[0].continuousAssessmentWeight), 100);
  await assert.rejects(saveTaskWeightsInPostgres({ partialId: "SYNTH-P1", group: "1 A", entries: [{ taskId: "SYNTH-TASK-001", weight: 90 }] }), /deben sumar 100%/);

  const createdTask = await createTaskInPostgres({ sessionId, name: "Tarea sintética adjunta", type: "Tarea", maxScore: 10, required: true, description: "Sólo para integración." });
  createdTaskId = createdTask.tarea_id;
  assert.equal(createdTask.parcial_id, "SYNTH-P1");
  assert.equal(createdTask.estado_banco, "Pendiente");
  const attached = await attachTasksToSessionInPostgres({ sessionId, taskIds: [createdTaskId] });
  const attachedAgain = await attachTasksToSessionInPostgres({ sessionId, taskIds: [createdTaskId] });
  assert.deepEqual(attached, { sessionId, taskIds: [createdTaskId], attached: 1 });
  assert.deepEqual(attachedAgain, attached, "reintentar la asignación a la misma sesión debe ser seguro");
  const taskAfterAttach = (await getTeacherAcademicSnapshotInPostgres()).tasks.find((task) => task.tarea_id === createdTaskId);
  assert.equal(taskAfterAttach.estado_banco, "En_calificacion");
  assert.equal(taskAfterAttach.sesion_calificacion_id, sessionId);
  await assert.rejects(saveTaskWeightsInPostgres({ partialId: "SYNTH-P1", group: "1 A", entries: [{ taskId: "SYNTH-TASK-001", weight: 100 }] }), /lista de actividades cambió/);

  const sessionTask = await createTaskInPostgres({ sessionId: plannedSessionId, name: "Trabajo sintético archivado con sesión", type: "Trabajo en clase", maxScore: 10, required: true });
  sessionTaskId = sessionTask.tarea_id;

  const first = await saveSessionWorkspaceInPostgres(payload);
  const retry = await saveSessionWorkspaceInPostgres(payload);
  assert.deepEqual(first, { sessionId, saved: true });
  assert.deepEqual(retry, first);

  const snapshot = await getTeacherAcademicSnapshotInPostgres();
  const savedAttendance = snapshot.absences.filter((row) => row.sesion_id === sessionId && row.alumno_id === "SYNTH-001");
  assert.equal(savedAttendance.length, 1);
  assert.equal(savedAttendance[0].estado, "R");
  assert.equal(snapshot.conduct.find((row) => row.sesion_id === sessionId && row.tipo === "Anotacion")?.observacion, payload.students[0].annotation);
  assert.equal(snapshot.taskScores.find((row) => row.tarea_id === "SYNTH-TASK-001" && row.alumno_id === "SYNTH-001")?.puntaje, "8");
  assert.equal(snapshot.tasks.find((row) => row.tarea_id === "SYNTH-TASK-001")?.estado_banco, "Calificada");

  const [currentAttendance] = await db.select().from(attendance).where(and(eq(attendance.sessionId, sessionId), eq(attendance.studentId, "SYNTH-001")));
  const [currentNote] = await db.select().from(conductAttitude).where(and(eq(conductAttitude.sessionId, sessionId), eq(conductAttitude.type, "Anotacion"), eq(conductAttitude.studentId, "SYNTH-001")));
  const [currentScore] = await db.select().from(taskGrades).where(and(eq(taskGrades.taskId, "SYNTH-TASK-001"), eq(taskGrades.studentId, "SYNTH-001")));
  const scoreRows = await db.select().from(taskGrades).where(and(eq(taskGrades.taskId, "SYNTH-TASK-001"), eq(taskGrades.studentId, "SYNTH-001")));
  const [currentTask] = await db.select().from(tasks).where(eq(tasks.id, "SYNTH-TASK-001"));
  const events = await db.select().from(auditEvents).where(and(eq(auditEvents.entityId, sessionId), eq(auditEvents.type, "session_workspace_saved")));
  assert.ok(currentAttendance && currentNote && currentScore && currentTask);
  assert.equal(scoreRows.length, 1, "repetir el guardado no debe crear calificaciones duplicadas");
  assert.equal(events.length, 1, "repetir el mismo guardado no debe duplicar su evento de auditoría");

  await assert.rejects(
    saveSessionWorkspaceInPostgres({ ...payload, attendance: [{ studentId: "SYNTH-001", status: "I" }], taskScores: [{ taskId: "SYNTH-TASK-001", entries: [{ studentId: "SYNTH-001", score: "11", state: "Calificada" }] }] }),
    /calificación válida/,
  );
  const afterRejectedWrite = await getTeacherAcademicSnapshotInPostgres();
  assert.equal(afterRejectedWrite.absences.find((row) => row.sesion_id === sessionId && row.alumno_id === "SYNTH-001")?.estado, "R");

  if (process.env.TEST_TEACHER_PASSWORD) {
    const login = await fetch(new URL("/api/teacher/login", baseUrl), {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: process.env.TEST_TEACHER_PASSWORD }),
    });
    assert.equal(login.status, 200);
    teacherCookie = login.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
    assert.ok(teacherCookie);
    const routePartialName = `SYNTH-ROUTE-PARTIAL-${Date.now()}`;
    const createdThroughRoute = await fetch(new URL("/api/teacher/academic", baseUrl), {
      method: "POST", headers: { "content-type": "application/json", cookie: teacherCookie },
      body: JSON.stringify({ action: "createPartial", payload: { name: routePartialName, cycle: "2026-2027" } }),
    });
    assert.equal(createdThroughRoute.status, 200);
    const createdThroughRouteBody = await createdThroughRoute.json();
    assert.equal(createdThroughRouteBody.result.name, routePartialName);
    assert.ok(createdThroughRouteBody.snapshot.partials.some((partial) => partial.parcial_id === createdThroughRouteBody.result.partialId));
    createdPartialIds.add(createdThroughRouteBody.result.partialId);
    const duplicateThroughRoute = await fetch(new URL("/api/teacher/academic", baseUrl), {
      method: "POST", headers: { "content-type": "application/json", cookie: teacherCookie },
      body: JSON.stringify({ action: "createPartial", payload: { name: routePartialName.toLowerCase(), cycle: "2026-2027" } }),
    });
    assert.equal(duplicateThroughRoute.status, 400);
    assert.match((await duplicateThroughRoute.json()).error, /Ya existe un parcial/);

    const savedThroughRoute = await fetch(new URL("/api/teacher/academic", baseUrl), {
      method: "POST", headers: { "content-type": "application/json", cookie: teacherCookie },
      body: JSON.stringify({ action: "saveSessionWorkspace", payload }),
    });
    assert.equal(savedThroughRoute.status, 200);
    const routePayload = await savedThroughRoute.json();
    assert.equal(routePayload.result.saved, true);
    const [gradeSnapshot] = await db.select().from(grades).where(and(eq(grades.partialId, "SYNTH-P1"), eq(grades.studentId, "SYNTH-001")));
    assert.ok(gradeSnapshot);
    assert.equal(gradeSnapshot.calculationVersion, "1.0");
    assert.equal(gradeSnapshot.continuousAssessmentMode, "Ponderado");

    for (const mode of ["Promedio", "Ponderado"]) {
      const modeResponse = await fetch(new URL("/api/teacher/academic", baseUrl), {
        method: "POST", headers: { "content-type": "application/json", cookie: teacherCookie },
        body: JSON.stringify({ action: "savePartialMode", payload: { partialId: "SYNTH-P1", mode } }),
      });
      assert.equal(modeResponse.status, 200);
      assert.equal((await modeResponse.json()).result.mode, mode);
    }
    const weightsResponse = await fetch(new URL("/api/teacher/academic", baseUrl), {
      method: "POST", headers: { "content-type": "application/json", cookie: teacherCookie },
      body: JSON.stringify({ action: "saveTaskWeights", payload: { partialId: "SYNTH-P1", group: "1 A", entries: [{ taskId: "SYNTH-TASK-001", weight: 50 }, { taskId: createdTaskId, weight: 50 }] } }),
    });
    assert.equal(weightsResponse.status, 200);
    assert.equal((await weightsResponse.json()).result.saved, 2);

    const deleteResponse = await fetch(new URL("/api/teacher/academic", baseUrl), {
      method: "POST", headers: { "content-type": "application/json", cookie: teacherCookie },
      body: JSON.stringify({ action: "deleteTask", payload: { taskId: createdTaskId } }),
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal((await deleteResponse.json()).result.deleted, true);
    const cancelResponse = await fetch(new URL("/api/teacher/academic", baseUrl), {
      method: "POST", headers: { "content-type": "application/json", cookie: teacherCookie },
      body: JSON.stringify({ action: "cancelClassSession", payload: { sessionId: plannedSessionId } }),
    });
    assert.equal(cancelResponse.status, 200);
    const cancelBody = await cancelResponse.json();
    assert.equal(cancelBody.result.status, "Cancelada");
    assert.equal(cancelBody.result.archivedTaskCount, 1);
  }

  if (!teacherCookie) {
    assert.deepEqual(await deleteTaskInPostgres({ taskId: createdTaskId }), { taskId: createdTaskId, partialId: "SYNTH-P1", deleted: true });
    const cancelled = await cancelClassSessionInPostgres({ sessionId: plannedSessionId });
    assert.deepEqual(cancelled, { sessionId: plannedSessionId, partialId: "SYNTH-P1", status: "Cancelada", alreadyCancelled: false, archivedTaskCount: 1 });
  }
  assert.equal((await db.select().from(tasks).where(eq(tasks.id, sessionTaskId)))[0].active, false, "archivar la sesión debe archivar las actividades que se crearon en ella");
  assert.equal((await deleteTaskInPostgres({ taskId: createdTaskId })).alreadyInactive, true);
  assert.deepEqual(await cancelClassSessionInPostgres({ sessionId: plannedSessionId }), { sessionId: plannedSessionId, partialId: "SYNTH-P1", status: "Cancelada", alreadyCancelled: true, archivedTaskCount: 0 });
});
