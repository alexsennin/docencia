import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { getDatabase } from "../db/client.ts";
import {
  academicPeriods,
  aiReports,
  attendance,
  classSessions,
  conductAttitude,
  examAttempts,
  examAssignments,
  exams,
  grades,
  students,
  taskGrades,
  tasks,
} from "../db/schema.ts";

const toAcademicRow = (row: Record<string, unknown>, names: Record<string, string>) => Object.fromEntries(
  Object.entries(names).map(([key, column]) => [key, row[column] ?? ""]),
);

const partialFields = {
  parcial_id: "id", nombre: "name", orden: "order", ciclo_escolar: "schoolYear", materia: "subject", estado: "status",
  fecha_inicio: "startsOn", fecha_cierre: "closesOn", peso_asistencias: "attendanceWeight", peso_trabajos_clase: "classworkWeight",
  peso_tareas: "tasksWeight", peso_evaluacion_continua: "continuousAssessmentWeight", peso_conducta: "conductWeight",
  peso_actitud: "attitudeWeight", peso_examen: "examWeight", ponderacion_total: "totalWeight",
  modo_evaluacion_continua: "continuousAssessmentMode",
};
const sessionFields = { sesion_id: "id", parcial_id: "partialId", fecha_clase: "classDate", grupo: "group", materia: "subject", tema: "topic", estado: "status" };
const attendanceFields = { asistencia_id: "id", sesion_id: "sessionId", parcial_id: "partialId", alumno_id: "studentId", fecha_clase: "classDate", estado: "status" };
const taskFields = { tarea_id: "id", parcial_id: "partialId", grupo: "group", nombre: "name", fecha_entrega: "dueOn", puntaje_maximo: "maxScore", obligatoria: "mandatory", activa: "active", peso_ec: "continuousAssessmentWeight", estado_banco: "bankStatus" };
const taskGradeFields = { registro_id: "id", tarea_id: "taskId", parcial_id: "partialId", alumno_id: "studentId", entregada: "submitted", puntaje: "score", estado: "status" };
const conductFields = { registro_id: "id", parcial_id: "partialId", alumno_id: "studentId", grupo: "group", fecha: "date", tipo: "type", observacion: "observation", puntuacion: "score", estado: "status", sesion_id: "sessionId" };
const gradeFields = { calificacion_id: "id", parcial_id: "partialId", alumno_id: "studentId", grupo: "group", dias_clase: "classDays", faltas: "absences", tareas_faltantes: "missingTasks", evaluacion_continua: "continuousAssessment", conducta: "conduct", actitud: "attitude", examen: "exam", calificacion_parcial: "partialGrade", calificacion_10: "gradeOnTen", estado: "status", calificacion_ca: "conductAttitudeGrade", modo_evaluacion_continua: "continuousAssessmentMode", detalle_ec_json: "continuousAssessmentDetails" };
const examFields = { examen_id: "id", parcial_id: "partialId", grado: "grade", grupo: "group", estado: "status", puntaje_maximo: "maxScore" };
const attemptFields = { intento_id: "id", examen_id: "examId", parcial_id: "partialId", alumno_id: "studentId", estado: "status", puntaje_total: "totalScore", ai_pendiente: "aiPending" };
const assignmentFields = { asignacion_id: "id", alumno_id: "studentId", examen_id: "examId", estado: "status" };
const reportFields = { reporte_id: "id", parcial_id: "partialId", alumno_id: "studentId", visibilidad_alumno: "studentVisible", resumen: "summary", fortalezas: "strengths", areas_oportunidad: "opportunities", recomendaciones_json: "recommendations" };

export async function getStudentAcademicInPostgres(
  studentId: string,
  query: Pick<ReturnType<typeof getDatabase>, "select"> = getDatabase(),
) {
  const normalizedId = studentId.trim().toUpperCase();
  const [student] = await query.select().from(students)
    .where(sql`upper(trim(${students.id})) = ${normalizedId}`).limit(1);
  if (!student) throw new Error("No se encontró el ID escolar.");

  const group = `${student.grade ?? ""} ${student.group ?? ""}`.trim();
  const [partialRows, sessionRows, absenceRows, taskRows, taskGradeRows, conductRows, gradeRows, assignmentRows, attemptRows, reportRows] = await Promise.all([
    query.select().from(academicPeriods).orderBy(asc(academicPeriods.order), asc(academicPeriods.id)),
    query.select().from(classSessions).where(eq(classSessions.group, group)),
    query.select().from(attendance).where(sql`upper(trim(${attendance.studentId})) = ${normalizedId}`),
    query.select().from(tasks).where(eq(tasks.group, group)),
    query.select().from(taskGrades).where(sql`upper(trim(${taskGrades.studentId})) = ${normalizedId}`),
    query.select().from(conductAttitude).where(sql`upper(trim(${conductAttitude.studentId})) = ${normalizedId}`),
    query.select().from(grades).where(sql`upper(trim(${grades.studentId})) = ${normalizedId}`),
    query.select().from(examAssignments).where(sql`upper(trim(${examAssignments.studentId})) = ${normalizedId}`),
    query.select().from(examAttempts).where(sql`upper(trim(${examAttempts.studentId})) = ${normalizedId}`),
    query.select().from(aiReports).where(and(
      sql`upper(trim(${aiReports.studentId})) = ${normalizedId}`,
      eq(aiReports.studentVisible, true),
    )),
  ]);
  const assignedExamIds = assignmentRows.map((row) => row.examId);
  const examConditions = [and(eq(exams.grade, student.grade ?? ""), or(eq(exams.group, "TODOS"), eq(exams.group, student.group ?? "")))];
  if (assignedExamIds.length) examConditions.push(inArray(exams.id, assignedExamIds));
  const examRows = await query.select().from(exams).where(or(...examConditions));

  return {
    student: { id: student.id, name: student.name, grade: student.grade ?? "", group: student.group ?? "" },
    partials: partialRows.map((row) => toAcademicRow(row as unknown as Record<string, unknown>, partialFields)),
    sessions: sessionRows.map((row) => toAcademicRow(row as unknown as Record<string, unknown>, sessionFields)),
    absences: absenceRows.map((row) => toAcademicRow(row as unknown as Record<string, unknown>, attendanceFields)),
    tasks: taskRows.map((row) => toAcademicRow(row as unknown as Record<string, unknown>, taskFields)),
    taskScores: taskGradeRows.map((row) => toAcademicRow(row as unknown as Record<string, unknown>, taskGradeFields)),
    conduct: conductRows.map((row) => toAcademicRow(row as unknown as Record<string, unknown>, conductFields)),
    grades: gradeRows.map((row) => toAcademicRow(row as unknown as Record<string, unknown>, gradeFields)),
    exams: examRows.map((row) => toAcademicRow(row as unknown as Record<string, unknown>, examFields)),
    attempts: attemptRows.map((row) => toAcademicRow(row as unknown as Record<string, unknown>, attemptFields)),
    assignments: assignmentRows.map((row) => toAcademicRow(row as unknown as Record<string, unknown>, assignmentFields)),
    reports: reportRows.map((row) => toAcademicRow(row as unknown as Record<string, unknown>, reportFields)),
  };
}
