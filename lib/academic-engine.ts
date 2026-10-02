export type AcademicRow = Record<string, string | number | boolean | null | undefined>;

export type AcademicSnapshot = {
  partials: AcademicRow[];
  students: AcademicRow[];
  sessions: AcademicRow[];
  absences: AcademicRow[];
  tasks: AcademicRow[];
  taskScores: AcademicRow[];
  conduct: AcademicRow[];
  grades: AcademicRow[];
  reports: AcademicRow[];
  exams: AcademicRow[];
  attempts: AcademicRow[];
  assignments: AcademicRow[];
};

export type StudentPartialGrade = {
  partialId: string;
  studentId: string;
  group: string;
  days: number;
  absences: number;
  missingTasks: number;
  ca: number | null;
  ec: number | null;
  ecMode: "Promedio" | "Ponderado";
  ecDetails: Array<{ taskId: string; name: string; state: string; score: number | null; weight: number | null }>;
  ex: number | null;
  final100: number | null;
  final10: number | null;
  status: "Completa" | "Pendiente";
};

const value = (row: AcademicRow, key: string) => String(row[key] ?? "").trim();
const num = (input: unknown): number | null => {
  if (input === "" || input === null || input === undefined) return null;
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : null;
};
const sameId = (a: unknown, b: unknown) => String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();
const truthy = (input: unknown) => [true, 1, "1", "TRUE", "true", "Sí", "SI", "Activo"].includes(input as never);

export function mexicoToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function eligibleExam(exam: AcademicRow, student: AcademicRow, partialId: string, assignments: AcademicRow[]) {
  if (value(exam, "parcial_id") !== partialId || value(exam, "estado") !== "Publicado") return false;
  const explicit = assignments.some((assignment) => sameId(assignment.alumno_id, student.id)
    && value(assignment, "examen_id") === value(exam, "examen_id")
    && value(assignment, "estado").toLowerCase() === "activo");
  const groupMatch = value(exam, "grado") === value(student, "grado")
    && (value(exam, "grupo").toUpperCase() === "TODOS" || value(exam, "grupo") === value(student, "grupo"));
  return explicit || groupMatch;
}

export function calculateStudentPartial(snapshot: AcademicSnapshot, student: AcademicRow, partial: AcademicRow, now = new Date()): StudentPartialGrade {
  const studentId = value(student, "id");
  const partialId = value(partial, "parcial_id");
  const group = `${value(student, "grado")} ${value(student, "grupo")}`.trim();
  const sessions = snapshot.sessions.filter((session) => value(session, "parcial_id") === partialId
    && value(session, "grupo") === group && ["Realizada", "Impartida"].includes(value(session, "estado")));
  const sessionIds = new Set(sessions.map((session) => value(session, "sesion_id")));
  const absences = snapshot.absences.filter((absence) => sameId(absence.alumno_id, studentId)
    && value(absence, "parcial_id") === partialId
    && sessionIds.has(value(absence, "sesion_id"))
    && ["I", "INASISTENCIA", "FALTA"].includes(value(absence, "estado").trim().toUpperCase())).length;

  const mode = value(partial, "modo_evaluacion_continua") === "Ponderado" ? "Ponderado" as const : "Promedio" as const;
  const today = mexicoToday(now);
  const groupTasks = snapshot.tasks.filter((task) => value(task, "parcial_id") === partialId
    && value(task, "grupo") === group && truthy(task.activa));
  let missingTasks = 0;
  const ecItems: Array<{ taskId: string; name: string; state: string; score: number | null; weight: number | null }> = [];
  const included: Array<{ score: number; weight: number | null }> = [];
  let pendingActivity = false;
  for (const task of groupTasks) {
    const bankState = value(task, "estado_banco");
    // New tasks live in a teacher-managed bank. A date never makes them due.
    if (bankState === "Pendiente") continue;
    const due = value(task, "fecha_entrega");
    // Rows without estado_banco are legacy records. Preserve their historical
    // due-date behavior; new bank tasks are handled above.
    if (!bankState && (!due || due > today)) continue;
    if (!bankState && !due) continue;
    const record = snapshot.taskScores.find((item) => value(item, "tarea_id") === value(task, "tarea_id") && sameId(item.alumno_id, studentId));
    const state = value(record ?? {}, "estado");
    if (state === "Excluida" || state === "Justificada" || state === "Anulada") continue;
    if (state === "Pendiente" || state === "Pendiente_calificacion") {
      pendingActivity = true;
      ecItems.push({ taskId: value(task, "tarea_id"), name: value(task, "nombre"), state: "Pendiente de calificación", score: null, weight: num(task.peso_ec) });
      continue;
    }
    if (!record && !truthy(task.obligatoria)) continue;
    if (!record && bankState === "En_calificacion") {
      // A task still being graded must not silently turn an unentered mark into zero.
      pendingActivity = true;
      ecItems.push({ taskId: value(task, "tarea_id"), name: value(task, "nombre"), state: "Pendiente de calificación", score: null, weight: num(task.peso_ec) });
      continue;
    }
    // Activity grades are captured on a 0–10 scale. Keep legacy activities
    // with an explicit /100 maximum proportionally compatible.
    const max = num(task.puntaje_maximo) ?? 10;
    const rawScore = num(record?.puntaje) ?? 0;
    const normalized = Math.max(0, Math.min(100, max > 0 ? rawScore / max * 100 : 0));
    included.push({ score: normalized, weight: num(task.peso_ec) });
    if (normalized === 0) {
      missingTasks++;
      ecItems.push({ taskId: value(task, "tarea_id"), name: value(task, "nombre"), state: "No entregada · 0", score: 0, weight: num(task.peso_ec) });
    } else {
      ecItems.push({ taskId: value(task, "tarea_id"), name: value(task, "nombre"), state: "Calificada", score: normalized, weight: num(task.peso_ec) });
    }
  }
  const weightTotal = included.reduce((sum, item) => sum + (item.weight ?? 0), 0);
  const ec = pendingActivity || !included.length
    ? null
    : mode === "Promedio"
      ? included.reduce((sum, item) => sum + item.score, 0) / included.length
      : weightTotal > 0 && included.every((item) => item.weight !== null)
        ? included.reduce((sum, item) => sum + item.score * (item.weight ?? 0), 0) / weightTotal
        : null;

  const caRow = snapshot.grades.find((grade) => value(grade, "parcial_id") === partialId && sameId(grade.alumno_id, studentId));
  const sessionScores = sessions.flatMap((session) => {
    const records = snapshot.conduct.filter((item) => value(item, "parcial_id") === partialId
      && sameId(item.alumno_id, studentId) && value(item, "sesion_id") === value(session, "sesion_id")
      && value(item, "estado") !== "Anulada");
    const unified = records.find((item) => ["Conducta y actitud", "Conducta_y_actitud", "Conducta_Actitud"].includes(value(item, "tipo")));
    const unifiedScore = num(unified?.puntuacion);
    if (unifiedScore !== null) return [Math.max(0, Math.min(100, unifiedScore * 10))];
    const legacy = records.filter((item) => value(item, "tipo") === "Conducta" || value(item, "tipo") === "Actitud")
      .map((item) => num(item.puntuacion)).filter((score): score is number => score !== null);
    // Legacy rows were captured on a 0–100 scale. The new unified row uses 0–10.
    return legacy.length ? [legacy.reduce((sum, score) => sum + score, 0) / legacy.length] : [];
  });
  const rubric = snapshot.conduct.find((row) => value(row, "parcial_id") === partialId
    && sameId(row.alumno_id, studentId) && value(row, "tipo") === "Rubrica C.A.");
  const rubricScore = num(rubric?.puntuacion);
  const ca = rubric
    ? ["Aprobada_docente", "Evaluada_ai"].includes(value(rubric, "estado")) && rubricScore !== null ? rubricScore * 10 : null
    : sessionScores.length
      ? sessionScores.reduce((sum, score) => sum + score, 0) / sessionScores.length
      // CALIFICACIONES is a derived snapshot. When no session or rubric evidence
      // exists, the product rule is a full C.A. score rather than a stale copied value.
      : 100;
  const eligible = snapshot.exams.filter((exam) => eligibleExam(exam, student, partialId, snapshot.assignments));
  const examScores: number[] = [];
  let examPending = false;
  for (const exam of eligible) {
    const attempts = snapshot.attempts.filter((attempt) => value(attempt, "examen_id") === value(exam, "examen_id") && sameId(attempt.alumno_id, studentId));
    const attempt = attempts.find((item) => value(item, "estado") === "Definitivo") ?? attempts.find((item) => value(item, "estado") === "Provisional");
    if (!attempt || value(attempt, "estado") !== "Definitivo" || truthy(attempt.ai_pendiente)) { examPending = true; continue; }
    const score = num(attempt.puntaje_total);
    const maximum = num(exam.puntaje_maximo) ?? 100;
    if (score === null || maximum <= 0) { examPending = true; continue; }
    examScores.push(Math.max(0, Math.min(100, score / maximum * 100)));
  }
  const ex = eligible.length && !examPending && examScores.length === eligible.length
    ? examScores.reduce((sum, score) => sum + score, 0) / examScores.length
    : num(caRow?.examen);
  const final100 = ca !== null && ec !== null && ex !== null ? ca * 0.1 + ec * 0.4 + ex * 0.5 : null;
  return {
    partialId, studentId, group, days: sessions.length, absences, missingTasks, ca, ec, ecMode: mode,
    ecDetails: ecItems, ex, final100, final10: final100 === null ? null : final100 / 10,
    status: final100 === null ? "Pendiente" : "Completa",
  };
}

export function calculateAcademicMatrix(snapshot: AcademicSnapshot, now = new Date()): StudentPartialGrade[] {
  return snapshot.students.flatMap((student) => snapshot.partials.map((partial) => calculateStudentPartial(snapshot, student, partial, now)));
}

export function toGradeSnapshotRow(grade: StudentPartialGrade) {
  return {
    partialId: grade.partialId, studentId: grade.studentId, days: grade.days, absences: grade.absences,
    missingTasks: grade.missingTasks, ca: grade.ca, ec: grade.ec, ecMode: grade.ecMode,
    ecDetails: grade.ecDetails, ex: grade.ex, final100: grade.final100, final10: grade.final10, status: grade.status,
  };
}
