import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/client.ts";
import { academicPeriods, auditEvents, studentGrades, studentGroups, students } from "../db/schema.ts";
import type { StudentRosterRow } from "./student-roster-file.ts";

type Grade = typeof studentGrades.$inferSelect;
type Group = typeof studentGroups.$inferSelect;
type Student = typeof students.$inferSelect;
type RegistryRow = { id?: unknown; name?: unknown; groupAndGrade?: unknown; rowNumber?: unknown };
const now = () => new Date().toISOString();
const clean = (value: unknown) => String(value ?? "").trim();
const matchKey = (value: unknown) => clean(value).replace(/\s+/g, " ").toLocaleUpperCase("es-MX");
const normalizedId = (value: unknown) => clean(value).toLocaleUpperCase("es-MX");

export class StudentRegistryError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

async function lockRegistry(tx: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0]) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('docencia:student-registry'), hashtext('global'))`);
}

async function recordAudit(tx: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0], input: {
  type: string; entity: string; entityId: string; studentId?: string; details: Record<string, unknown>;
}) {
  await tx.insert(auditEvents).values({
    id: randomUUID(), type: input.type, entity: input.entity, entityId: input.entityId,
    studentId: input.studentId ?? "", actorId: "docente", details: input.details, occurredAt: now(),
  });
}

function catalogSnapshot(grades: Grade[], groups: Group[], roster: Student[]) {
  const gradesById = new Map(grades.map((grade) => [grade.id, grade]));
  const groupsWithGrade = groups.map((group) => ({
    ...group,
    gradeName: gradesById.get(group.gradeId)?.name ?? "",
    studentCount: roster.filter((student) =>
      matchKey(student.level) === matchKey(gradesById.get(group.gradeId)?.name) &&
      matchKey(student.grade) === matchKey(group.studentGrade) &&
      matchKey(student.group) === matchKey(group.section),
    ).length,
  }));
  const studentsWithCatalog = roster.map((student) => {
    const mappedGroup = groupsWithGrade.find((group) =>
      matchKey(group.gradeName) === matchKey(student.level) &&
      matchKey(group.studentGrade) === matchKey(student.grade) &&
      matchKey(group.section) === matchKey(student.group),
    );
    return { ...student, catalogGroupId: mappedGroup?.id ?? "", catalogGroupName: mappedGroup?.name ?? "" };
  });
  return { grades: [...grades].sort((a, b) => a.name.localeCompare(b.name, "es-MX")), groups: groupsWithGrade.sort((a, b) => a.name.localeCompare(b.name, "es-MX")), students: studentsWithCatalog.sort((a, b) => a.name.localeCompare(b.name, "es-MX")) };
}

function schoolYearDefault(periods: Array<typeof academicPeriods.$inferSelect>) {
  const eligible = periods.filter((period) => clean(period.schoolYear) && !["CERRADO", "ARCHIVADO", "CANCELADO"].includes(matchKey(period.status)));
  const candidates = eligible.length ? eligible : periods;
  return [...candidates].sort((a, b) => (Number(b.order) || 0) - (Number(a.order) || 0))[0]?.schoolYear ?? "";
}

export async function getStudentRegistryInPostgres() {
  const db = getDatabase();
  const [grades, groups, roster, periods] = await Promise.all([
    db.select().from(studentGrades).orderBy(asc(studentGrades.name)),
    db.select().from(studentGroups).orderBy(asc(studentGroups.name)),
    db.select().from(students).orderBy(asc(students.name)),
    db.select().from(academicPeriods),
  ]);
  return { ...catalogSnapshot(grades, groups, roster), defaultSchoolYear: schoolYearDefault(periods) };
}

function requireName(value: unknown, label: string, maxLength: number) {
  const name = clean(value);
  if (!name || name.length > maxLength) throw new StudentRegistryError(`${label} es obligatorio y debe tener hasta ${maxLength} caracteres.`);
  return name;
}

function validateGroupName(value: unknown) {
  const name = requireName(value, "El nombre del grupo", 80);
  if (name.includes(",")) throw new StudentRegistryError("El nombre del grupo no puede contener una coma; la coma separa grupo y grado en Excel.");
  return name;
}

function groupTarget(groupId: unknown, grades: Grade[], groups: Group[]) {
  const group = groups.find((item) => item.id === clean(groupId));
  const grade = group && grades.find((item) => item.id === group.gradeId);
  if (!group || !group.active || !grade || !grade.active) throw new StudentRegistryError("Selecciona un grupo y grado vigentes del catálogo.");
  return { group, grade };
}

function normalizeStudentInputs(row: RegistryRow, lineFallback = 0) {
  const id = clean(row.id);
  const name = clean(row.name);
  const pair = clean(row.groupAndGrade).split(",");
  const rowNumber = Number.isSafeInteger(row.rowNumber) ? Number(row.rowNumber) : lineFallback;
  const problem: string[] = [];
  if (!id || id.length > 64) problem.push("ID obligatorio (máximo 64 caracteres).");
  if (!name || name.length > 160) problem.push("Nombre obligatorio (máximo 160 caracteres).");
  if (pair.length !== 2 || !pair[0].trim() || !pair[1].trim()) problem.push("Grupo y grado debe tener el formato «Grupo, Grado».");
  return { id, name, groupName: pair[0]?.trim() ?? "", gradeName: pair[1]?.trim() ?? "", rowNumber, problem };
}

export type StudentImportPreviewRow = {
  rowNumber: number; id: string; name: string; groupAndGrade: string;
  action: "alta" | "actualizacion" | "sin-cambios" | "conflicto";
  message: string;
};

type PlannedImport = ReturnType<typeof normalizeStudentInputs> & {
  group?: Group; grade?: Grade; student?: Student;
  action: "alta" | "actualizacion" | "sin-cambios" | "conflicto";
};

export function buildStudentImportPreview(rows: StudentRosterRow[], grades: Grade[], groups: Group[], roster: Student[], cycle: string) {
  const normalized = rows.map((row, index) => normalizeStudentInputs(row, index + 2));
  const counts = new Map<string, number>();
  for (const row of normalized) if (row.id) counts.set(normalizedId(row.id), (counts.get(normalizedId(row.id)) ?? 0) + 1);
  const studentById = new Map<string, Student[]>();
  for (const student of roster) {
    const key = normalizedId(student.id);
    studentById.set(key, [...(studentById.get(key) ?? []), student]);
  }

  const planned: PlannedImport[] = normalized.map((row) => {
    if (counts.get(normalizedId(row.id)) && counts.get(normalizedId(row.id))! > 1) row.problem.push("ID repetido en el archivo.");
    const exactMatches = studentById.get(normalizedId(row.id)) ?? [];
    if (exactMatches.length > 1) row.problem.push("Hay más de un alumno registrado con este ID normalizado; requiere revisión.");
    const student = exactMatches[0];
    if (student && !student.active) row.problem.push("El ID pertenece a un alumno inactivo. Restáuralo desde la gestión manual antes de importar.");

    const grade = grades.find((item) => item.active && matchKey(item.name) === matchKey(row.gradeName));
    const group = grade && groups.find((item) => item.active && item.gradeId === grade.id && matchKey(item.name) === matchKey(row.groupName));
    if (!grade) row.problem.push(`El grado «${row.gradeName || "(vacío)"}» no existe o está retirado del catálogo.`);
    else if (!group) row.problem.push(`El grupo «${row.groupName || "(vacío)"}» no pertenece al grado «${grade.name}" o está retirado.`);
    if (!student && !clean(cycle)) row.problem.push("Selecciona el ciclo escolar para las altas nuevas.");

    const after = group && grade ? { name: row.name, level: grade.name, grade: group.studentGrade, group: group.section } : null;
    const unchanged = student && after && student.name === after.name && matchKey(student.level) === matchKey(after.level) && matchKey(student.grade) === matchKey(after.grade) && matchKey(student.group) === matchKey(after.group);
    return { ...row, grade, group, student, action: row.problem.length ? "conflicto" as const : !student ? "alta" as const : unchanged ? "sin-cambios" as const : "actualizacion" as const };
  });
  const preview: StudentImportPreviewRow[] = planned.map((row) => ({
    rowNumber: row.rowNumber, id: row.id, name: row.name, groupAndGrade: `${row.groupName}, ${row.gradeName}`,
    action: row.action, message: row.problem.join(" "),
  }));
  const countsByAction = {
    altas: preview.filter((row) => row.action === "alta").length,
    actualizaciones: preview.filter((row) => row.action === "actualizacion").length,
    sinCambios: preview.filter((row) => row.action === "sin-cambios").length,
    conflictos: preview.filter((row) => row.action === "conflicto").length,
  };
  return { preview, counts: countsByAction, canApply: countsByAction.conflictos === 0 && (countsByAction.altas + countsByAction.actualizaciones > 0), planned };
}

export async function previewStudentImportInPostgres(rows: StudentRosterRow[], cycle: unknown) {
  const db = getDatabase();
  const [grades, groups, roster] = await Promise.all([
    db.select().from(studentGrades), db.select().from(studentGroups), db.select().from(students),
  ]);
  return buildStudentImportPreview(rows, grades, groups, roster, clean(cycle));
}

export async function createStudentGradeInPostgres(input: { name?: unknown }) {
  const name = requireName(input.name, "El grado", 80);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await lockRegistry(tx);
    const existing = await tx.select().from(studentGrades);
    if (existing.some((item) => matchKey(item.name) === matchKey(name))) throw new StudentRegistryError("Ya existe ese grado.", 409);
    const timestamp = now();
    const created = { id: `grade-${randomUUID()}`, name, active: true, createdAt: timestamp, updatedAt: timestamp };
    await tx.insert(studentGrades).values(created);
    await recordAudit(tx, { type: "grade_catalog_created", entity: "CATALOGO_GRADOS", entityId: created.id, details: { name } });
    return created;
  });
}

export async function updateStudentGradeInPostgres(input: { id?: unknown; name?: unknown }) {
  const id = clean(input.id);
  const name = requireName(input.name, "El grado", 80);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await lockRegistry(tx);
    const [grade] = await tx.select().from(studentGrades).where(eq(studentGrades.id, id)).limit(1);
    if (!grade) throw new StudentRegistryError("No se encontró el grado.", 404);
    if (!grade.active) throw new StudentRegistryError("Restaura el grado antes de editarlo.");
    const allGrades = await tx.select().from(studentGrades);
    if (allGrades.some((item) => item.id !== id && matchKey(item.name) === matchKey(name))) throw new StudentRegistryError("Ya existe ese grado.", 409);
    if (grade.name === name) return { ...grade, unchanged: true };
    const timestamp = now();
    await tx.update(studentGrades).set({ name, updatedAt: timestamp }).where(eq(studentGrades.id, id));
    const assigned = (await tx.select().from(students)).filter((student) => matchKey(student.level) === matchKey(grade.name));
    for (const student of assigned) {
      await tx.update(students).set({ level: name, updatedAt: timestamp }).where(eq(students.id, student.id));
      await recordAudit(tx, { type: "student_level_updated_by_catalog", entity: "PADRON_ALUMNOS", entityId: student.id, studentId: student.id, details: { before: { level: grade.name }, after: { level: name }, source: "CATALOGO_GRADOS" } });
    }
    await recordAudit(tx, { type: "grade_catalog_renamed", entity: "CATALOGO_GRADOS", entityId: id, details: { before: grade.name, after: name, studentsUpdated: assigned.length } });
    return { ...grade, name, updatedAt: timestamp, studentsUpdated: assigned.length };
  });
}

export async function setStudentGradeActiveInPostgres(input: { id?: unknown; active?: unknown }) {
  const id = clean(input.id);
  const active = input.active === true;
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await lockRegistry(tx);
    const [grade] = await tx.select().from(studentGrades).where(eq(studentGrades.id, id)).limit(1);
    if (!grade) throw new StudentRegistryError("No se encontró el grado.", 404);
    if (grade.active === active) return { id, active, unchanged: true };
    const timestamp = now();
    await tx.update(studentGrades).set({ active, updatedAt: timestamp }).where(eq(studentGrades.id, id));
    let groupsRetired = 0;
    if (!active) {
      const changed = await tx.update(studentGroups).set({ active: false, updatedAt: timestamp }).where(and(eq(studentGroups.gradeId, id), eq(studentGroups.active, true))).returning({ id: studentGroups.id });
      groupsRetired = changed.length;
    }
    await recordAudit(tx, { type: active ? "grade_catalog_restored" : "grade_catalog_retired", entity: "CATALOGO_GRADOS", entityId: id, details: { name: grade.name, groupsRetired } });
    return { id, active, groupsRetired };
  });
}

export async function createStudentGroupInPostgres(input: { name?: unknown; gradeId?: unknown; studentGrade?: unknown; section?: unknown }) {
  const name = validateGroupName(input.name);
  const studentGrade = requireName(input.studentGrade, "El grado académico", 40);
  const section = requireName(input.section, "La sección", 32);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await lockRegistry(tx);
    const grades = await tx.select().from(studentGrades);
    const grade = grades.find((item) => item.id === clean(input.gradeId) && item.active);
    if (!grade) throw new StudentRegistryError("Selecciona un grado vigente del catálogo.");
    const groups = await tx.select().from(studentGroups);
    if (groups.some((item) => item.gradeId === grade.id && matchKey(item.name) === matchKey(name))) throw new StudentRegistryError("Ya existe ese nombre de grupo para el grado seleccionado.", 409);
    if (groups.some((item) => item.gradeId === grade.id && matchKey(item.studentGrade) === matchKey(studentGrade) && matchKey(item.section) === matchKey(section))) throw new StudentRegistryError("Esa correspondencia académica ya pertenece a otro grupo del catálogo.", 409);
    const timestamp = now();
    const created = { id: `group-${randomUUID()}`, gradeId: grade.id, name, studentGrade, section, active: true, createdAt: timestamp, updatedAt: timestamp };
    await tx.insert(studentGroups).values(created);
    await recordAudit(tx, { type: "group_catalog_created", entity: "CATALOGO_GRUPOS", entityId: created.id, details: { name, grade: grade.name, studentGrade, section } });
    return created;
  });
}

export async function updateStudentGroupInPostgres(input: { id?: unknown; name?: unknown; gradeId?: unknown; studentGrade?: unknown; section?: unknown }) {
  const id = clean(input.id);
  const name = validateGroupName(input.name);
  const gradeId = clean(input.gradeId);
  const studentGrade = requireName(input.studentGrade, "El grado académico", 40);
  const section = requireName(input.section, "La sección", 32);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await lockRegistry(tx);
    const [group] = await tx.select().from(studentGroups).where(eq(studentGroups.id, id)).limit(1);
    if (!group) throw new StudentRegistryError("No se encontró el grupo.", 404);
    if (!group.active) throw new StudentRegistryError("Restaura el grupo antes de editarlo.");
    const [grade] = await tx.select().from(studentGrades).where(and(eq(studentGrades.id, gradeId), eq(studentGrades.active, true))).limit(1);
    if (!grade) throw new StudentRegistryError("Selecciona un grado vigente del catálogo.");
    const allGroups = await tx.select().from(studentGroups);
    if (allGroups.some((item) => item.id !== id && item.gradeId === gradeId && matchKey(item.name) === matchKey(name))) throw new StudentRegistryError("Ya existe ese nombre de grupo para el grado seleccionado.", 409);
    if (allGroups.some((item) => item.id !== id && item.gradeId === gradeId && matchKey(item.studentGrade) === matchKey(studentGrade) && matchKey(item.section) === matchKey(section))) throw new StudentRegistryError("Esa correspondencia académica ya pertenece a otro grupo del catálogo.", 409);
    const [oldGrade] = await tx.select().from(studentGrades).where(eq(studentGrades.id, group.gradeId)).limit(1);
    const mappedStudents = (await tx.select().from(students)).filter((student) =>
      matchKey(student.level) === matchKey(oldGrade?.name) &&
      matchKey(student.grade) === matchKey(group.studentGrade) &&
      matchKey(student.group) === matchKey(group.section),
    );
    const mappingChanged = group.gradeId !== gradeId || matchKey(group.studentGrade) !== matchKey(studentGrade) || matchKey(group.section) !== matchKey(section);
    if (mappedStudents.length && mappingChanged) throw new StudentRegistryError("Este grupo tiene alumnos asignados. Cambia su grupo desde la ficha de cada alumno antes de editar la correspondencia.");
    if (group.name === name && !mappingChanged) return { ...group, unchanged: true };
    const timestamp = now();
    await tx.update(studentGroups).set({ name, gradeId, studentGrade, section, updatedAt: timestamp }).where(eq(studentGroups.id, id));
    await recordAudit(tx, { type: "group_catalog_updated", entity: "CATALOGO_GRUPOS", entityId: id, details: { before: { name: group.name, gradeId: group.gradeId, studentGrade: group.studentGrade, section: group.section }, after: { name, gradeId, studentGrade, section } } });
    return { ...group, name, gradeId, studentGrade, section, updatedAt: timestamp };
  });
}

export async function setStudentGroupActiveInPostgres(input: { id?: unknown; active?: unknown }) {
  const id = clean(input.id);
  const active = input.active === true;
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await lockRegistry(tx);
    const [group] = await tx.select().from(studentGroups).where(eq(studentGroups.id, id)).limit(1);
    if (!group) throw new StudentRegistryError("No se encontró el grupo.", 404);
    if (active) {
      const [grade] = await tx.select().from(studentGrades).where(eq(studentGrades.id, group.gradeId)).limit(1);
      if (!grade?.active) throw new StudentRegistryError("Restaura primero el grado al que pertenece el grupo.");
    }
    if (group.active === active) return { id, active, unchanged: true };
    await tx.update(studentGroups).set({ active, updatedAt: now() }).where(eq(studentGroups.id, id));
    await recordAudit(tx, { type: active ? "group_catalog_restored" : "group_catalog_retired", entity: "CATALOGO_GRUPOS", entityId: id, details: { name: group.name } });
    return { id, active };
  });
}

export async function saveStudentInPostgres(input: { id?: unknown; originalId?: unknown; name?: unknown; groupId?: unknown; schoolYear?: unknown }) {
  const id = clean(input.id);
  const originalId = clean(input.originalId);
  const name = requireName(input.name, "El nombre", 160);
  const schoolYear = clean(input.schoolYear);
  if (!originalId && (!id || id.length > 64)) throw new StudentRegistryError("El ID es obligatorio y debe tener hasta 64 caracteres.");
  if (!originalId && (!schoolYear || schoolYear.length > 30)) throw new StudentRegistryError("El ciclo escolar es obligatorio y debe tener hasta 30 caracteres.");
  if (originalId && id && normalizedId(id) !== normalizedId(originalId)) throw new StudentRegistryError("El ID escolar es inmutable.");
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await lockRegistry(tx);
    const grades = await tx.select().from(studentGrades);
    const groups = await tx.select().from(studentGroups);
    const { group, grade } = groupTarget(input.groupId, grades, groups);
    const timestamp = now();
    if (originalId) {
      const [student] = await tx.select().from(students).where(eq(students.id, originalId)).limit(1);
      if (!student) throw new StudentRegistryError("No se encontró el alumno.", 404);
      if (!student.active) throw new StudentRegistryError("Restaura al alumno antes de editarlo.");
      const changes = { name, level: grade.name, grade: group.studentGrade, group: group.section };
      if (student.name === name && matchKey(student.level) === matchKey(grade.name) && matchKey(student.grade) === matchKey(group.studentGrade) && matchKey(student.group) === matchKey(group.section)) return { id: originalId, unchanged: true };
      await tx.update(students).set({ ...changes, updatedAt: timestamp }).where(eq(students.id, originalId));
      await recordAudit(tx, { type: "student_updated", entity: "PADRON_ALUMNOS", entityId: originalId, studentId: originalId, details: { before: { name: student.name, level: student.level, grade: student.grade, group: student.group }, after: changes } });
      return { id: originalId, unchanged: false };
    }
    const matches = await tx.select().from(students).where(sql`upper(btrim(${students.id})) = ${normalizedId(id)}`);
    if (matches.length) throw new StudentRegistryError("Ya existe un alumno con ese ID. Edita la ficha existente.", 409);
    const student = { id, name, level: grade.name, grade: group.studentGrade, group: group.section, schoolYear, assignment: null, sourceSheet: "Captura docente", active: true, updatedAt: timestamp, deactivatedAt: null, deactivatedBy: null };
    await tx.insert(students).values(student);
    await recordAudit(tx, { type: "student_created", entity: "PADRON_ALUMNOS", entityId: id, studentId: id, details: { after: { name, level: grade.name, grade: group.studentGrade, group: group.section, schoolYear } } });
    return { id, unchanged: false };
  });
}

export async function setStudentActiveInPostgres(input: { id?: unknown; active?: unknown }) {
  const id = clean(input.id);
  const active = input.active === true;
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await lockRegistry(tx);
    const [student] = await tx.select().from(students).where(eq(students.id, id)).limit(1);
    if (!student) throw new StudentRegistryError("No se encontró el alumno.", 404);
    if (student.active === active) return { id, active, unchanged: true };
    const timestamp = now();
    await tx.update(students).set({ active, deactivatedAt: active ? null : timestamp, deactivatedBy: active ? null : "docente", updatedAt: timestamp }).where(eq(students.id, id));
    await recordAudit(tx, { type: active ? "student_restored" : "student_deactivated", entity: "PADRON_ALUMNOS", entityId: id, studentId: id, details: { name: student.name, level: student.level, grade: student.grade, group: student.group } });
    return { id, active, unchanged: false };
  });
}

export async function applyStudentImportInPostgres(input: { rows?: unknown; schoolYear?: unknown; confirmNew?: unknown }) {
  const sourceRows = Array.isArray(input.rows) ? input.rows as RegistryRow[] : [];
  if (!sourceRows.length || sourceRows.length > 2000) throw new StudentRegistryError("La carga debe contener entre 1 y 2,000 filas.");
  const rows = sourceRows.map((row, index) => ({ rowNumber: Number(row.rowNumber) || index + 2, id: clean(row.id), name: clean(row.name), groupAndGrade: clean(row.groupAndGrade) }));
  const cycle = clean(input.schoolYear);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await lockRegistry(tx);
    const grades = await tx.select().from(studentGrades);
    const groups = await tx.select().from(studentGroups);
    const roster = await tx.select().from(students);
    const result = buildStudentImportPreview(rows, grades, groups, roster, cycle);
    if (!result.canApply) throw new StudentRegistryError(`No se aplicó el archivo: ${result.counts.conflictos} filas tienen conflictos y todo el lote se detuvo.`, 409);
    if (result.counts.altas && input.confirmNew !== true) throw new StudentRegistryError("Confirma expresamente el alta de los IDs nuevos antes de aplicar el lote.", 409);

    const timestamp = now();
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const row of result.planned) {
      if (row.action === "sin-cambios") { unchanged++; continue; }
      if (!row.group || !row.grade) throw new StudentRegistryError("No se pudo validar la correspondencia del catálogo.", 409);
      const after = { name: row.name, level: row.grade.name, grade: row.group.studentGrade, group: row.group.section };
      if (row.student) {
        await tx.update(students).set({ ...after, updatedAt: timestamp }).where(eq(students.id, row.student.id));
        await recordAudit(tx, { type: "student_imported_updated", entity: "PADRON_ALUMNOS", entityId: row.student.id, studentId: row.student.id, details: { rowNumber: row.rowNumber, source: "excel", before: { name: row.student.name, level: row.student.level, grade: row.student.grade, group: row.student.group }, after } });
        updated++;
      } else {
        const student = { id: row.id, ...after, schoolYear: cycle, assignment: null, sourceSheet: "Carga Excel", active: true, updatedAt: timestamp, deactivatedAt: null, deactivatedBy: null };
        await tx.insert(students).values(student);
        await recordAudit(tx, { type: "student_imported_created", entity: "PADRON_ALUMNOS", entityId: row.id, studentId: row.id, details: { rowNumber: row.rowNumber, source: "excel", after: { ...after, schoolYear: cycle } } });
        created++;
      }
    }
    return { created, updated, unchanged, total: rows.length };
  });
}
