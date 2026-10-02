"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { calculateAcademicMatrix, mexicoToday } from "../lib/academic-engine";
import { listArchivedAcademicItems } from "../lib/academic-archive";
import { ProgressOverlay } from "./progress-overlay";

type Row = Record<string, string | number | boolean | null | undefined>;
type Snapshot = { partials: Row[]; students: Row[]; sessions: Row[]; absences: Row[]; tasks: Row[]; taskScores: Row[]; conduct: Row[]; grades: Row[]; exams: Row[]; attempts: Row[]; assignments: Row[]; reports: Row[] };
type Grade = { partialId: string; studentId: string; group: string; days: number; absences: number; missingTasks: number; ca: number | null; ec: number | null; ecMode: string; ex: number | null; final100: number | null; final10: number | null; status: string; ecDetails: Array<{ taskId: string; name: string; state: string; score: number | null; weight: number | null }> };
type Data = { snapshot: Snapshot; matrix: Grade[] };
type ResponseData = Data & { error?: string; result?: Row; warning?: string };
type AcademicMode = "dashboard" | "clases" | "archivados" | "calificaciones";
type CaptureView = "session" | "review";
type AttendanceStatus = "P" | "I" | "R";
type StudentDraft = { attendance: AttendanceStatus; annotation: string };
type TaskDraft = { score: string };
type TaskKind = "Tarea" | "Trabajo en clase";
const str = (row: Row, key: string) => String(row[key] ?? "");
const reportList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [value];
  } catch { return [value]; }
};
const numeric = (row: Row, key: string) => row[key] === "" || row[key] === null || row[key] === undefined ? "" : String(row[key]);
const taskMaximum = (task: Row) => {
  const maximum = Number(task.puntaje_maximo);
  return Number.isFinite(maximum) && maximum > 0 ? maximum : 10;
};
const taskScoreOnTen = (score: unknown, task: Row) => {
  const value = Number(score);
  return Number.isFinite(value) ? Number(Math.max(0, Math.min(10, value / taskMaximum(task) * 10)).toFixed(2)) : 0;
};
const taskScoreFromTen = (score: number, task: Row) => Number((score * taskMaximum(task) / 10).toFixed(2));
const formatTaskScore = (score: unknown, task: Row) => String(taskScoreOnTen(score, task));
function focusNextTaskGrade(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Tab" || event.shiftKey) return;

  const cell = event.currentTarget.closest("td");
  const table = cell?.closest("table");
  const currentRow = cell?.parentElement;
  const rows = table?.tBodies[0] ? Array.from(table.tBodies[0].rows) : [];
  const rowIndex = rows.indexOf(currentRow as HTMLTableRowElement);
  if (!cell || rowIndex < 0) return;

  const inputAt = (row: number, column: number) =>
    rows[row]?.cells[column]?.querySelector<HTMLInputElement>(".task-grade-cell input");
  const nextInput = inputAt(rowIndex + 1, cell.cellIndex) ?? inputAt(0, cell.cellIndex + 1);
  if (!nextInput) return;

  event.preventDefault();
  nextInput.focus();
  nextInput.select();
}
function sanitizeGradeInput(value: string) {
  const normalized = value.replace(",", ".").replace(/[^\d.]/g, "");
  const [whole = "", ...fraction] = normalized.split(".");
  return fraction.length ? `${whole || "0"}.${fraction.join("")}` : whole;
}
function clampGradeInput(value: string) {
  const parsed = Number(sanitizeGradeInput(value));
  if (!Number.isFinite(parsed)) return "0";
  return String(Number(Math.max(0, Math.min(10, parsed)).toFixed(1)));
}
const progressCopy: Record<string, { title: string; detail: string }> = {
  saveClassSession: { title: "Abriendo la sesión…", detail: "Preparamos la lista del grupo y recuperamos los registros de esta clase." },
  createTask: { title: "Guardando la actividad…", detail: "Registramos la tarea o el trabajo en la sesión seleccionada." },
  refreshTaskMatrix: { title: "Actualizando la matriz…", detail: "Cargamos el trabajo y preparamos sus campos de calificación por alumno." },
  attachTasksToSession: { title: "Agregando tareas a la sesión…", detail: "Vinculamos las tareas seleccionadas con esta clase para calificarlas." },
  saveSessionWorkspace: { title: "Guardando la sesión…", detail: "Guardamos asistencia, comentarios y calificaciones de actividades." },
  savePartialMode: { title: "Actualizando Evaluación Continua…", detail: "Guardamos el método de cálculo de este parcial y recalculamos la matriz." },
  saveTaskWeights: { title: "Guardando ponderaciones…", detail: "Guardamos los porcentajes de las actividades del grupo y recalculamos sus promedios." },
  cancelClassSession: { title: "Archivando la sesión…", detail: "Retiramos la sesión y sus actividades vinculadas de las vistas y cálculos activos." },
  deleteTask: { title: "Archivando actividad…", detail: "Retiramos el trabajo o la tarea de las vistas y cálculos activos." },
  generateAiReport: { title: "Generando propuesta de retroalimentación…", detail: "Reunimos la evidencia de este alumno y parcial, solicitamos una propuesta a la IA y la guardamos para revisión docente." },
  publishAiReport: { title: "Aprobando retroalimentación…", detail: "Guardamos tu revisión y hacemos visible esta propuesta en el portal del alumno." },
};
const currentTimestamp = () => Date.now();

function attendanceLetter(value: unknown): AttendanceStatus | "" {
  const state = String(value ?? "").trim().toLowerCase();
  if (["p", "asistio", "asistió", "asistencia", "presente"].includes(state)) return "P";
  if (["i", "no_asistio", "inasistencia", "falta", "faltó", "falto"].includes(state)) return "I";
  if (["r", "retardo", "retardó", "retardado"].includes(state)) return "R";
  return "";
}

function nextAttendanceLetter(status: AttendanceStatus): AttendanceStatus {
  return status === "P" ? "I" : status === "I" ? "R" : "P";
}

export function TeacherAcademicModule({ active, mode, partialId, onPartialChange, onPartialsChange }: { active: boolean; mode: AcademicMode; partialId: string; onPartialChange: (id: string) => void; onPartialsChange: (items: Array<{ id: string; name: string }>) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [group, setGroup] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [view, setView] = useState<CaptureView>("review");
  const [studentDraftEdits, setStudentDraftEdits] = useState<Record<string, Record<string, Partial<StudentDraft>>>>({});
  const [taskDraftEdits, setTaskDraftEdits] = useState<Record<string, Record<string, Partial<TaskDraft>>>>({});
  const [taskWeightEdits, setTaskWeightEdits] = useState<Record<string, string>>({});
  const [showTaskForm, setShowTaskForm] = useState<TaskKind | null>(null);
  const [showTaskBank, setShowTaskBank] = useState(false);
  const [showPendingExams, setShowPendingExams] = useState(false);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Row | null>(null);
  const [sessionDate, setSessionDate] = useState("");
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [annotationStudentId, setAnnotationStudentId] = useState("");
  const [detailStudentId, setDetailStudentId] = useState("");
  const [busy, setBusy] = useState<{ title: string; detail?: string } | null>({ title: "Consultando los parciales…", detail: "Cargamos grupos, sesiones y registros académicos de la fuente configurada." });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const remoteActionInFlight = useRef(false);
  const sessionTableScrollRef = useRef<HTMLDivElement>(null);
  const previousSessionTaskCount = useRef({ sessionId: "", count: 0 });
  const today = mexicoToday();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setBusy({ title: "Actualizando el panel…" });
      return fetch("/api/teacher/academic", { cache: "no-store" });
    }).then(async (response) => {
      const body = await response.json() as ResponseData;
      if (!response.ok) throw new Error(body.error || "No se pudo cargar la información académica.");
      if (cancelled) return;
      setData(body);
      const partialOptions = body.snapshot.partials.map((item) => ({ id: str(item, "parcial_id"), name: str(item, "nombre") }));
      onPartialsChange(partialOptions);
      const availablePartials = partialOptions.map((item) => item.id);
      const rememberedPartialId = window.localStorage.getItem("docencia.teacher.selectedPartialId") || "";
      onPartialChange(availablePartials.includes(rememberedPartialId) ? rememberedPartialId : availablePartials[0] ?? "");
      const availableGroups = Array.from(new Set(body.snapshot.students.map((student) => `${str(student, "grado")} ${str(student, "grupo")}`.trim()))).filter((item) => !/(PRUEBA|TEST)/i.test(item)).sort((a, b) => a.localeCompare(b, "es-MX", { numeric: true }));
      setGroup((current) => availableGroups.includes(current) ? current : availableGroups[0] || "");
    }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo cargar."); }).finally(() => { if (!cancelled) setBusy(null); });
    return () => { cancelled = true; };
  }, [active, onPartialChange, onPartialsChange]);

  const partial = data?.snapshot.partials.find((item) => str(item, "parcial_id") === partialId);
  const ecMode = str(partial ?? {}, "modo_evaluacion_continua") === "Ponderado" ? "Ponderado" : "Promedio";
  const groups = useMemo(() => Array.from(new Set(data?.snapshot.students.map((student) => `${str(student, "grado")} ${str(student, "grupo")}`.trim()) ?? [])).filter((item) => !/(PRUEBA|TEST)/i.test(item)).sort((a, b) => a.localeCompare(b, "es-MX", { numeric: true })), [data]);
  const students = useMemo(() => (data?.snapshot.students.filter((student) => `${str(student, "grado")} ${str(student, "grupo")}`.trim() === group) ?? []).sort((a, b) => str(a, "nombre").localeCompare(str(b, "nombre"), "es-MX")), [data, group]);
  const sessions = useMemo(() => data?.snapshot.sessions.filter((item) => str(item, "parcial_id") === partialId && str(item, "grupo") === group && str(item, "estado") !== "Cancelada").sort((a, b) => str(b, "fecha_clase").localeCompare(str(a, "fecha_clase"))) ?? [], [data, partialId, group]);
  const archivedItems = useMemo(() => data ? listArchivedAcademicItems(data.snapshot) : [], [data]);
  const currentSession = sessions.find((item) => str(item, "sesion_id") === sessionId);
  const displayView = view === "session" && !currentSession ? "review" : view;
  const sessionTasks = useMemo(() => data?.snapshot.tasks.filter((item) => str(item, "parcial_id") === partialId && str(item, "grupo") === group && String(item.activa).toUpperCase() !== "FALSE" && (
    str(item, "sesion_calificacion_id") === sessionId || (str(item, "tipo") === "Trabajo en clase" && str(item, "sesion_id") === sessionId)
  )) ?? [], [data, partialId, group, sessionId]);
  useEffect(() => {
    const previous = previousSessionTaskCount.current;
    if (previous.sessionId === sessionId && sessionTasks.length > previous.count) {
      const table = sessionTableScrollRef.current;
      table?.scrollTo({ left: table.scrollWidth, behavior: "smooth" });
    }
    previousSessionTaskCount.current = { sessionId, count: sessionTasks.length };
  }, [sessionId, sessionTasks.length]);
  const pendingTasks = useMemo(() => data?.snapshot.tasks.filter((item) => str(item, "parcial_id") === partialId && str(item, "grupo") === group && str(item, "tipo") === "Tarea" && str(item, "estado_banco") === "Pendiente" && String(item.activa).toUpperCase() !== "FALSE") ?? [], [data, partialId, group]);
  const weightableTasks = useMemo(() => data?.snapshot.tasks.filter((item) => str(item, "parcial_id") === partialId && str(item, "grupo") === group && str(item, "estado_banco") !== "Pendiente" && String(item.activa).toUpperCase() !== "FALSE") ?? [], [data, partialId, group]);
  const weightKey = `${partialId}:${group}`;
  const taskWeight = (task: Row) => taskWeightEdits[`${weightKey}:${str(task, "tarea_id")}`] ?? numeric(task, "peso_ec");
  const weightTotal = weightableTasks.reduce((sum, task) => sum + (taskWeight(task).trim() === "" ? 0 : Number(taskWeight(task))), 0);
  const matrix = useMemo(() => {
    if (!data) return [];
    return calculateAcademicMatrix(data.snapshot);
  }, [data]);
  const grades = useMemo(() => matrix.filter((item) => item.partialId === partialId && item.group === group), [matrix, partialId, group]);
  const partialGrades = useMemo(() => matrix.filter((item) => item.partialId === partialId), [matrix, partialId]);
  const groupAverages = useMemo(() => groups.map((item) => {
    const entries = partialGrades.filter((grade) => grade.group === item);
    const ready = entries.filter((grade) => grade.final10 !== null);
    return { group: item, average: ready.length ? ready.reduce((sum, grade) => sum + (grade.final10 ?? 0), 0) / ready.length : null, evaluated: ready.length, total: entries.length };
  }), [groups, partialGrades]);
  const lowestStudents = useMemo(() => partialGrades.filter((grade) => grade.final10 !== null).map((grade) => ({
    grade,
    name: str(data?.snapshot.students.find((student) => str(student, "id") === grade.studentId) ?? {}, "nombre") || grade.studentId,
  })).sort((a, b) => (a.grade.final10 ?? 0) - (b.grade.final10 ?? 0)).slice(0, 10), [data, partialGrades]);
  const pendingExamReviews = useMemo(() => (data?.snapshot.attempts ?? []).filter((attempt) => str(attempt, "parcial_id") === partialId && str(attempt, "estado") === "Provisional" && String(attempt.ai_pendiente).toLowerCase() === "true").map((attempt) => ({
    attemptId: str(attempt, "intento_id"),
    studentId: str(attempt, "alumno_id"),
    studentName: str(data?.snapshot.students.find((student) => str(student, "id") === str(attempt, "alumno_id")) ?? {}, "nombre"),
    examName: str(data?.snapshot.exams.find((exam) => str(exam, "examen_id") === str(attempt, "examen_id")) ?? {}, "nombre"),
    status: str(attempt, "estado"),
  })), [data, partialId]);
  const annotations = useMemo(() => data?.snapshot.conduct.filter((item) => str(item, "sesion_id") === sessionId && ["Anotacion", "Anotación"].includes(str(item, "tipo"))) ?? [], [data, sessionId]);
  const baseStudentDrafts = useMemo(() => {
    const attendanceByStudent = new Map((data?.snapshot.absences ?? []).filter((item) => str(item, "sesion_id") === sessionId).map((item) => [str(item, "alumno_id"), item]));
    const result: Record<string, StudentDraft> = {};
    for (const student of students) {
      const id = str(student, "id");
      const attendance = attendanceByStudent.get(id);
      const status = attendanceLetter(attendance?.estado);
      const annotation = annotations.find((item) => str(item, "alumno_id") === id);
      result[id] = {
        attendance: status || "P",
        annotation: str(annotation ?? {}, "observacion"),
      };
    }
    return result;
  }, [data, sessionId, students, annotations]);
  const studentDrafts = useMemo(() => Object.fromEntries(Object.entries(baseStudentDrafts).map(([id, base]) => [id, { ...base, ...(studentDraftEdits[sessionId]?.[id] ?? {}) }])), [baseStudentDrafts, sessionId, studentDraftEdits]);
  const baseTaskDrafts = useMemo(() => {
    const result: Record<string, TaskDraft> = {};
    for (const task of sessionTasks) {
      for (const student of students) {
        const id = str(student, "id");
        const saved = data?.snapshot.taskScores.find((item) => str(item, "tarea_id") === str(task, "tarea_id") && str(item, "alumno_id") === id);
        const savedScore = numeric(saved ?? {}, "puntaje");
        result[`${str(task, "tarea_id")}:${id}`] = {
          score: savedScore === "" ? "0" : formatTaskScore(savedScore, task),
        };
      }
    }
    return result;
  }, [data, sessionTasks, students]);
  const taskDrafts = useMemo(() => Object.fromEntries(Object.entries(baseTaskDrafts).map(([id, base]) => [id, { ...base, ...(taskDraftEdits[sessionId]?.[id] ?? {}) }])), [baseTaskDrafts, sessionId, taskDraftEdits]);

  async function save(action: string, payload: Record<string, unknown>, success: string) {
    if (remoteActionInFlight.current) return null;
    remoteActionInFlight.current = true;
    setBusy(progressCopy[action] ?? { title: "Actualizando…", detail: "Guardamos los cambios y actualizamos la información académica." });
    setError(""); setMessage("");
    try {
      const response = await fetch("/api/teacher/academic", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, payload }) });
      const body = await response.json() as ResponseData;
      if (!response.ok) throw new Error(body.error || "No se pudo guardar.");
      setData({ snapshot: body.snapshot, matrix: body.matrix });
      setMessage(body.warning || success);
      return body;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar."); return null; }
    finally { remoteActionInFlight.current = false; setBusy(null); }
  }

  async function copyGroupGrades() {
    if (!students.length || busy) return;
    const rows = students.map((student) => {
      const grade = grades.find((item) => item.studentId === str(student, "id"));
      const score = (value: number | null) => value === null ? "" : (value / 10).toFixed(1);
      return [
        grade?.days ?? 0,
        grade?.absences ?? 0,
        grade?.missingTasks ?? 0,
        score(grade?.ca ?? null),
        score(grade?.ec ?? null),
        score(grade?.ex ?? null),
      ].join("\t");
    });
    try {
      await navigator.clipboard.writeText(rows.join("\n"));
      setError("");
      setMessage("Calificaciones copiadas sin títulos, nombres ni identificadores.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron copiar las calificaciones.");
    }
  }

  async function changeEcMode(nextMode: "Promedio" | "Ponderado") {
    if (!partialId || nextMode === ecMode) return;
    await save("savePartialMode", { partialId, mode: nextMode }, `Evaluación Continua configurada como ${nextMode}.`);
  }

  async function saveWeights() {
    if (!partialId || !group || !weightableTasks.length) return;
    const entries = weightableTasks.map((task) => ({ taskId: str(task, "tarea_id"), weight: taskWeight(task).trim() === "" ? Number.NaN : Number(taskWeight(task)) }));
    if (entries.some((item) => !Number.isFinite(item.weight) || item.weight < 0 || item.weight > 100)) {
      setError("Captura un porcentaje entre 0 y 100 para cada actividad.");
      return;
    }
    if (Math.abs(entries.reduce((sum, item) => sum + item.weight, 0) - 100) > 0.01) {
      setError("Los porcentajes de las actividades del grupo deben sumar 100%.");
      return;
    }
    const result = await save("saveTaskWeights", { partialId, group, entries }, "Ponderaciones guardadas; se actualizó la Evaluación Continua.");
    if (result) setTaskWeightEdits((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${weightKey}:`))));
  }

  function updateStudent(studentId: string, changes: Partial<StudentDraft>) {
    setStudentDraftEdits((current) => ({ ...current, [sessionId]: { ...current[sessionId], [studentId]: { ...studentDrafts[studentId], ...current[sessionId]?.[studentId], ...changes } } }));
  }
  function updateTaskDraft(taskId: string, studentId: string, changes: Partial<TaskDraft>) {
    const key = `${taskId}:${studentId}`;
    setTaskDraftEdits((current) => ({ ...current, [sessionId]: { ...current[sessionId], [key]: { ...taskDrafts[key], ...current[sessionId]?.[key], ...changes } } }));
  }

  async function openToday() {
    if (!partialId || !group) return;
    const existing = data?.snapshot.sessions.find((item) => str(item, "parcial_id") === partialId && str(item, "grupo") === group && str(item, "fecha_clase") === today && str(item, "estado") !== "Cancelada");
    if (existing) { setSessionId(str(existing, "sesion_id")); setMessage(""); return; }
    const result = await save("saveClassSession", { partialId, group, date: today, topic: "", planned: false }, "Sesión de hoy abierta.");
    if (result) setSessionId(str((result.result as Row) ?? {}, "sesion_id"));
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!partialId || !group || !sessionDate) return;
    const existing = data?.snapshot.sessions.find((item) => str(item, "parcial_id") === partialId && str(item, "grupo") === group && str(item, "fecha_clase") === sessionDate && str(item, "estado") !== "Cancelada");
    if (existing) {
      setSessionId(str(existing, "sesion_id")); setView("session"); setShowSessionForm(false); setMessage("Ya había una sesión en esa fecha; abrimos su detalle."); return;
    }
    const result = await save("saveClassSession", { partialId, group, date: sessionDate, topic: "", planned: false }, "Sesión creada. Captura asistencia y actividades.");
    if (result) { setSessionId(str((result.result as Row) ?? {}, "sesion_id")); setView("session"); setShowSessionForm(false); }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentSession || !showTaskForm || remoteActionInFlight.current) return;
    const form = new FormData(event.currentTarget);
    const type = showTaskForm;
    const activityName = String(form.get("name") ?? "").trim();
    const startedAt = currentTimestamp();
    const payload = {
      sessionId, name: activityName, type, dueDate: type === "Trabajo en clase" ? str(currentSession, "fecha_clase") : "",
      maxScore: 10, required: true, description: form.get("description"),
    };
    remoteActionInFlight.current = true;
    setShowTaskForm(null);
    setBusy(progressCopy.createTask);
    setError("");
    setMessage("");
    let createdTask: Row | null = null;
    try {
      const createResponse = await fetch("/api/teacher/academic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createTask", payload }),
      });
      const createdBody = await createResponse.json() as ResponseData;
      const createError = createResponse.ok ? null : new Error(createdBody.error || "No se pudo guardar la actividad.");
      if (createResponse.ok) createdTask = (createdBody.result ?? {}) as Row;
      setBusy(progressCopy.refreshTaskMatrix);

      const refreshResponse = await fetch("/api/teacher/academic", { cache: "no-store" });
      const refreshed = await refreshResponse.json() as ResponseData;
      if (!refreshResponse.ok) throw new Error(refreshed.error || (createError ? createError.message : "La actividad se guardó, pero no se pudo actualizar la matriz."));

      const createdTaskId = str(createdTask ?? {}, "tarea_id");
      const persistedTask = createdTaskId
        ? refreshed.snapshot.tasks.find((task) => str(task, "tarea_id") === createdTaskId)
        : null;
      const recoveredTask = persistedTask ?? refreshed.snapshot.tasks
        .filter((task) => str(task, "sesion_id") === sessionId
          && str(task, "parcial_id") === partialId
          && str(task, "grupo") === group
          && str(task, "tipo") === type
          && str(task, "nombre").trim().toLocaleLowerCase() === activityName.toLocaleLowerCase()
          && Date.parse(str(task, "created_at")) >= startedAt - 60_000)
        .sort((a, b) => Date.parse(str(a, "created_at")) - Date.parse(str(b, "created_at")))
        .slice(-1)[0];
      const resolvedTask = recoveredTask ?? (createdTaskId ? createdTask : null);
      const taskId = str(resolvedTask ?? {}, "tarea_id");
      let refreshedTasks = refreshed.snapshot.tasks;
      if (resolvedTask && taskId) {
        const index = refreshedTasks.findIndex((task) => str(task, "tarea_id") === taskId);
        const matrixTask: Row = {
          ...(index >= 0 ? refreshedTasks[index] : {}),
          ...resolvedTask,
          tarea_id: taskId,
          parcial_id: str(resolvedTask, "parcial_id") || str(currentSession, "parcial_id") || partialId,
          grupo: str(resolvedTask, "grupo") || str(currentSession, "grupo") || group,
          nombre: str(resolvedTask, "nombre") || activityName,
          tipo: str(resolvedTask, "tipo") || type,
          activa: str(resolvedTask, "activa") || "TRUE",
          sesion_id: str(resolvedTask, "sesion_id") || sessionId,
          sesion_calificacion_id: str(resolvedTask, "sesion_calificacion_id") || (type === "Trabajo en clase" ? sessionId : ""),
          estado_banco: str(resolvedTask, "estado_banco") || (type === "Tarea" ? "Pendiente" : "En_calificacion"),
          puntaje_maximo: str(resolvedTask, "puntaje_maximo") || "10",
        };
        refreshedTasks = index >= 0
          ? refreshedTasks.map((task, taskIndex) => taskIndex === index ? matrixTask : task)
          : [...refreshedTasks, matrixTask];
      }
      setData({ ...refreshed, snapshot: { ...refreshed.snapshot, tasks: refreshedTasks } });
      if (createError && !recoveredTask) throw createError;
      setError("");
      setMessage(type === "Tarea" ? "Tarea guardada en el banco del grupo." : "Trabajo agregado y matriz actualizada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la actividad.");
      const taskId = str(createdTask ?? {}, "tarea_id");
      if (createdTask && taskId) {
        setData((current) => {
          if (!current || current.snapshot.tasks.some((task) => str(task, "tarea_id") === taskId)) return current;
          return { ...current, snapshot: { ...current.snapshot, tasks: [...current.snapshot.tasks, createdTask as Row] } };
        });
      }
    } finally {
      remoteActionInFlight.current = false;
      setBusy(null);
    }
  }

  async function attachPendingTasks() {
    if (!selectedPendingIds.length || !sessionId) return;
    const result = await save("attachTasksToSession", { sessionId, taskIds: selectedPendingIds }, "Tareas agregadas a esta sesión.");
    if (result) { setShowTaskBank(false); setSelectedPendingIds([]); }
  }

  function sessionPayload() {
    return {
      sessionId,
      attendance: students.map((student) => ({ studentId: str(student, "id"), status: studentDrafts[str(student, "id")]?.attendance ?? "P" })),
      students: students.map((student) => {
        const draft = studentDrafts[str(student, "id")] ?? { attendance: "P", annotation: "" };
        return { studentId: str(student, "id"), annotation: draft.annotation };
      }),
      taskScores: sessionTasks.map((task) => ({
        taskId: str(task, "tarea_id"),
        entries: students.map((student) => {
          const draft = taskDrafts[`${str(task, "tarea_id")}:${str(student, "id")}`] ?? { score: "0" };
          const score = Number(clampGradeInput(draft.score));
          return { studentId: str(student, "id"), score: String(taskScoreFromTen(score, task)), state: score === 0 ? "No_entregada" : "Calificada" };
        }),
      })),
    };
  }

  async function saveSession() {
    if (!sessionId) return;
    const result = await save("saveSessionWorkspace", sessionPayload(), "Sesión guardada.");
    if (result) {
      setStudentDraftEdits((current) => ({ ...current, [sessionId]: {} }));
      setTaskDraftEdits((current) => ({ ...current, [sessionId]: {} }));
    }
  }

  async function deleteSession() {
    if (!sessionId || remoteActionInFlight.current) return;
    const deletedSessionId = sessionId;
    const result = await save("cancelClassSession", { sessionId: deletedSessionId }, "Sesión archivada.");
    if (!result) return;
    setStudentDraftEdits((current) => {
      const next = { ...current };
      delete next[deletedSessionId];
      return next;
    });
    setTaskDraftEdits((current) => {
      const next = { ...current };
      delete next[deletedSessionId];
      return next;
    });
    setShowDeleteConfirmation(false);
    setSessionId("");
    setView("review");
  }

  async function deleteTaskActivity() {
    const taskId = str(taskToDelete ?? {}, "tarea_id");
    if (!taskId || remoteActionInFlight.current) return;
    const result = await save("deleteTask", { taskId }, "Actividad archivada; la matriz y el promedio se actualizaron.");
    if (!result) return;
    setTaskDraftEdits((current) => {
      const next = { ...current };
      if (next[sessionId]) {
        next[sessionId] = Object.fromEntries(Object.entries(next[sessionId]).filter(([key]) => !key.startsWith(`${taskId}:`)));
      }
      return next;
    });
    setSelectedPendingIds((current) => current.filter((id) => id !== taskId));
    setTaskToDelete(null);
  }

  const annotationStudent = students.find((student) => str(student, "id") === annotationStudentId);
  const detailStudent = students.find((student) => str(student, "id") === detailStudentId);
  const detailReports = (data?.snapshot.reports ?? []).filter((report) =>
    str(report, "parcial_id") === partialId
      && str(report, "alumno_id").trim().toUpperCase() === detailStudentId.trim().toUpperCase()
      && str(report, "tipo") === "Retroalimentación académica",
  ).sort((a, b) => str(b, "created_at").localeCompare(str(a, "created_at")));

  return <><section className={`academic-module${mode === "dashboard" ? " academic-dashboard" : ""}`} aria-labelledby="academic-title">
    {mode !== "dashboard" && <div className="section-heading"><div><p className="eyebrow">{mode === "clases" ? `CLASES · ${str(partial ?? {}, "nombre")}` : mode === "calificaciones" ? `CALIFICACIONES · ${str(partial ?? {}, "nombre")}` : "ARCHIVO DOCENTE"}</p><h2 id="academic-title">{mode === "clases" ? "Sesiones del grupo" : mode === "archivados" ? "Sesiones y actividades archivadas" : "Calificaciones del grupo"}</h2></div></div>}
    {error && <p className="notice" role="alert">{error}</p>}{message && <p className="academic-success" role="status">{message}</p>}
    {mode === "archivados" && <section className="academic-card archived-records-card" aria-labelledby="archived-records-title">
      <div className="academic-matrix-header"><div><p className="eyebrow">CONSULTA GENERAL</p><h3 id="archived-records-title">Registros archivados</h3><p>Las sesiones, tareas y trabajos archivados se conservan aquí y ya no participan en los cálculos activos.</p></div><span className="result-count">{archivedItems.length} {archivedItems.length === 1 ? "registro" : "registros"}</span></div>
      {archivedItems.length ? <div className="matrix-scroll"><table className="academic-matrix archived-records-table"><thead><tr><th>Tipo</th><th>Nombre</th><th>Grupo</th><th>Parcial</th><th>Fecha de actividad</th><th>Archivado</th></tr></thead><tbody>{archivedItems.map((item) => <tr key={item.id}><td>{item.type}</td><th>{item.name}</th><td>{item.group || "—"}</td><td>{item.partialName || "—"}</td><td>{item.activityDate || "—"}</td><td>{item.archivedAt ? new Date(item.archivedAt).toLocaleDateString("es-MX") : "—"}</td></tr>)}</tbody></table></div> : <p className="empty-state">Todavía no hay sesiones, tareas ni trabajos archivados.</p>}
    </section>}
    {(mode === "clases" || mode === "calificaciones") && <>
    <div className="academic-toolbar session-context">
      <label className="select-field"><span>Grupo</span><select value={group} onChange={(event) => { setGroup(event.target.value); setSessionId(""); setView("review"); }} disabled={!groups.length}>{groups.map((item) => <option key={item}>{item}</option>)}</select></label>
      {mode === "calificaciones" && <label className="select-field"><span>Evaluación Continua</span><select aria-label="Método de Evaluación Continua" value={ecMode} onChange={(event) => void changeEcMode(event.target.value as "Promedio" | "Ponderado")} disabled={!!busy || !partialId}><option value="Promedio">Promedio simple</option><option value="Ponderado">Ponderado por actividad</option></select></label>}
    </div>
    {mode === "calificaciones" && ecMode === "Ponderado" && <section className="academic-card ec-weight-card" aria-labelledby="ec-weight-title">
      <div className="academic-matrix-header"><div><p className="eyebrow">EVALUACIÓN CONTINUA · {group}</p><h3 id="ec-weight-title">Porcentaje por actividad</h3><p>Asigna cuánto aporta cada tarea o trabajo a la EC de este grupo. El total debe sumar 100%.</p></div><span className="result-count">Total {weightTotal.toFixed(1)}%</span></div>
      {!weightableTasks.length ? <p className="session-hint">Todavía no hay actividades asignadas a este grupo para ponderar.</p> : <>
        <div className="matrix-scroll"><table className="academic-matrix"><thead><tr><th>Actividad</th><th>Tipo</th><th>Porcentaje</th></tr></thead><tbody>{weightableTasks.map((task) => <tr key={str(task, "tarea_id")}><th>{str(task, "nombre")}</th><td>{str(task, "tipo")}</td><td><label className="ec-weight-input"><input aria-label={`Porcentaje de ${str(task, "nombre")}`} type="number" min="0" max="100" step="0.1" value={taskWeight(task)} onChange={(event) => setTaskWeightEdits((current) => ({ ...current, [`${weightKey}:${str(task, "tarea_id")}`]: event.target.value }))} disabled={!!busy} /><span>%</span></label></td></tr>)}</tbody></table></div>
        <div className="session-actions"><button className="primary-button compact" type="button" onClick={() => void saveWeights()} disabled={!!busy || Math.abs(weightTotal - 100) > 0.01}>Guardar ponderaciones</button></div>
      </>}
    </section>}
    </>}

    {mode === "dashboard" && <div className="teacher-dashboard-content">
      <button className="pending-review-card" type="button" onClick={() => setShowPendingExams(true)}>
        <span className="pending-review-icon" aria-hidden="true">◷</span><span><strong>Tareas pendientes de revisar</strong><small>Exámenes con respuestas abiertas pendientes de revisión</small></span><b>{pendingExamReviews.length}</b>
      </button>
      <section className="dashboard-group-section" aria-labelledby="dashboard-groups-title">
        <div className="academic-matrix-header"><div><p className="eyebrow">RESUMEN DEL PARCIAL</p><h2 id="dashboard-groups-title">Promedio por grupo</h2></div><span className="result-count">{str(partial ?? {}, "nombre")}</span></div>
        <div className="dashboard-group-grid">{groupAverages.map((item) => <article className="dashboard-group-card" key={item.group}><span>{item.group}</span><strong>{item.average === null ? "—" : item.average.toFixed(1)}</strong><small>{item.evaluated} de {item.total} alumnos con calificación final</small></article>)}</div>
      </section>
      <section className="dashboard-ranking" aria-labelledby="dashboard-ranking-title"><div className="academic-matrix-header"><div><p className="eyebrow">ATENCIÓN DOCENTE</p><h2 id="dashboard-ranking-title">10 promedios más bajos</h2></div><span className="result-count">Escala de 10</span></div>
        {lowestStudents.length ? <ol>{lowestStudents.map(({ grade, name }) => <li key={`${grade.studentId}:${grade.group}`}><span><strong>{name}</strong><small>{grade.group}</small></span><b>{grade.final10?.toFixed(1)}</b></li>)}</ol> : <p className="dashboard-empty">Todavía no hay calificaciones finales para este parcial.</p>}
      </section>
      {showPendingExams && <div className="academic-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPendingExams(false); }}><section className="academic-dialog pending-exam-dialog" role="dialog" aria-modal="true" aria-labelledby="pending-exams-title"><button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => setShowPendingExams(false)}>×</button><p className="eyebrow">SOLO INFORMATIVO · {str(partial ?? {}, "nombre")}</p><h3 id="pending-exams-title">Exámenes pendientes de revisión</h3>{pendingExamReviews.length ? <ul>{pendingExamReviews.map((item) => <li key={item.attemptId}><strong>{item.studentName || item.studentId}</strong><span>{item.examName} · {item.status}</span></li>)}</ul> : <p>No hay exámenes pendientes de revisar en este parcial.</p>}<button className="secondary-button" type="button" onClick={() => setShowPendingExams(false)}>Cerrar</button></section></div>}
    </div>}

    {mode === "clases" && displayView === "session" && <section className="academic-card session-view">
      {!sessionId || !currentSession ? <div className="session-empty"><p className="eyebrow">{today}</p><h3>Sesión del día</h3><p>Abre la sesión de hoy para registrar asistencia, comentarios y actividades del grupo.</p><button className="primary-button" type="button" onClick={() => void openToday()} disabled={!!busy || !partialId || !group}>Abrir sesión de hoy · {group}</button></div> : <>
        <header className="academic-matrix-header session-heading"><div><p className="eyebrow">SESIÓN · {str(currentSession, "fecha_clase")}</p><h3>{group}</h3>{str(currentSession, "tema") && <p>{str(currentSession, "tema")}</p>}</div><div className="session-heading-actions"><button type="button" className="secondary-button compact" onClick={() => { setSessionId(""); setView("review"); }}>Ver sesiones</button><button type="button" className="primary-button compact" onClick={() => void saveSession()} disabled={!!busy}>Guardar</button><button type="button" className="danger-button compact" onClick={() => setShowDeleteConfirmation(true)} disabled={!!busy}>Archivar</button></div></header>
        <div className="session-actions"><button type="button" className="secondary-button compact" onClick={() => setShowTaskForm("Tarea")} disabled={!!busy}>Agregar tarea</button>{pendingTasks.length > 0 && <button type="button" className="secondary-button compact" onClick={() => { setSelectedPendingIds([]); setShowTaskBank(true); }} disabled={!!busy}>Calificar tareas <span className="task-count">{pendingTasks.length}</span></button>}<button type="button" className="secondary-button compact" onClick={() => setShowTaskForm("Trabajo en clase")} disabled={!!busy}>Agregar trabajo en clase</button></div>
        {pendingTasks.length > 0 && <p className="session-hint">{pendingTasks.length} tarea(s) pendientes en el banco; elige cuándo calificarlas.</p>}
        <div className="session-table-scroll" ref={sessionTableScrollRef}><table className="session-table"><thead><tr><th className="student-column">Alumno</th><th>Asistencia</th><th>Comentario</th>{sessionTasks.map((task) => <th key={str(task, "tarea_id")} className="activity-column"><div className="session-task-heading"><span>{str(task, "nombre")}</span><small>{str(task, "tipo") === "Tarea" ? "Tarea" : "Trabajo en clase"}</small><button type="button" className="task-delete-inline" aria-label={`Archivar ${str(task, "tipo") === "Tarea" ? "tarea" : "trabajo en clase"} ${str(task, "nombre")}`} onClick={() => setTaskToDelete(task)} disabled={!!busy}>Archivar</button></div></th>)}</tr></thead><tbody>
          {students.map((student) => {
            const id = str(student, "id");
            const draft = studentDrafts[id] ?? { attendance: "P", annotation: "" };
            return <tr key={id}><th className="student-column">{str(student, "nombre")}<small>{id}</small></th>
              <td><button type="button" className="attendance-toggle" data-status={draft.attendance} aria-label={`Asistencia ${draft.attendance} de ${str(student, "nombre")}`} title={`${draft.attendance}: ${draft.attendance === "P" ? "Asistencia" : draft.attendance === "I" ? "Inasistencia" : "Retardo"}`} onClick={() => updateStudent(id, { attendance: nextAttendanceLetter(draft.attendance) })}>{draft.attendance}</button></td>
              <td><button type="button" className="annotation-button" onClick={() => setAnnotationStudentId(id)}>{draft.annotation ? "Ver / editar" : "Agregar"}</button></td>
              {sessionTasks.map((task) => {
                const key = `${str(task, "tarea_id")}:${id}`;
                const taskDraft = taskDrafts[key] ?? { score: "0" };
                return <td key={str(task, "tarea_id")}><div className="task-grade-cell"><input aria-label={`Calificación de ${str(task, "nombre")} para ${str(student, "nombre")}, sobre 10`} type="text" inputMode="decimal" placeholder="0" value={taskDraft.score} onKeyDown={focusNextTaskGrade} onChange={(event) => updateTaskDraft(str(task, "tarea_id"), id, { score: sanitizeGradeInput(event.target.value) })} onBlur={() => updateTaskDraft(str(task, "tarea_id"), id, { score: clampGradeInput(taskDraft.score) })} /></div></td>;
              })}
            </tr>;
          })}
        </tbody></table></div>
      </>}
    </section>}

    {mode === "clases" && displayView === "review" && <section className="session-review">
      <div className="academic-matrix-header"><div><h3>Sesiones · {group}</h3><p>Abre el detalle para consultar o continuar la captura de una clase.</p></div><button className="primary-button" type="button" onClick={() => { setSessionDate(today); setShowSessionForm(true); }}>Agregar sesión</button></div>
      {sessions.filter((session) => str(session, "fecha_clase") <= today).length === 0 ? <div className="academic-card"><p>Aún no hay sesiones registradas para este grupo y parcial.</p></div> : <div className="session-card-grid">{sessions.filter((session) => str(session, "fecha_clase") <= today).map((session) => {
        const id = str(session, "sesion_id");
        const sessionWork = data?.snapshot.tasks.filter((item) => String(item.activa).toUpperCase() !== "FALSE" && (str(item, "sesion_id") === id || str(item, "sesion_calificacion_id") === id)) ?? [];
        return <article className="session-review-card" key={id}>
          <strong>{str(session, "fecha_clase")}</strong><span>{sessionWork.length} trabajo(s) o tarea(s)</span><button type="button" className="secondary-button compact" onClick={() => { setSessionId(id); setView("session"); }}>Detalle</button>
        </article>;
      })}</div>}
    </section>}

    {mode === "calificaciones" && <section className="academic-card matrix-card grades-overview">
      <div className="academic-matrix-header"><div><p className="eyebrow">{group} · {str(partial ?? {}, "nombre")}</p><h3>Resumen del grupo</h3><p>Ordenado por apellidos. Selecciona un nombre para ver el detalle. CA, EC y EXAM se muestran sobre 10.</p></div><div className="session-heading-actions"><button type="button" className="secondary-button compact" onClick={() => void copyGroupGrades()} disabled={!!busy || !students.length}>Copiar calificaciones</button></div></div>
      <div className="matrix-scroll"><table className="academic-matrix"><thead><tr><th>ID alumno</th><th>Nombre</th><th title="Días de clases impartidas">DIAS</th><th title="Inasistencias del alumno">FAL</th><th title="Tareas y trabajos con calificación cero">TRF</th><th title="Promedio de conducta y actitud registrado por clase">CA</th><th title="Evaluación continua: promedio de tareas y trabajos">EC</th><th title="Calificación del examen">EXAM</th></tr></thead><tbody>{students.map((student) => { const grade = grades.find((item) => item.studentId === str(student, "id")); return <tr key={str(student, "id")}><td>{str(student, "id")}</td><th><button className="text-button" type="button" onClick={() => setDetailStudentId(str(student, "id"))} aria-label={`Ver detalle de ${str(student, "nombre")}`}>{str(student, "nombre")}</button></th><td>{grade?.days ?? 0}</td><td>{grade?.absences ?? 0}</td><td>{grade?.missingTasks ?? 0}</td><td>{grade?.ca === null || grade?.ca === undefined ? "—" : (grade.ca / 10).toFixed(1)}</td><td>{grade?.ec === null || grade?.ec === undefined ? "Pendiente" : (grade.ec / 10).toFixed(1)}</td><td>{grade?.ex === null || grade?.ex === undefined ? "Pendiente" : (grade.ex / 10).toFixed(1)}</td></tr>; })}</tbody></table></div>
      {!students.length && <p className="dashboard-empty">No hay alumnos registrados en este grupo.</p>}
    </section>}

    {mode === "calificaciones" && detailStudent && <div className="academic-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailStudentId(""); }}><section className="academic-dialog grade-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="grade-detail-title"><button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => setDetailStudentId("")}>×</button><p className="eyebrow">{str(partial ?? {}, "nombre")} · {group}</p><h3 id="grade-detail-title">{str(detailStudent, "nombre")}</h3><p className="grade-detail-subtitle">ID {str(detailStudent, "id")} · Detalle de sesiones, asistencia y actividades</p>
      <div className="matrix-scroll"><table className="academic-matrix grade-detail-table"><thead><tr><th>Sesión (día)</th><th>Asistencia</th><th>Comentario</th><th>Trabajos en clase</th><th>Tareas</th></tr></thead><tbody>{(data?.snapshot.sessions ?? []).filter((session) => str(session, "parcial_id") === partialId && str(session, "grupo") === group && str(session, "estado") !== "Cancelada" && str(session, "fecha_clase") <= today).sort((a, b) => str(a, "fecha_clase").localeCompare(str(b, "fecha_clase"))).map((session) => {
        const sid = str(session, "sesion_id");
        const caRows = (data?.snapshot.conduct ?? []).filter((row) => str(row, "sesion_id") === sid && str(row, "alumno_id").toUpperCase() === detailStudentId.toUpperCase() && str(row, "estado") !== "Anulada");
        const note = caRows.find((row) => ["Anotacion", "Anotación"].includes(str(row, "tipo")));
        const attendance = (data?.snapshot.absences ?? []).find((row) => str(row, "sesion_id") === sid && str(row, "alumno_id").toUpperCase() === detailStudentId.toUpperCase());
        const activities = (data?.snapshot.tasks ?? []).filter((task) => str(task, "parcial_id") === partialId && str(task, "grupo") === group && String(task.activa).toUpperCase() !== "FALSE" && (str(task, "sesion_calificacion_id") === sid || (str(task, "tipo") === "Trabajo en clase" && str(task, "sesion_id") === sid)));
        const renderActivities = (kind: TaskKind) => { const matches = activities.filter((task) => str(task, "tipo") === kind); return matches.length ? <ul className="grade-detail-activities">{matches.map((task) => { const result = (data?.snapshot.taskScores ?? []).find((row) => str(row, "tarea_id") === str(task, "tarea_id") && str(row, "alumno_id").toUpperCase() === detailStudentId.toUpperCase()); const state = str(result ?? {}, "estado"); const score = numeric(result ?? {}, "puntaje"); const resultText = score !== "" ? `${formatTaskScore(score, task)}/10` : state === "Justificada" || state === "Excluida" ? "Justificada" : "0/10"; return <li key={str(task, "tarea_id")}><span>{str(task, "nombre")}</span><small>{resultText}</small></li>; })}</ul> : <span>—</span>; };
        const attendanceStatus = attendanceLetter(attendance?.estado);
        return <tr key={sid}><th>{str(session, "fecha_clase")}</th><td>{attendanceStatus}</td><td>{str(note ?? {}, "observacion") || "—"}</td><td>{renderActivities("Trabajo en clase")}</td><td>{renderActivities("Tarea")}</td></tr>;
      })}</tbody></table></div>
      <section className="grade-detail-reports" aria-labelledby="academic-report-title">
        <div className="academic-matrix-header"><div><p className="eyebrow">REVISIÓN DOCENTE · {str(partial ?? {}, "nombre")}</p><h4 id="academic-report-title">Retroalimentación académica</h4><p>La IA prepara una propuesta basada en los registros del parcial. Revísala antes de compartirla.</p></div>
          <button className="primary-button compact" type="button" onClick={() => void save("generateAiReport", { studentId: detailStudentId, partialId }, "Propuesta generada y guardada como pendiente de revisión.")} disabled={!!busy || !partialId}>Evaluar</button>
        </div>
        {detailReports.length ? <div className="grade-report-list">{detailReports.map((report) => {
          const strengths = reportList(report.fortalezas);
          const opportunities = reportList(report.areas_oportunidad);
          const recommendations = reportList(report.recomendaciones_json);
          const pending = str(report, "estado") === "Pendiente_revision_docente";
          return <article className="grade-report-card" key={str(report, "reporte_id")}>
            <div className="grade-report-heading"><span className="eyebrow">{pending ? "PENDIENTE DE REVISIÓN" : str(report, "estado") || "REPORTE"}</span><small>{str(report, "created_at") ? new Date(str(report, "created_at")).toLocaleDateString("es-MX") : ""}</small></div>
            <p>{str(report, "resumen")}</p>
            {strengths.length > 0 && <div><strong>Fortalezas</strong><ul>{strengths.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
            {opportunities.length > 0 && <div><strong>Áreas de oportunidad</strong><ul>{opportunities.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
            {recommendations.length > 0 && <div><strong>Recomendaciones</strong><ul>{recommendations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
            {pending && <button className="secondary-button compact" type="button" onClick={() => void save("publishAiReport", { reportId: str(report, "reporte_id") }, "Retroalimentación aprobada y compartida con el alumno.")} disabled={!!busy}>Aprobar y compartir</button>}
          </article>;
        })}</div> : <p className="session-hint">Aún no hay propuestas para este alumno en el parcial.</p>}
      </section>
      <button className="secondary-button" type="button" onClick={() => setDetailStudentId("")}>Cerrar</button></section></div>}

    {mode === "clases" && showSessionForm && <div className="academic-dialog-backdrop" role="presentation"><section className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby="session-form-title"><button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => setShowSessionForm(false)}>×</button><p className="eyebrow">NUEVA SESIÓN · {group}</p><h3 id="session-form-title">Agregar sesión</h3><form className="academic-form" onSubmit={(event) => void createSession(event)}><label><span>Fecha de clase</span><input type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} required /></label><button className="primary-button" disabled={!!busy}>Crear sesión</button></form></section></div>}
    {mode === "clases" && showTaskForm && <div className="academic-dialog-backdrop" role="presentation"><section className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby="task-form-title"><button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => setShowTaskForm(null)}>×</button><p className="eyebrow">{showTaskForm === "Tarea" ? "BANCO DE TAREAS · SIN FECHA DE CALIFICACIÓN" : `TRABAJO EN CLASE · ${str(currentSession ?? {}, "fecha_clase")}`}</p><h3 id="task-form-title">{showTaskForm === "Tarea" ? "Agregar tarea" : "Agregar trabajo en clase"}</h3><form className="academic-form" onSubmit={(event) => void createTask(event)}><label><span>Nombre</span><input name="name" required maxLength={120} /></label><label><span>Descripción</span><textarea name="description" maxLength={2000} rows={3} /></label><button className="primary-button" disabled={!!busy}>Guardar</button></form></section></div>}

    {mode === "clases" && showTaskBank && <div className="academic-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowTaskBank(false); }}><section className="academic-dialog task-bank-dialog" role="dialog" aria-modal="true" aria-labelledby="task-bank-title"><button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => setShowTaskBank(false)}>×</button><p className="eyebrow">TAREAS PENDIENTES · {group}</p><h3 id="task-bank-title">Elige las tareas que vas a calificar</h3><div className="task-bank-list">{pendingTasks.length ? pendingTasks.map((task) => { const id = str(task, "tarea_id"); const selected = selectedPendingIds.includes(id); return <div className="task-bank-option" key={id}><label className="task-bank-option-select"><input type="checkbox" checked={selected} onChange={(event) => setSelectedPendingIds((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))} /><span><strong>{str(task, "nombre")}</strong><small>Agregada el {str(task, "fecha_asignacion") || "—"} · {str(task, "descripcion") || "Sin descripción"}</small></span></label><button type="button" className="task-delete-inline" aria-label={`Archivar tarea ${str(task, "nombre")} del banco`} onClick={() => setTaskToDelete(task)} disabled={!!busy}>Archivar</button></div>; }) : <p className="task-bank-empty">No hay tareas pendientes en el banco.</p>}</div><button className="primary-button" type="button" onClick={() => void attachPendingTasks()} disabled={!!busy || !selectedPendingIds.length}>Agregar a esta sesión</button></section></div>}

    {mode === "clases" && annotationStudent && <div className="academic-dialog-backdrop" role="presentation"><section className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby="annotation-title"><button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => setAnnotationStudentId("")}>×</button><p className="eyebrow">ANOTACIÓN · {group} · {str(currentSession ?? {}, "fecha_clase")}</p><h3 id="annotation-title">{str(annotationStudent, "nombre")}</h3><label className="annotation-editor"><span>Incidente u observación</span><textarea rows={5} maxLength={1000} value={studentDrafts[annotationStudentId]?.annotation ?? ""} onChange={(event) => updateStudent(annotationStudentId, { annotation: event.target.value })} /></label><button className="primary-button" type="button" onClick={() => setAnnotationStudentId("")}>Listo</button></section></div>}
    {mode === "clases" && showDeleteConfirmation && currentSession && <div className="academic-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setShowDeleteConfirmation(false); }}><section className="academic-dialog session-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-session-title" aria-describedby="delete-session-description"><button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => setShowDeleteConfirmation(false)} disabled={!!busy}>×</button><p className="eyebrow">{group} · {str(partial ?? {}, "nombre")}</p><h3 id="delete-session-title">¿Archivar esta sesión?</h3><p id="delete-session-description">La sesión del {str(currentSession, "fecha_clase")} y las tareas o trabajos creados o calificados en ella pasarán a Archivados. Sus asistencias, comentarios y calificaciones se conservarán para consulta y dejarán de participar en los cálculos activos.</p><div className="session-delete-actions"><button type="button" className="secondary-button" onClick={() => setShowDeleteConfirmation(false)} disabled={!!busy}>Cancelar</button><button type="button" className="danger-button" onClick={() => void deleteSession()} disabled={!!busy}>Sí, archivar sesión</button></div></section></div>}
    {mode === "clases" && taskToDelete && <div className="academic-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setTaskToDelete(null); }}><section className="academic-dialog session-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-task-title" aria-describedby="delete-task-description"><button className="dialog-close" type="button" aria-label="Cerrar" onClick={() => setTaskToDelete(null)} disabled={!!busy}>×</button><p className="eyebrow">{group} · {str(partial ?? {}, "nombre")}</p><h3 id="delete-task-title">¿Archivar {str(taskToDelete, "tipo") === "Tarea" ? "esta tarea" : "este trabajo en clase"}?</h3><p id="delete-task-description">“{str(taskToDelete, "nombre")}” dejará las sesiones, el banco y los cálculos activos. Sus calificaciones se conservarán y podrás consultar la actividad en Archivados.</p><div className="session-delete-actions"><button type="button" className="secondary-button" onClick={() => setTaskToDelete(null)} disabled={!!busy}>Cancelar</button><button type="button" className="danger-button" onClick={() => void deleteTaskActivity()} disabled={!!busy}>Sí, archivar</button></div></section></div>}
  </section>{busy && <ProgressOverlay title={busy.title} detail={busy.detail} />}</>;
}
