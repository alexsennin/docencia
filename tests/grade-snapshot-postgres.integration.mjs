import assert from "node:assert/strict";
import test, { after } from "node:test";
import { and, eq } from "drizzle-orm";
import { closeDatabaseForTests, getDatabase } from "../db/client.ts";
import { grades, students } from "../db/schema.ts";
import { refreshGradeSnapshotsInPostgres, saveGradeSnapshotsInPostgres } from "../lib/teacher-session-postgres.ts";

const partialId = "SYNTH-P1";
const studentId = "SYNTH-001";
let originalRows = [];

const snapshotRow = (overrides = {}) => ({
  partialId, studentId, days: 3, absences: 1, missingTasks: 0,
  ca: 90, ec: 85, ecMode: "Promedio", ecDetails: [{ taskId: "SYNTH-TASK-001", name: "Actividad ficticia", state: "Calificada", score: 85, weight: null }],
  ex: 80, final100: 84, final10: 8.4, status: "Completa", ...overrides,
});

after(async () => {
  const db = getDatabase();
  await db.delete(grades).where(eq(grades.partialId, partialId));
  if (originalRows.length) await db.insert(grades).values(originalRows);
  await closeDatabaseForTests();
});

test("los snapshots calculados de calificación se guardan y actualizan sin duplicados", async () => {
  const db = getDatabase();
  originalRows = await db.select().from(grades).where(eq(grades.partialId, partialId));
  const originalStudentRows = originalRows.filter((row) => row.studentId === studentId);
  assert.ok(originalStudentRows.length <= 1, "la fixture no debe partir de calificaciones duplicadas");

  const first = await saveGradeSnapshotsInPostgres([snapshotRow()]);
  assert.deepEqual(first, { partialId, saved: 1 });
  const [saved] = await db.select().from(grades).where(and(eq(grades.partialId, partialId), eq(grades.studentId, studentId)));
  assert.equal(Number(saved.classDays), 3);
  assert.equal(Number(saved.absences), 1);
  assert.equal(Number(saved.conductAttitudeGrade), 90);
  assert.equal(Number(saved.continuousAssessment), 85);
  assert.equal(Number(saved.exam), 80);
  assert.equal(Number(saved.partialGrade), 84);
  assert.equal(Number(saved.gradeOnTen), 8.4);
  assert.deepEqual(saved.continuousAssessmentDetails, snapshotRow().ecDetails);
  assert.equal(saved.calculationVersion, "1.0");

  await Promise.all([
    saveGradeSnapshotsInPostgres([snapshotRow({ ex: 86, final100: 87, final10: 8.7 })]),
    saveGradeSnapshotsInPostgres([snapshotRow({ ex: 88, final100: 88, final10: 8.8 })]),
  ]);
  const afterConcurrentWrites = await db.select().from(grades).where(and(eq(grades.partialId, partialId), eq(grades.studentId, studentId)));
  assert.equal(afterConcurrentWrites.length, 1, "las actualizaciones concurrentes deben conservar una sola fila por alumno y parcial");

  await saveGradeSnapshotsInPostgres([snapshotRow({ ex: 90, final100: 89, final10: 8.9 })]);
  const updated = await db.select().from(grades).where(and(eq(grades.partialId, partialId), eq(grades.studentId, studentId)));
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, saved.id);
  assert.equal(Number(updated[0].exam), 90);
  assert.equal(Number(updated[0].partialGrade), 89);

  await assert.rejects(saveGradeSnapshotsInPostgres([snapshotRow({ final100: 101 })]), /calificación parcial no es válida/);
  await assert.rejects(saveGradeSnapshotsInPostgres([snapshotRow(), snapshotRow()]), /vacío o duplicado/);
  await assert.rejects(saveGradeSnapshotsInPostgres([snapshotRow({ studentId: "SYNTH-UNKNOWN" })]), /alumnos que no existen/);

  const refreshed = await refreshGradeSnapshotsInPostgres(partialId);
  assert.equal(refreshed.partialId, partialId);
  assert.equal(refreshed.saved, (await db.select().from(students)).length, "el refresco cubre el padrón completo cargado localmente");
  const afterRefresh = await db.select().from(grades).where(and(eq(grades.partialId, partialId), eq(grades.studentId, studentId)));
  assert.equal(afterRefresh.length, 1);
});
