import test from "node:test";
import assert from "node:assert/strict";
import { calculateStudentPartial, mexicoToday } from "../lib/academic-engine.ts";

const student = { id: "A1", grado: "1°", grupo: "A" };
const partial = { parcial_id: "p1", modo_evaluacion_continua: "Promedio" };
const base = {
  partials: [partial], students: [student],
  sessions: [
    { sesion_id: "s1", parcial_id: "p1", grupo: "1° A", estado: "Impartida" },
    { sesion_id: "s2", parcial_id: "p1", grupo: "1° A", estado: "Cancelada" },
  ],
  absences: [{ alumno_id: "A1", parcial_id: "p1", sesion_id: "s1", estado: "Inasistencia" }],
  tasks: [
    { tarea_id: "t1", parcial_id: "p1", grupo: "1° A", nombre: "Entregada", fecha_entrega: "2026-09-22", puntaje_maximo: 10, obligatoria: "TRUE", activa: "TRUE" },
    { tarea_id: "t2", parcial_id: "p1", grupo: "1° A", nombre: "Faltante", fecha_entrega: "2026-09-22", puntaje_maximo: 10, obligatoria: "TRUE", activa: "TRUE" },
  ],
  taskScores: [{ tarea_id: "t1", alumno_id: "A1", estado: "Calificada", entregada: "TRUE", puntaje: 8 }],
  conduct: [], grades: [{ parcial_id: "p1", alumno_id: "A1", calificacion_ca: 90 }],
  exams: [{ examen_id: "e1", parcial_id: "p1", estado: "Publicado", grado: "1°", grupo: "TODOS", puntaje_maximo: 100 }],
  attempts: [{ examen_id: "e1", alumno_id: "A1", estado: "Definitivo", ai_pendiente: "FALSE", puntaje_total: 100 }],
  assignments: [],
};
const now = new Date("2026-09-23T18:00:00Z");

test("promedio, faltante obligatorio en cero, faltas informativas y nota final 10/40/50", () => {
  const grade = calculateStudentPartial(base, student, partial, now);
  assert.equal(grade.days, 1);
  assert.equal(grade.absences, 1);
  assert.equal(grade.missingTasks, 1);
  assert.equal(grade.ec, 40);
  assert.equal(grade.ex, 100);
  assert.equal(grade.final100, 76);
  assert.equal(grade.final10, 7.6);
});

test("modo ponderado aplica el porcentaje guardado por actividad", () => {
  const weightedPartial = { ...partial, modo_evaluacion_continua: "Ponderado" };
  const tasks = base.tasks.map((task, index) => ({ ...task, peso_ec: index ? 20 : 80 }));
  const taskScores = [...base.taskScores, { tarea_id: "t2", alumno_id: "A1", estado: "No_entregada", entregada: "FALSE", puntaje: 0 }];
  const grade = calculateStudentPartial({ ...base, partials: [weightedPartial], tasks, taskScores }, student, weightedPartial, now);
  assert.equal(grade.ec, 64);
  assert.equal(grade.ecMode, "Ponderado");
  assert.deepEqual(grade.ecDetails.map((item) => item.weight), [80, 20]);
});

test("modo ponderado sin porcentajes válidos deja EC pendiente", () => {
  const weightedPartial = { ...partial, modo_evaluacion_continua: "Ponderado" };
  const taskScores = [...base.taskScores, { tarea_id: "t2", alumno_id: "A1", estado: "No_entregada", entregada: "FALSE", puntaje: 0 }];
  const grade = calculateStudentPartial({ ...base, partials: [weightedPartial], taskScores }, student, weightedPartial, now);
  assert.equal(grade.ec, null);
});

test("una entrega pendiente de calificación bloquea EC y la nota final", () => {
  const snapshot = { ...base, taskScores: [...base.taskScores, { tarea_id: "t2", alumno_id: "A1", estado: "Pendiente_calificacion", entregada: "TRUE" }] };
  const grade = calculateStudentPartial(snapshot, student, partial, now);
  assert.equal(grade.ec, null);
  assert.equal(grade.final100, null);
});

test("excluidas, justificadas, opcionales sin entrega y tareas futuras no penalizan", () => {
  const snapshot = {
    ...base,
    tasks: [...base.tasks, { tarea_id: "future", parcial_id: "p1", grupo: "1° A", nombre: "Futura", fecha_entrega: "2026-09-24", puntaje_maximo: 10, obligatoria: "TRUE", activa: "TRUE" }, { tarea_id: "optional", parcial_id: "p1", grupo: "1° A", nombre: "Opcional", fecha_entrega: "2026-09-22", puntaje_maximo: 10, obligatoria: "FALSE", activa: "TRUE" }],
    taskScores: [...base.taskScores, { tarea_id: "t2", alumno_id: "A1", estado: "Justificada", entregada: "FALSE" }],
  };
  const grade = calculateStudentPartial(snapshot, student, partial, now);
  assert.equal(grade.missingTasks, 0);
  assert.equal(grade.ec, 80);
});

test("un intento provisional con IA pendiente no cuenta como EX final", () => {
  const snapshot = { ...base, attempts: [{ examen_id: "e1", alumno_id: "A1", estado: "Provisional", ai_pendiente: "TRUE", puntaje_total: 80 }] };
  const grade = calculateStudentPartial(snapshot, student, partial, now);
  assert.equal(grade.ex, null);
  assert.equal(grade.final10, null);
});

test("la matriz muestra el EX persistido aunque la consulta de intentos no lo reconstruya", () => {
  const snapshot = { ...base, attempts: [], grades: [{ parcial_id: "p1", alumno_id: "A1", calificacion_ca: "", examen: 84 }] };
  const grade = calculateStudentPartial(snapshot, student, partial, now);
  assert.equal(grade.ex, 84);
  assert.equal(grade.final100, 68);
});

test("las sesiones planeadas no cuentan como días impartidos hasta guardar el pase de lista", () => {
  const snapshot = { ...base, sessions: [...base.sessions, { sesion_id: "s3", parcial_id: "p1", grupo: "1° A", estado: "Programada" }] };
  assert.equal(calculateStudentPartial(snapshot, student, partial, now).days, 1);
});

test("las tareas nuevas pendientes del banco no afectan EC aunque su fecha sea antigua", () => {
  const snapshot = { ...base, tasks: [
    { tarea_id: "bank", parcial_id: "p1", grupo: "1° A", nombre: "Banco", fecha_entrega: "", estado_banco: "Pendiente", puntaje_maximo: 10, obligatoria: "TRUE", activa: "TRUE" },
  ], taskScores: [] };
  const grade = calculateStudentPartial(snapshot, student, partial, now);
  assert.equal(grade.ec, null);
  assert.equal(grade.missingTasks, 0);
});

test("una tarea del banco en calificación deja EC pendiente sin asignar ceros por alumno", () => {
  const snapshot = { ...base, tasks: [
    { tarea_id: "bank", parcial_id: "p1", grupo: "1° A", nombre: "Banco", fecha_entrega: "", estado_banco: "En_calificacion", puntaje_maximo: 10, obligatoria: "TRUE", activa: "TRUE" },
  ], taskScores: [] };
  const grade = calculateStudentPartial(snapshot, student, partial, now);
  assert.equal(grade.ec, null);
  assert.equal(grade.missingTasks, 0);
  assert.equal(grade.ecDetails[0].state, "Pendiente de calificación");
});

test("una tarea cerrada usa cero solo para No_entregada y excluye Justificada", () => {
  const snapshot = { ...base,
    tasks: [
      { tarea_id: "missing", parcial_id: "p1", grupo: "1° A", nombre: "No entregada", estado_banco: "Calificada", puntaje_maximo: 10, obligatoria: "TRUE", activa: "TRUE" },
      { tarea_id: "excused", parcial_id: "p1", grupo: "1° A", nombre: "Justificada", estado_banco: "Calificada", puntaje_maximo: 10, obligatoria: "TRUE", activa: "TRUE" },
    ],
    taskScores: [
      { tarea_id: "missing", alumno_id: "A1", estado: "No_entregada", entregada: "FALSE", puntaje: 0 },
      { tarea_id: "excused", alumno_id: "A1", estado: "Justificada", entregada: "FALSE", puntaje: "" },
    ],
  };
  const grade = calculateStudentPartial(snapshot, student, partial, now);
  assert.equal(grade.missingTasks, 1);
  assert.equal(grade.ec, 0);
});

test("CA promedia conducta y actitud por sesión y usa 10 si no hay captura de sesión", () => {
  const snapshot = { ...base, conduct: [
    { parcial_id: "p1", sesion_id: "s1", alumno_id: "A1", tipo: "Conducta", puntuacion: 80 },
    { parcial_id: "p1", sesion_id: "s1", alumno_id: "A1", tipo: "Actitud", puntuacion: 100 },
    { parcial_id: "p1", sesion_id: "s1", alumno_id: "A1", tipo: "Anotación", puntuacion: 0 },
  ] };
  assert.equal(calculateStudentPartial(snapshot, student, partial, now).ca, 90);
  assert.equal(calculateStudentPartial({ ...snapshot, conduct: [] }, student, partial, now).ca, 100);
});

test("la fecha actual se determina en America/Mexico_City", () => {
  assert.equal(mexicoToday(new Date("2026-09-23T05:00:00Z")), "2026-09-22");
});
