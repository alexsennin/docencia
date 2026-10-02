import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { calculateAcademicMatrix, toGradeSnapshotRow, type AcademicRow, type AcademicSnapshot } from "./academic-engine.ts";
import { getDatabase } from "../db/client.ts";
import {
  academicPeriods,
  attendance,
  auditEvents,
  classSessions,
  conductAttitude,
  examAttempts,
  examAssignments,
  exams,
  grades,
  aiReports,
  students,
  taskGrades,
  tasks,
} from "../db/schema.ts";

type Row = Record<string, unknown>;
const id = () => randomUUID();
const normalizeId = (value: unknown) => String(value ?? "").trim().toUpperCase();
const groupKey = (grade: unknown, group: unknown) => `${String(grade ?? "").trim()} ${String(group ?? "").trim()}`.trim();
const boolText = (value: unknown) => value === true ? "TRUE" : value === false ? "FALSE" : "";
const jsonText = (value: unknown) => value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);

export class AcademicPeriodError extends Error {
  readonly status = 400;
}

function toSnapshotRow(source: Row, columns: Record<string, string>) {
  return Object.fromEntries(Object.entries(columns).map(([key, property]) => {
    const value = source[property];
    const normalized = typeof value === "boolean" ? boolText(value)
      : ["opciones_json", "rubrica_criterios_json", "rubrica_propuesta_json", "rubrica_evidencias_json", "detalle_ec_json", "recomendaciones_json", "evidencias_json", "payload_json", "detalle_json"].includes(key)
        ? jsonText(value)
        : value ?? "";
    return [key, normalized];
  })) as AcademicRow;
}

const partialColumns = { parcial_id: "id", nombre: "name", orden: "order", ciclo_escolar: "schoolYear", materia: "subject", estado: "status", fecha_inicio: "startsOn", fecha_cierre: "closesOn", peso_asistencias: "attendanceWeight", peso_trabajos_clase: "classworkWeight", peso_tareas: "tasksWeight", peso_evaluacion_continua: "continuousAssessmentWeight", peso_conducta: "conductWeight", peso_actitud: "attitudeWeight", peso_examen: "examWeight", ponderacion_total: "totalWeight", created_at: "createdAt", updated_at: "updatedAt", modo_evaluacion_continua: "continuousAssessmentMode" };
const studentColumns = { id: "id", nombre: "name", nivel: "level", grado: "grade", grupo: "group", ciclo_escolar: "schoolYear", asignacion: "assignment", hoja_origen: "sourceSheet" };
const sessionColumns = { sesion_id: "id", parcial_id: "partialId", fecha_clase: "classDate", grupo: "group", materia: "subject", tema: "topic", estado: "status", observaciones: "notes", registrado_por: "recordedBy", created_at: "createdAt", updated_at: "updatedAt", estado_captura: "captureStatus", pase_lista_completo: "rollCallComplete" };
const attendanceColumns = { asistencia_id: "id", sesion_id: "sessionId", parcial_id: "partialId", alumno_id: "studentId", grupo: "group", fecha_clase: "classDate", estado: "status", observaciones: "notes", registrado_por: "recordedBy", created_at: "createdAt", updated_at: "updatedAt" };
const taskColumns = { tarea_id: "id", parcial_id: "partialId", grupo: "group", nombre: "name", tipo: "type", fecha_asignacion: "assignedOn", fecha_entrega: "dueOn", puntaje_maximo: "maxScore", obligatoria: "mandatory", activa: "active", created_at: "createdAt", updated_at: "updatedAt", sesion_id: "sessionId", descripcion: "description", peso_ec: "continuousAssessmentWeight", estado_banco: "bankStatus", sesion_calificacion_id: "gradingSessionId" };
const taskGradeColumns = { registro_id: "id", tarea_id: "taskId", parcial_id: "partialId", alumno_id: "studentId", grupo: "group", entregada: "submitted", fecha_entrega: "submittedOn", puntaje: "score", estado: "status", observaciones: "notes", updated_at: "updatedAt", sesion_calificacion_id: "gradingSessionId" };
const conductColumns = { registro_id: "id", parcial_id: "partialId", alumno_id: "studentId", grupo: "group", fecha: "date", tipo: "type", observacion: "observation", infraccion: "infraction", puntuacion: "score", rubrica_version: "rubricVersion", estado: "status", registrado_por: "recordedBy", created_at: "createdAt", updated_at: "updatedAt", sesion_id: "sessionId", rubrica_criterios_json: "rubricCriteria", rubrica_propuesta_json: "rubricProposal", rubrica_evidencias_json: "rubricEvidence", rubrica_modelo: "rubricModel", rubrica_fuente_hash: "sourceHash", evaluacion_ia_estado: "aiEvaluationStatus", evaluacion_ia_puntaje_sugerido: "aiSuggestedScore", evaluacion_ia_justificacion: "aiJustification", evaluacion_ia_prompt_version: "aiPromptVersion" };
const gradeColumns = { calificacion_id: "id", parcial_id: "partialId", alumno_id: "studentId", grupo: "group", dias_clase: "classDays", faltas: "absences", tareas_faltantes: "missingTasks", evaluacion_continua: "continuousAssessment", conducta: "conduct", actitud: "attitude", examen: "exam", calificacion_parcial: "partialGrade", calificacion_10: "gradeOnTen", estado: "status", comentario_docente: "teacherComment", reporte_ai_estado: "aiReportStatus", innovat_estado: "innovatStatus", updated_at: "updatedAt", calificacion_ca: "conductAttitudeGrade", modo_evaluacion_continua: "continuousAssessmentMode", detalle_ec_json: "continuousAssessmentDetails", version_calculo: "calculationVersion" };
const examColumns = { examen_id: "id", parcial_id: "partialId", nombre: "name", materia: "subject", grado: "grade", grupo: "group", estado: "status", fecha_apertura: "opensAt", fecha_cierre: "closesAt", duracion_minutos: "durationMinutes", puntaje_maximo: "maxScore", requiere_pantalla_completa: "requiresFullscreen", instrucciones: "instructions", created_at: "createdAt", updated_at: "updatedAt", version: "version", examen_origen_id: "sourceExamId", proveedor_ia: "aiProvider" };
const assignmentColumns = { asignacion_id: "id", alumno_id: "studentId", examen_id: "examId", estado: "status", created_at: "createdAt", updated_at: "updatedAt" };
const attemptColumns = { intento_id: "id", examen_id: "examId", parcial_id: "partialId", alumno_id: "studentId", grupo: "group", estado: "status", inicio_at: "startedAt", fin_at: "finishedAt", tiempo_limite_min: "timeLimitMinutes", puntaje_automatico: "automaticScore", puntaje_ai: "aiScore", puntaje_total: "totalScore", calificacion_10: "gradeOnTen", ai_pendiente: "aiPending", bloqueo_activo: "locked", created_at: "createdAt", updated_at: "updatedAt" };
const reportColumns = { reporte_id: "id", parcial_id: "partialId", alumno_id: "studentId", tipo: "type", estado: "status", resumen: "summary", fortalezas: "strengths", areas_oportunidad: "opportunities", recomendaciones_json: "recommendations", evidencias_json: "evidence", visibilidad_alumno: "studentVisible", revisado_por: "reviewedBy", revisado_at: "reviewedAt", created_at: "createdAt", updated_at: "updatedAt" };

export async function getTeacherAcademicSnapshotInPostgres(): Promise<AcademicSnapshot> {
  const db = getDatabase();
  const [partialRows, studentRows, sessionRows, attendanceRows, taskRows, taskGradeRows, conductRows, gradeRows, reportRows, examRows, assignmentRows, attemptRows] = await Promise.all([
    db.select().from(academicPeriods).orderBy(asc(academicPeriods.order), asc(academicPeriods.id)),
    db.select().from(students).orderBy(asc(students.grade), asc(students.group), asc(students.name)),
    db.select().from(classSessions).orderBy(asc(classSessions.classDate), asc(classSessions.id)),
    db.select().from(attendance), db.select().from(tasks), db.select().from(taskGrades), db.select().from(conductAttitude),
    db.select().from(grades), db.select().from(aiReports), db.select().from(exams), db.select().from(examAssignments),
    db.select().from(examAttempts).where(inArray(examAttempts.status, ["Definitivo", "Provisional"])),
  ]);
  return {
    partials: partialRows.map((row) => toSnapshotRow(row as unknown as Row, partialColumns)),
    students: studentRows.map((row) => toSnapshotRow(row as unknown as Row, studentColumns)),
    sessions: sessionRows.map((row) => toSnapshotRow(row as unknown as Row, sessionColumns)),
    absences: attendanceRows.filter((row) => row.status !== "Anulada").map((row) => toSnapshotRow(row as unknown as Row, attendanceColumns)),
    tasks: taskRows.map((row) => toSnapshotRow(row as unknown as Row, taskColumns)),
    taskScores: taskGradeRows.map((row) => toSnapshotRow(row as unknown as Row, taskGradeColumns)),
    conduct: conductRows.map((row) => toSnapshotRow(row as unknown as Row, conductColumns)),
    grades: gradeRows.map((row) => toSnapshotRow(row as unknown as Row, gradeColumns)),
    reports: reportRows.map((row) => toSnapshotRow(row as unknown as Row, reportColumns)),
    exams: examRows.map((row) => toSnapshotRow(row as unknown as Row, examColumns)),
    assignments: assignmentRows.map((row) => toSnapshotRow(row as unknown as Row, assignmentColumns)),
    attempts: attemptRows.map((row) => toSnapshotRow(row as unknown as Row, attemptColumns)),
  };
}

function boundedScore(value: unknown, name: string, min = 0, max = 100) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${name} no es válida.`);
  return String(number);
}

export async function saveGradeSnapshotsInPostgres(input: unknown[]) {
  if (!Array.isArray(input) || !input.length || input.length > 300) throw new Error("Selecciona entre 1 y 300 calificaciones calculadas.");
  const rows = input as Row[];
  const partialId = String(rows[0]?.partialId ?? "").trim();
  if (!partialId || rows.some((row) => String(row.partialId ?? "").trim() !== partialId)) throw new Error("La matriz debe corresponder a un solo parcial.");
  const seenStudentIds = new Set<string>();
  const normalized = rows.map((row) => {
    const studentId = normalizeId(row.studentId);
    if (!studentId || seenStudentIds.has(studentId)) throw new Error("La matriz contiene un alumno vacío o duplicado.");
    seenStudentIds.add(studentId);
    const days = Number(row.days);
    const absencesCount = Number(row.absences);
    const missingTasksCount = Number(row.missingTasks);
    if (![days, absencesCount, missingTasksCount].every(Number.isInteger) || days < 0 || absencesCount < 0 || absencesCount > days || missingTasksCount < 0) {
      throw new Error("La matriz contiene conteos inválidos.");
    }
    const ecMode = String(row.ecMode ?? "");
    if (ecMode !== "Promedio" && ecMode !== "Ponderado") throw new Error("El modo de evaluación continua no es válido.");
    const status = String(row.status ?? "");
    if (status !== "Completa" && status !== "Pendiente") throw new Error("El estado de la calificación no es válido.");
    if (!Array.isArray(row.ecDetails)) throw new Error("El detalle de evaluación continua no es válido.");
    return {
      source: row,
      studentId,
      days,
      absences: absencesCount,
      missingTasks: missingTasksCount,
      ec: boundedScore(row.ec, "La evaluación continua"),
      ca: boundedScore(row.ca, "La calificación de conducta y actitud"),
      ex: boundedScore(row.ex, "La calificación del examen"),
      final100: boundedScore(row.final100, "La calificación parcial"),
      final10: boundedScore(row.final10, "La calificación sobre 10", 0, 10),
      ecMode,
      ecDetails: row.ecDetails,
      status,
    };
  });

  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [partial] = await tx.select().from(academicPeriods).where(eq(academicPeriods.id, partialId)).for("update").limit(1);
    if (!partial) throw new Error("El parcial de la matriz ya no existe.");
    const studentIds = normalized.map((row) => row.studentId);
    const studentRows = await tx.select().from(students).where(sql`upper(trim(${students.id})) IN (${sql.join(studentIds.map((id) => sql`${id}`), sql`, `)})`);
    const studentsById = new Map(studentRows.map((student) => [normalizeId(student.id), student]));
    if (studentRows.length !== normalized.length) throw new Error("La matriz incluye alumnos que no existen.");
    const currentRows = await tx.select().from(grades).where(eq(grades.partialId, partialId)).for("update");
    const gradesByStudent = new Map<string, typeof currentRows[number]>();
    for (const current of currentRows) {
      const key = normalizeId(current.studentId);
      if (gradesByStudent.has(key)) throw new Error("Hay calificaciones duplicadas para un alumno y parcial; corrige los duplicados antes de continuar.");
      gradesByStudent.set(key, current);
    }
    const now = new Date().toISOString();
    for (const row of normalized) {
      const student = studentsById.get(row.studentId);
      if (!student) throw new Error("La matriz incluye alumnos que no existen.");
      const existing = gradesByStudent.get(row.studentId);
      const values = {
        group: groupKey(student.grade, student.group),
        classDays: String(row.days),
        absences: String(row.absences),
        missingTasks: String(row.missingTasks),
        continuousAssessment: row.ec,
        exam: row.ex,
        partialGrade: row.final100,
        gradeOnTen: row.final10,
        status: row.status,
        updatedAt: now,
        conductAttitudeGrade: row.ca,
        continuousAssessmentMode: row.ecMode,
        continuousAssessmentDetails: row.ecDetails,
        calculationVersion: "1.0",
      };
      if (existing) {
        await tx.update(grades).set(values).where(eq(grades.id, existing.id));
      } else {
        const [created] = await tx.insert(grades).values({
          id: `grade-${randomUUID()}`, partialId, studentId: student.id, ...values,
        }).onConflictDoUpdate({
          target: [grades.partialId, grades.studentId],
          set: values,
        }).returning();
        gradesByStudent.set(row.studentId, created);
      }
    }
    return { partialId, saved: normalized.length };
  });
}

export async function refreshGradeSnapshotsInPostgres(partialIdValue: string) {
  const partialId = String(partialIdValue ?? "").trim();
  if (!partialId) throw new Error("Selecciona el parcial que se va a actualizar.");
  const snapshot = await getTeacherAcademicSnapshotInPostgres();
  const rows = calculateAcademicMatrix(snapshot).filter((item) => item.partialId === partialId).map(toGradeSnapshotRow);
  if (!rows.length) return { partialId, saved: 0 };
  return saveGradeSnapshotsInPostgres(rows);
}

export async function savePartialModeInPostgres(payload: Row) {
  const partialId = String(payload.partialId ?? "").trim();
  const mode = String(payload.mode ?? "");
  if (!partialId) throw new Error("Selecciona el parcial.");
  if (mode !== "Promedio" && mode !== "Ponderado") throw new Error("Elige Promedio o Ponderado para la Evaluación Continua.");
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [partial] = await tx.select().from(academicPeriods).where(eq(academicPeriods.id, partialId)).for("update").limit(1);
    if (!partial) throw new Error("No se encontró el parcial.");
    if (partial.status === "Cerrado") throw new Error("El parcial está cerrado y no admite cambios.");
    if (partial.continuousAssessmentMode === mode) return { partialId, mode, alreadyApplied: true };
    const now = new Date().toISOString();
    await tx.update(academicPeriods).set({ continuousAssessmentMode: mode, updatedAt: now }).where(eq(academicPeriods.id, partialId));
    await tx.insert(auditEvents).values({
      id: `partial-ec-mode-${partialId}-${mode}`, type: "partial_ec_mode_changed", entity: "PARCIALES", entityId: partialId,
      partialId, studentId: "", actorId: "docente", details: { mode }, occurredAt: now,
    }).onConflictDoNothing();
    return { partialId, mode, alreadyApplied: false };
  });
}

export async function createAcademicPeriodInPostgres(payload: Row) {
  const name = String(payload.name ?? "").trim();
  const schoolYear = String(payload.cycle ?? "2026-2027").trim();
  if (!name || name.length > 80) throw new AcademicPeriodError("Escribe un nombre de parcial de hasta 80 caracteres.");
  if (!schoolYear || schoolYear.length > 30) throw new AcademicPeriodError("Escribe un ciclo escolar válido de hasta 30 caracteres.");

  const db = getDatabase();
  return db.transaction(async (tx) => {
    // Serialize duplicate detection and order assignment across concurrent requests.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('docencia:create-academic-period'), hashtext('global'))`);
    const existing = await tx.select({ name: academicPeriods.name, order: academicPeriods.order }).from(academicPeriods);
    if (existing.some((partial) => partial.name.trim().toLocaleLowerCase("es-MX") === name.toLocaleLowerCase("es-MX"))) {
      throw new AcademicPeriodError("Ya existe un parcial con ese nombre.");
    }

    const now = new Date().toISOString();
    const partial = {
      id: `partial-${id()}`,
      name,
      order: existing.reduce((maximum, item) => Math.max(maximum, Number(item.order) || 0), 0) + 1,
      schoolYear,
      subject: "Español",
      status: "Pendiente",
      startsOn: null,
      closesOn: null,
      attendanceWeight: "0",
      classworkWeight: "0",
      tasksWeight: "0",
      continuousAssessmentWeight: "40",
      conductWeight: "10",
      attitudeWeight: "0",
      examWeight: "50",
      totalWeight: "100",
      createdAt: now,
      updatedAt: now,
      continuousAssessmentMode: "Promedio",
    };
    await tx.insert(academicPeriods).values(partial);
    await tx.insert(auditEvents).values({
      id: `partial-created-${partial.id}`,
      type: "partial_created",
      entity: "PARCIALES",
      entityId: partial.id,
      partialId: partial.id,
      studentId: "",
      actorId: "docente",
      details: { name, order: partial.order },
      occurredAt: now,
    });
    return { partialId: partial.id, parcial_id: partial.id, name: partial.name, order: partial.order };
  });
}

export async function saveTaskWeightsInPostgres(payload: Row) {
  const partialId = String(payload.partialId ?? "").trim();
  const group = String(payload.group ?? "").trim();
  const entries = Array.isArray(payload.entries) ? payload.entries as Row[] : [];
  if (!partialId) throw new Error("Selecciona el parcial.");
  if (!group || entries.length > 100) throw new Error("Selecciona un grupo y revisa las actividades.");
  const seen = new Set<string>();
  const normalized = entries.map((entry) => {
    const taskId = String(entry.taskId ?? "").trim();
    const weight = Number(entry.weight);
    if (!taskId || seen.has(taskId) || !Number.isFinite(weight) || weight < 0 || weight > 100) {
      throw new Error("Una ponderación no es válida. Usa porcentajes entre 0 y 100.");
    }
    seen.add(taskId);
    return { taskId, weight: String(weight) };
  });
  const total = normalized.reduce((sum, item) => sum + Number(item.weight), 0);
  if (Math.abs(total - 100) > 0.01) throw new Error("Los porcentajes de las actividades del grupo deben sumar 100%.");

  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [partial] = await tx.select().from(academicPeriods).where(eq(academicPeriods.id, partialId)).for("update").limit(1);
    if (!partial || partial.status === "Cerrado") throw new Error("El parcial no está disponible para configurar ponderaciones.");
    if (partial.continuousAssessmentMode !== "Ponderado") throw new Error("Primero selecciona el modo Ponderado en este parcial.");
    const eligibleTasks = (await tx.select().from(tasks).where(and(eq(tasks.partialId, partialId), eq(tasks.group, group))))
      .filter((task) => task.active !== false && task.bankStatus !== "Pendiente");
    if (normalized.length !== eligibleTasks.length) throw new Error("La lista de actividades cambió. Actualiza la pantalla e inténtalo de nuevo.");
    const eligibleIds = new Set(eligibleTasks.map((task) => task.id));
    if (normalized.some((item) => !eligibleIds.has(item.taskId))) throw new Error("Una ponderación no corresponde a una actividad activa del grupo y parcial.");
    const now = new Date().toISOString();
    for (const item of normalized) {
      await tx.update(tasks).set({ continuousAssessmentWeight: item.weight, updatedAt: now }).where(eq(tasks.id, item.taskId));
    }
    const fingerprint = createHash("sha256").update(JSON.stringify([partialId, group, normalized.slice().sort((a, b) => a.taskId.localeCompare(b.taskId))])).digest("hex").slice(0, 24);
    await tx.insert(auditEvents).values({
      id: `partial-ec-weights-${fingerprint}`, type: "partial_ec_weights_saved", entity: "TAREAS", entityId: "",
      partialId, studentId: "", actorId: "docente", details: { group, count: normalized.length, total }, occurredAt: now,
    }).onConflictDoNothing();
    return { partialId, group, saved: normalized.length, total };
  });
}

export async function cancelClassSessionInPostgres(payload: Row) {
  const sessionId = String(payload.sessionId ?? "").trim();
  if (!sessionId) throw new Error("Selecciona la sesión que vas a eliminar.");
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(classSessions).where(eq(classSessions.id, sessionId)).for("update").limit(1);
    if (!session) throw new Error("No se encontró la sesión.");
    const now = new Date().toISOString();
    const alreadyCancelled = session.status === "Cancelada";
    if (!alreadyCancelled) {
      await tx.update(classSessions).set({ status: "Cancelada", updatedAt: now }).where(eq(classSessions.id, sessionId));
      const rubricRows = await tx.select().from(conductAttitude).where(and(
        eq(conductAttitude.partialId, session.partialId), eq(conductAttitude.group, session.group ?? ""), eq(conductAttitude.type, "Rubrica C.A."),
      ));
      for (const rubric of rubricRows) {
        if (rubric.status !== "Desactualizada") await tx.update(conductAttitude).set({ status: "Desactualizada", updatedAt: now }).where(eq(conductAttitude.id, rubric.id));
      }
    }
    const linkedTasks = await tx.select().from(tasks).where(and(
      or(eq(tasks.sessionId, sessionId), eq(tasks.gradingSessionId, sessionId)), eq(tasks.active, true),
    ));
    for (const task of linkedTasks) {
      await tx.update(tasks).set({ active: false, updatedAt: now }).where(eq(tasks.id, task.id));
      await tx.insert(auditEvents).values({
        id: `session-task-archived-${sessionId}-${task.id}`, type: "task_archived", entity: "TAREAS", entityId: task.id,
        partialId: task.partialId, studentId: "", actorId: "docente", details: { group: task.group, type: task.type, name: task.name, sessionId }, occurredAt: now,
      }).onConflictDoNothing();
    }
    await tx.insert(auditEvents).values({
      id: `session-archived-${sessionId}`, type: "class_session_archived", entity: "SESIONES_CLASE", entityId: sessionId,
      partialId: session.partialId, studentId: "", actorId: "docente", details: {}, occurredAt: now,
    }).onConflictDoNothing();
    return { sessionId, partialId: session.partialId, status: "Cancelada", alreadyCancelled, archivedTaskCount: linkedTasks.length };
  });
}

export async function deleteTaskInPostgres(payload: Row) {
  const taskId = String(payload.taskId ?? "").trim();
  if (!taskId) throw new Error("Selecciona el trabajo o la tarea que vas a eliminar.");
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [task] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update").limit(1);
    if (!task) throw new Error("No se encontró el trabajo o la tarea.");
    if (task.active === false) return { taskId, partialId: task.partialId, alreadyInactive: true };
    const now = new Date().toISOString();
    await tx.update(tasks).set({ active: false, updatedAt: now }).where(eq(tasks.id, taskId));
    await tx.insert(auditEvents).values({
      id: `task-archived-${taskId}`, type: "task_archived", entity: "TAREAS", entityId: taskId,
      partialId: task.partialId, studentId: "", actorId: "docente", details: { group: task.group, type: task.type, name: task.name }, occurredAt: now,
    }).onConflictDoNothing();
    return { taskId, partialId: task.partialId, deleted: true };
  });
}

function validDate(value: unknown) {
  const date = String(value ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
}

export async function saveClassSessionInPostgres(payload: Row) {
  const db = getDatabase();
  const partialId = String(payload.partialId ?? "").trim();
  const group = String(payload.group ?? "").trim();
  const date = String(payload.date ?? "");
  if (!validDate(date)) throw new Error("Selecciona una fecha válida.");
  if (!partialId || !group) throw new Error("El parcial y el grupo son obligatorios.");

  return db.transaction(async (tx) => {
    const [partial] = await tx.select().from(academicPeriods).where(eq(academicPeriods.id, partialId)).for("update").limit(1);
    if (!partial || partial.status === "Cerrado") throw new Error("El parcial no está disponible para captura.");
    const roster = (await tx.select().from(students)).filter((student) => groupKey(student.grade, student.group) === group);
    if (!roster.length) throw new Error("El grupo no tiene alumnos registrados.");
    const matches = (await tx.select().from(classSessions).where(and(
      eq(classSessions.partialId, partialId), eq(classSessions.group, group), eq(classSessions.classDate, date),
    ))).filter((session) => session.status !== "Cancelada");
    if (matches.length > 1) throw new Error("Hay sesiones duplicadas para ese grupo y fecha; corrige los duplicados antes de continuar.");
    if (matches.length === 1) {
      const existing = matches[0];
      if (existing.status === "Impartida" || (!existing.status && payload.planned !== true)) {
        const now = new Date().toISOString();
        const [repaired] = await tx.update(classSessions).set({ status: "Realizada", captureStatus: existing.captureStatus || "Abierta", updatedAt: now }).where(eq(classSessions.id, existing.id)).returning();
        return toSnapshotRow(repaired as unknown as Row, sessionColumns);
      }
      return { ...toSnapshotRow(existing as unknown as Row, sessionColumns), alreadyExists: true };
    }

    const now = new Date().toISOString();
    const sessionId = `class-${id()}`;
    const [created] = await tx.insert(classSessions).values({
      id: sessionId, partialId, classDate: date, group, subject: partial.subject || "Español",
      topic: String(payload.topic ?? "").trim().slice(0, 300), status: payload.planned === true ? "Programada" : "Realizada",
      captureStatus: "Abierta", rollCallComplete: false, notes: "", recordedBy: "docente", createdAt: now, updatedAt: now,
    }).returning();
    await tx.insert(auditEvents).values({
      id: `event-${id()}`, type: payload.planned === true ? "class_session_planned" : "class_session_created",
      entity: "SESIONES_CLASE", entityId: sessionId, partialId, studentId: "", actorId: "docente",
      details: { group, date }, occurredAt: now,
    });
    return toSnapshotRow(created as unknown as Row, sessionColumns);
  });
}

function workspaceRecordId(prefix: string, sessionId: string, entityId: string) {
  return `${prefix}-${sessionId}-${entityId}`;
}

function parseAttendanceStatus(input: unknown) {
  const raw = String(input ?? "").trim();
  const normalized = raw.toLowerCase();
  if (["p", "asistio", "asistió", "asistencia", "presente"].includes(normalized)) return "P";
  if (["i", "no_asistio", "inasistencia", "falta", "faltó", "falto"].includes(normalized)) return "I";
  if (["r", "retardo", "retardó", "retardado"].includes(normalized)) return "R";
  if (raw === "") return "";
  throw new Error("El estado de asistencia no es válido.");
}

function uniqueRosterEntry<T>(entries: unknown[], roster: Map<string, T>, message: string) {
  const seen = new Set<string>();
  return entries.map((entry) => {
    const studentId = normalizeId((entry as Row | null)?.studentId);
    const student = roster.get(studentId);
    if (!student || seen.has(studentId)) throw new Error(message);
    seen.add(studentId);
    return { entry: entry as Row, studentId, student };
  });
}

export async function createTaskInPostgres(payload: Row) {
  const sessionId = String(payload.sessionId ?? "").trim();
  const name = String(payload.name ?? "").trim();
  const type = String(payload.type ?? "");
  const dueDate = String(payload.dueDate ?? "");
  const maxScore = Number(payload.maxScore);
  if (!sessionId) throw new Error("Selecciona una sesión activa.");
  if (!name || name.length > 120) throw new Error("Escribe el nombre del trabajo o tarea.");
  if (type !== "Trabajo en clase" && type !== "Tarea") throw new Error("Elige Trabajo en clase o Tarea.");
  if (dueDate && !validDate(dueDate)) throw new Error("La fecha de entrega no es válida.");
  if (!Number.isFinite(maxScore) || maxScore !== 10) throw new Error("Las tareas y los trabajos en clase se califican sobre 10.");

  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(classSessions).where(eq(classSessions.id, sessionId)).for("update").limit(1);
    if (!session || session.status === "Cancelada") throw new Error("No se encontró una sesión activa.");
    const [partial] = await tx.select().from(academicPeriods).where(eq(academicPeriods.id, session.partialId)).for("update").limit(1);
    if (!partial || partial.status === "Cerrado") throw new Error("El parcial no está disponible para captura.");
    const now = new Date().toISOString();
    const taskId = `task-${id()}`;
    const [created] = await tx.insert(tasks).values({
      id: taskId, partialId: session.partialId, group: session.group, name, type,
      assignedOn: session.classDate, dueOn: type === "Tarea" ? null : dueDate || null,
      maxScore: "10", mandatory: payload.required === false ? false : true, active: true,
      createdAt: now, updatedAt: now, sessionId: session.id, description: String(payload.description ?? "").trim().slice(0, 2000),
      continuousAssessmentWeight: null, bankStatus: type === "Tarea" ? "Pendiente" : "En_calificacion",
      gradingSessionId: type === "Trabajo en clase" ? session.id : null,
    }).returning();
    if (session.status !== "Realizada") {
      await tx.update(classSessions).set({ status: "Realizada", updatedAt: now }).where(eq(classSessions.id, session.id));
    }
    await tx.insert(auditEvents).values({
      id: `event-${id()}`, type: "task_created", entity: "TAREAS", entityId: taskId, partialId: session.partialId,
      studentId: "", actorId: "docente", details: { group: session.group, type, dueDate }, occurredAt: now,
    });
    return toSnapshotRow(created as unknown as Row, taskColumns);
  });
}

export async function attachTasksToSessionInPostgres(payload: Row) {
  const sessionId = String(payload.sessionId ?? "").trim();
  const selectedIds = Array.isArray(payload.taskIds) ? payload.taskIds.map((value) => String(value)) : [];
  if (!sessionId || !selectedIds.length || selectedIds.length > 100) throw new Error("Selecciona una o más tareas pendientes.");
  if (selectedIds.some((taskId, index) => !taskId || selectedIds.indexOf(taskId) !== index)) throw new Error("La selección de tareas está vacía o duplicada.");

  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(classSessions).where(eq(classSessions.id, sessionId)).for("update").limit(1);
    if (!session || session.status !== "Realizada") throw new Error("No se encontró la sesión para calificar tareas.");
    const [partial] = await tx.select().from(academicPeriods).where(eq(academicPeriods.id, session.partialId)).for("update").limit(1);
    if (!partial || partial.status === "Cerrado") throw new Error("El parcial no está disponible para captura.");
    const selectedTasks = await tx.select().from(tasks).where(inArray(tasks.id, selectedIds)).for("update");
    if (selectedTasks.length !== selectedIds.length) throw new Error("Una tarea seleccionada ya no está pendiente o pertenece a otro grupo o parcial. Actualiza la lista e inténtalo de nuevo.");
    const chosen = selectedIds.map((taskId) => {
      const task = selectedTasks.find((candidate) => candidate.id === taskId);
      if (!task || task.active === false || task.type !== "Tarea"
          || (task.bankStatus !== "Pendiente" && !(task.bankStatus === "En_calificacion" && task.gradingSessionId === session.id))
          || task.partialId !== session.partialId || task.group !== session.group) {
        throw new Error("Una tarea seleccionada ya no está pendiente o pertenece a otro grupo o parcial. Actualiza la lista e inténtalo de nuevo.");
      }
      if (task.gradingSessionId && task.gradingSessionId !== session.id) throw new Error("Una tarea seleccionada ya se está calificando en otra sesión.");
      return task;
    });
    const now = new Date().toISOString();
    for (const task of chosen) {
      await tx.update(tasks).set({ bankStatus: "En_calificacion", gradingSessionId: session.id, updatedAt: now }).where(eq(tasks.id, task.id));
    }
    const sortedIds = selectedIds.slice().sort();
    const fingerprint = createHash("sha256").update(JSON.stringify([session.id, sortedIds])).digest("hex").slice(0, 24);
    await tx.insert(auditEvents).values({
      id: `tasks-attached-${session.id}-${fingerprint}`, type: "tasks_attached_to_session", entity: "SESIONES_CLASE",
      entityId: session.id, partialId: session.partialId, studentId: "", actorId: "docente",
      details: { taskIds: selectedIds }, occurredAt: now,
    }).onConflictDoNothing();
    return { sessionId: session.id, taskIds: selectedIds, attached: selectedIds.length };
  });
}

export async function saveSessionWorkspaceInPostgres(payload: Row) {
  const sessionId = String(payload.sessionId ?? "").trim();
  if (!sessionId) throw new Error("Falta la sesión que se va a guardar.");
  const attendanceInputs = Array.isArray(payload.attendance) ? payload.attendance as unknown[] : [];
  const studentInputs = Array.isArray(payload.students) ? payload.students as unknown[] : [];
  const taskInputs = Array.isArray(payload.taskScores) ? payload.taskScores as unknown[] : [];
  if (attendanceInputs.length > 300 || studentInputs.length > 300 || taskInputs.length > 100) throw new Error("La captura excede el tamaño permitido.");

  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(classSessions).where(eq(classSessions.id, sessionId)).for("update").limit(1);
    if (!session || session.status === "Cancelada") throw new Error("No se encontró una sesión editable.");
    if (!session.group) throw new Error("La sesión no tiene un grupo válido.");
    const [partial] = await tx.select().from(academicPeriods).where(eq(academicPeriods.id, session.partialId)).limit(1);
    if (!partial || partial.status === "Cerrado") throw new Error("El parcial no está disponible para captura.");
    const rosterRows = (await tx.select().from(students)).filter((student) => groupKey(student.grade, student.group) === session.group);
    if (!rosterRows.length || rosterRows.length > 300) throw new Error("La sesión debe tener entre 1 y 300 alumnos registrados.");
    const roster = new Map(rosterRows.map((student) => [normalizeId(student.id), student]));
    const normalizedAttendance = uniqueRosterEntry(attendanceInputs, roster, "El pase de lista incluye un alumno inválido o repetido.")
      .map(({ entry, student }) => ({ student, status: parseAttendanceStatus(entry.status) }));
    const normalizedStudents = uniqueRosterEntry(studentInputs, roster, "La captura de conducta incluye un alumno inválido o repetido.")
      .map(({ entry, student }) => {
        const annotation = String(entry.annotation ?? "").trim();
        if (annotation.length > 1000) throw new Error("La anotación no puede exceder 1000 caracteres.");
        const rawScore = entry.caScore;
        const caScore = rawScore === "" || rawScore === null || rawScore === undefined ? "" : Number(rawScore);
        if (caScore !== "" && (!Number.isFinite(caScore) || caScore < 0 || caScore > 10)) throw new Error("Conducta y actitud deben estar entre 0 y 10.");
        return { student, annotation, caScore };
      });

    const sessionAttendance = await tx.select().from(attendance).where(eq(attendance.sessionId, session.id));
    const attendanceByStudent = new Map<string, typeof sessionAttendance[number]>();
    for (const row of sessionAttendance) {
      const key = normalizeId(row.studentId);
      if (attendanceByStudent.has(key)) throw new Error("Hay registros de asistencia duplicados para un alumno de esta sesión.");
      attendanceByStudent.set(key, row);
    }

    const allTasks = await tx.select().from(tasks);
    const allTaskScores = await tx.select().from(taskGrades);
    const seenTasks = new Set<string>();
    const normalizedTasks = taskInputs.map((input) => {
      const taskInput = input as Row;
      const taskId = String(taskInput.taskId ?? "");
      const task = allTasks.find((candidate) => candidate.id === taskId && candidate.active !== false);
      if (!task || seenTasks.has(taskId) || task.partialId !== session.partialId || task.group !== session.group) throw new Error("Una actividad no pertenece al grupo y parcial de esta sesión.");
      const assignedHere = task.gradingSessionId === session.id || (!task.gradingSessionId && task.type === "Trabajo en clase" && task.sessionId === session.id);
      if (!assignedHere) throw new Error("Agrega la tarea pendiente a esta sesión antes de capturar sus calificaciones.");
      seenTasks.add(taskId);
      const taskEntries = Array.isArray(taskInput.entries) ? taskInput.entries as unknown[] : [];
      if (taskEntries.length > roster.size) throw new Error("Una actividad incluye demasiadas calificaciones.");
      const entries = uniqueRosterEntry(taskEntries, roster, "Una calificación incluye un alumno inválido o repetido.").map(({ entry, student }) => {
        const submittedState = String(entry.state ?? "Pendiente");
        if (!["Calificada", "Pendiente", "No_entregada", "Justificada"].includes(submittedState)) throw new Error("La calificación no es válida.");
        const score = entry.score === "" || entry.score === null || entry.score === undefined ? "" : Number(entry.score);
        const maximum = Number(task.maxScore ?? 10);
        if (score !== "" && (!Number.isFinite(score) || score < 0 || score > maximum)) throw new Error("Captura una calificación válida para cada alumno.");
        const state = score !== "" ? score === 0 ? "No_entregada" : "Calificada"
          : submittedState === "Justificada" ? "Justificada" : submittedState === "No_entregada" ? "No_entregada" : "Pendiente";
        const normalizedScore = state === "No_entregada" ? 0 : score;
        const observation = String(entry.observation ?? "").trim();
        if (observation.length > 1000) throw new Error("La observación no puede exceder 1000 caracteres.");
        return { student, state, score: normalizedScore, observation };
      });
      return { task, entries };
    });

    const touchedTaskIds = normalizedTasks.map(({ task }) => task.id);
    const existingTaskGrades = touchedTaskIds.length
      ? allTaskScores.filter((row) => touchedTaskIds.includes(row.taskId))
      : [];
    const scoreByTaskStudent = new Map<string, typeof allTaskScores[number]>();
    for (const row of existingTaskGrades) {
      const key = `${row.taskId}:${normalizeId(row.studentId)}`;
      if (scoreByTaskStudent.has(key)) throw new Error("Hay calificaciones duplicadas para una actividad y alumno; corrige los duplicados antes de guardar.");
      scoreByTaskStudent.set(key, row);
    }

    const now = new Date().toISOString();
    const rubricChanged = new Set<string>();
    for (const { student, status } of normalizedAttendance) {
      const studentId = student.id;
      const previous = attendanceByStudent.get(normalizeId(studentId));
      if ((previous?.status === "R") !== (status === "R")) rubricChanged.add(normalizeId(studentId));
      if (!status) {
        if (previous && previous.status !== "Anulada") await tx.update(attendance).set({ status: "Anulada", updatedAt: now }).where(eq(attendance.id, previous.id));
        continue;
      }
      const attendanceId = previous?.id ?? workspaceRecordId("attendance", session.id, studentId);
      const values = {
        id: attendanceId, sessionId: session.id, partialId: session.partialId, studentId,
        group: session.group, classDate: session.classDate, status, notes: "", recordedBy: "docente",
        createdAt: previous?.createdAt ?? now, updatedAt: now,
      };
      await tx.insert(attendance).values(values).onConflictDoUpdate({ target: attendance.id, set: { ...values, id: attendanceId } });
    }

    const sessionConductRows = await tx.select().from(conductAttitude).where(and(
      eq(conductAttitude.partialId, session.partialId), eq(conductAttitude.group, session.group ?? ""), eq(conductAttitude.sessionId, session.id),
    ));
    for (const { student, annotation, caScore } of normalizedStudents) {
      const caId = workspaceRecordId("session-ca", session.id, student.id);
      const oldCa = sessionConductRows.find((row) => row.id === caId);
      if (caScore !== "") {
        await tx.insert(conductAttitude).values({
          id: caId, partialId: session.partialId, studentId: student.id, group: session.group,
          date: session.classDate, type: "Conducta y actitud", observation: "", infraction: "FALSE", score: String(caScore),
          rubricVersion: "2026-09-v1", status: "Registrada", recordedBy: "docente", sessionId: session.id,
          createdAt: oldCa?.createdAt ?? now, updatedAt: now,
        }).onConflictDoUpdate({ target: conductAttitude.id, set: {
          score: String(caScore), status: "Registrada", updatedAt: now,
        } });
      }
      const noteId = workspaceRecordId("session-note", session.id, student.id);
      const oldNote = sessionConductRows.find((row) => row.id === noteId);
      const oldAnnotation = String(oldNote?.observation ?? "").trim();
      if (oldAnnotation !== annotation) rubricChanged.add(normalizeId(student.id));
      if (annotation || oldNote) {
        const annotationChanged = oldAnnotation !== annotation;
        await tx.insert(conductAttitude).values({
          id: noteId, partialId: session.partialId, studentId: student.id, group: session.group,
          date: session.classDate, type: "Anotacion", observation: annotation, infraction: "FALSE", score: null,
          rubricVersion: "2026-09-v1", status: annotation ? "Registrada" : "Anulada", recordedBy: "docente", sessionId: session.id,
          aiEvaluationStatus: annotation ? annotationChanged ? "Pendiente de evaluar con IA" : oldNote?.aiEvaluationStatus || "Pendiente de evaluar con IA" : "",
          aiSuggestedScore: annotation && !annotationChanged ? oldNote?.aiSuggestedScore ?? null : null,
          aiJustification: annotation && !annotationChanged ? oldNote?.aiJustification ?? "" : "",
          aiPromptVersion: annotation && !annotationChanged ? oldNote?.aiPromptVersion ?? "" : "",
          createdAt: oldNote?.createdAt ?? now, updatedAt: now,
        }).onConflictDoUpdate({ target: conductAttitude.id, set: {
          observation: annotation, status: annotation ? "Registrada" : "Anulada", updatedAt: now,
          aiEvaluationStatus: annotation ? annotationChanged ? "Pendiente de evaluar con IA" : oldNote?.aiEvaluationStatus || "Pendiente de evaluar con IA" : "",
          aiSuggestedScore: annotation && !annotationChanged ? oldNote?.aiSuggestedScore ?? null : null,
          aiJustification: annotation && !annotationChanged ? oldNote?.aiJustification ?? "" : "",
          aiPromptVersion: annotation && !annotationChanged ? oldNote?.aiPromptVersion ?? "" : "",
        } });
      }
    }

    const rubricRows = await tx.select().from(conductAttitude).where(and(
      eq(conductAttitude.partialId, session.partialId), eq(conductAttitude.group, session.group ?? ""), eq(conductAttitude.type, "Rubrica C.A."),
    ));
    for (const rubric of rubricRows) {
      if (rubricChanged.has(normalizeId(rubric.studentId)) && rubric.status !== "Desactualizada") {
        await tx.update(conductAttitude).set({ status: "Desactualizada", updatedAt: now }).where(eq(conductAttitude.id, rubric.id));
      }
    }

    for (const { task, entries } of normalizedTasks) {
      const states = new Map<string, string>();
      for (const old of scoreByTaskStudent.values()) if (old.taskId === task.id) states.set(normalizeId(old.studentId), String(old.status ?? ""));
      for (const entry of entries) {
        const studentId = entry.student.id;
        const key = `${task.id}:${normalizeId(studentId)}`;
        const old = scoreByTaskStudent.get(key);
        const delivered = entry.state === "Calificada";
        const scoreId = old?.id ?? `task-score-${id()}`;
        const values = {
          id: scoreId, taskId: task.id, partialId: session.partialId, studentId, group: session.group,
          submitted: delivered, submittedOn: delivered ? now.slice(0, 10) : null,
          score: entry.score === "" ? null : String(entry.score), status: entry.state,
          notes: entry.observation, updatedAt: now, gradingSessionId: session.id,
        };
        await tx.insert(taskGrades).values(values).onConflictDoUpdate({ target: taskGrades.id, set: {
          submitted: values.submitted, submittedOn: values.submittedOn, score: values.score,
          status: values.status, notes: values.notes, updatedAt: now, gradingSessionId: session.id,
        } });
        states.set(normalizeId(studentId), entry.state);
      }
      const complete = rosterRows.every((student) => ["Calificada", "No_entregada", "Justificada"].includes(states.get(normalizeId(student.id)) ?? ""));
      await tx.update(tasks).set({ bankStatus: complete ? "Calificada" : "En_calificacion", gradingSessionId: session.id, updatedAt: now }).where(eq(tasks.id, task.id));
    }

    await tx.update(classSessions).set({ status: "Realizada", captureStatus: "Abierta", updatedAt: now }).where(eq(classSessions.id, session.id));
    const fingerprint = createHash("sha256").update(JSON.stringify({
      sessionId: session.id,
      attendance: normalizedAttendance.map(({ student, status }) => [student.id, status]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      students: normalizedStudents.map(({ student, annotation, caScore }) => [student.id, annotation, caScore]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      tasks: normalizedTasks.map(({ task, entries }) => [task.id, entries.map(({ student, state, score, observation }) => [student.id, state, score, observation]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) ]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    })).digest("hex").slice(0, 24);
    await tx.insert(auditEvents).values({
      id: `session-workspace-${session.id}-${fingerprint}`, type: "session_workspace_saved", entity: "SESIONES_CLASE",
      entityId: session.id, partialId: session.partialId, studentId: "", actorId: "docente",
      details: { attendanceSaved: normalizedAttendance.length, studentsUpdated: normalizedStudents.length, tasksUpdated: touchedTaskIds },
      occurredAt: now,
    }).onConflictDoNothing();
    return { sessionId: session.id, saved: true };
  });
}
