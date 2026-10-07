import assert from "node:assert/strict";
import test, { after } from "node:test";
import { and, eq, inArray, or } from "drizzle-orm";
import { closeDatabaseForTests, getDatabase } from "../db/client.ts";
import { academicPeriods, aiReports, auditEvents, classSessions, studentGrades, studentGroups, students } from "../db/schema.ts";
import { lookupStudentInPostgres } from "../lib/student-access.ts";
import { saveClassSessionInPostgres } from "../lib/teacher-session-postgres.ts";
import {
  applyStudentImportInPostgres,
  createStudentGradeInPostgres,
  createStudentGroupInPostgres,
  getStudentRegistryInPostgres,
  previewStudentImportInPostgres,
  saveStudentInPostgres,
  setStudentActiveInPostgres,
  setStudentGradeActiveInPostgres,
  setStudentGroupActiveInPostgres,
  updateStudentGradeInPostgres,
  updateStudentGroupInPostgres,
} from "../lib/student-registry-postgres.ts";

const token = crypto.randomUUID().slice(0, 8).toUpperCase();
const gradeName = `PAD-TEST-${token}`;
const renamedGradeName = `PAD-TEST-RENAMED-${token}`;
const groupName = `1o A Sec ${token}`;
const academicGrade = `PAD-GRADE-${token}`;
const academicSection = `PAD-SECTION-${token}`;
const existingId = `PAD-SYNTH-EDIT-${token}`;
const newId = `PAD-SYNTH-NEW-${token}`;
const reportId = `PAD-SYNTH-REPORT-${token}`;
const partialId = `PAD-SYNTH-PARTIAL-${token}`;
const cycle = "2099-2100";
let gradeId = "";
let groupId = "";
let sessionId = "";

after(async () => {
  const db = getDatabase();
  if (sessionId) await db.delete(auditEvents).where(eq(auditEvents.entityId, sessionId));
  if (sessionId) await db.delete(classSessions).where(eq(classSessions.id, sessionId));
  await db.delete(aiReports).where(eq(aiReports.id, reportId));
  await db.delete(academicPeriods).where(eq(academicPeriods.id, partialId));
  await db.delete(students).where(inArray(students.id, [existingId, newId]));
  if (groupId) await db.delete(auditEvents).where(eq(auditEvents.entityId, groupId));
  if (gradeId) await db.delete(auditEvents).where(eq(auditEvents.entityId, gradeId));
  await db.delete(auditEvents).where(inArray(auditEvents.studentId, [existingId, newId]));
  if (groupId) await db.delete(studentGroups).where(eq(studentGroups.id, groupId));
  if (gradeId) await db.delete(studentGrades).where(eq(studentGrades.id, gradeId));
  await closeDatabaseForTests();
});

test("el padrón valida catálogos, aplica Excel atómicamente y conserva el historial en bajas", async () => {
  const db = getDatabase();
  const createdGrade = await createStudentGradeInPostgres({ name: gradeName });
  gradeId = createdGrade.id;
  await assert.rejects(createStudentGradeInPostgres({ name: gradeName.toLowerCase() }), /Ya existe ese grado/);
  const createdGroup = await createStudentGroupInPostgres({ name: groupName, gradeId, studentGrade: academicGrade, section: academicSection });
  groupId = createdGroup.id;
  await assert.rejects(createStudentGroupInPostgres({ name: `${groupName} duplicado`, gradeId, studentGrade: academicGrade, section: academicSection }), /correspondencia académica ya pertenece/);
  await saveStudentInPostgres({ id: existingId, name: "Alumno sintético antes", groupId, schoolYear: cycle });

  const rows = [
    { rowNumber: 2, id: existingId, name: "Alumno sintético actualizado", groupAndGrade: `${groupName}, ${gradeName}` },
    { rowNumber: 3, id: newId, name: "Alta sintética", groupAndGrade: `${groupName}, ${gradeName}` },
  ];
  const preview = await previewStudentImportInPostgres(rows, cycle);
  assert.deepEqual(preview.counts, { altas: 1, actualizaciones: 1, sinCambios: 0, conflictos: 0 });
  await assert.rejects(applyStudentImportInPostgres({ rows, schoolYear: cycle, confirmNew: false }), /Confirma expresamente/);

  const invalidRows = [rows[0], { rowNumber: 4, id: `PAD-SYNTH-BAD-${token}`, name: "Fila sintética inválida", groupAndGrade: "Grupo inexistente, grado inexistente" }];
  await assert.rejects(applyStudentImportInPostgres({ rows: invalidRows, schoolYear: cycle, confirmNew: true }), /todo el lote se detuvo/);
  const [beforeRollback] = await db.select().from(students).where(eq(students.id, existingId));
  assert.equal(beforeRollback.name, "Alumno sintético antes", "un conflicto debe detener todo el lote");

  assert.deepEqual(await applyStudentImportInPostgres({ rows, schoolYear: cycle, confirmNew: true }), { created: 1, updated: 1, unchanged: 0, total: 2 });
  const appliedPreview = await previewStudentImportInPostgres(rows, cycle);
  assert.deepEqual(appliedPreview.counts, { altas: 0, actualizaciones: 0, sinCambios: 2, conflictos: 0 }, "repetir la misma carga debe ser idempotente");
  const [updatedExisting, createdNew] = await Promise.all([
    db.select().from(students).where(eq(students.id, existingId)),
    db.select().from(students).where(eq(students.id, newId)),
  ]);
  assert.equal(updatedExisting[0].name, "Alumno sintético actualizado");
  assert.equal(createdNew[0].schoolYear, cycle);
  await assert.rejects(saveStudentInPostgres({ id: `OTHER-${token}`, originalId: existingId, name: "Cambio no permitido", groupId }), /ID escolar es inmutable/);

  await db.insert(academicPeriods).values({ id: partialId, name: "Periodo sintético de padrón", schoolYear: cycle });
  await db.insert(aiReports).values({ id: reportId, partialId, studentId: newId, type: "Prueba", status: "Borrador", summary: "Registro sintético de historial" });
  const capturedSession = await saveClassSessionInPostgres({ partialId, group: `${academicGrade} ${academicSection}`, date: "2099-09-01" });
  sessionId = capturedSession.sesion_id;
  await setStudentActiveInPostgres({ id: newId, active: false });
  await setStudentActiveInPostgres({ id: existingId, active: false });
  assert.equal((await db.select().from(aiReports).where(eq(aiReports.id, reportId))).length, 1, "desactivar no borra referencias académicas");
  await assert.rejects(lookupStudentInPostgres(newId), /No se encontró el ID escolar/);
  await assert.rejects(saveClassSessionInPostgres({ partialId, group: `${academicGrade} ${academicSection}`, date: "2099-09-02" }), /El grupo no tiene alumnos registrados/);
  await setStudentActiveInPostgres({ id: newId, active: true });
  await setStudentActiveInPostgres({ id: existingId, active: true });
  assert.equal((await lookupStudentInPostgres(newId)).student.id, newId);

  await assert.rejects(updateStudentGroupInPostgres({ id: groupId, name: groupName, gradeId, studentGrade: "2°", section: "B" }), /tiene alumnos asignados/);
  await updateStudentGradeInPostgres({ id: gradeId, name: renamedGradeName });
  const [renamedStudent] = await db.select().from(students).where(eq(students.id, newId));
  assert.equal(renamedStudent.level, renamedGradeName, "renombrar un grado conserva el vínculo con sus alumnos");
  await setStudentGradeActiveInPostgres({ id: gradeId, active: false });
  const [retiredGroup] = await db.select().from(studentGroups).where(eq(studentGroups.id, groupId));
  assert.equal(retiredGroup.active, false, "retirar el grado desactiva sus grupos asociados");
  await setStudentGradeActiveInPostgres({ id: gradeId, active: true });
  await setStudentGroupActiveInPostgres({ id: groupId, active: true });

  const registry = await getStudentRegistryInPostgres();
  assert.ok(registry.students.some((student) => student.id === newId && student.catalogGroupName === groupName));
  const relatedAudits = await db.select().from(auditEvents).where(or(eq(auditEvents.studentId, newId), and(eq(auditEvents.entity, "CATALOGO_GRADOS"), eq(auditEvents.entityId, gradeId))));
  assert.ok(relatedAudits.length >= 5, "altas, cambios de catálogo y ciclo de vida quedan auditados");
});
