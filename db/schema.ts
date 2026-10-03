import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const calendarDate = (name: string) => date(name, { mode: "string" });

export const students = pgTable(
  "students",
  {
    id: text("id").primaryKey(),
    name: text("nombre").notNull(),
    level: text("nivel"),
    grade: text("grado"),
    group: text("grupo"),
    schoolYear: text("ciclo_escolar"),
    assignment: text("asignacion"),
    sourceSheet: text("hoja_origen"),
  },
  (table) => [index("students_school_year_grade_group_idx").on(table.schoolYear, table.grade, table.group)],
);

export const academicPeriods = pgTable(
  "academic_periods",
  {
    id: text("parcial_id").primaryKey(),
    name: text("nombre").notNull(),
    order: integer("orden"),
    schoolYear: text("ciclo_escolar"),
    subject: text("materia"),
    status: text("estado"),
    startsOn: calendarDate("fecha_inicio"),
    closesOn: calendarDate("fecha_cierre"),
    attendanceWeight: numeric("peso_asistencias"),
    classworkWeight: numeric("peso_trabajos_clase"),
    tasksWeight: numeric("peso_tareas"),
    continuousAssessmentWeight: numeric("peso_evaluacion_continua"),
    conductWeight: numeric("peso_conducta"),
    attitudeWeight: numeric("peso_actitud"),
    examWeight: numeric("peso_examen"),
    totalWeight: numeric("ponderacion_total"),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
    continuousAssessmentMode: text("modo_evaluacion_continua"),
  },
  (table) => [index("academic_periods_school_year_order_idx").on(table.schoolYear, table.order)],
);

export const appConfig = pgTable("app_config", {
  key: text("clave").primaryKey(),
  value: text("valor"),
  description: text("descripcion"),
  editable: boolean("editable"),
  updatedAt: instant("updated_at"),
});

export const evaluations = pgTable(
  "evaluations",
  {
    id: text("evaluacion_id").primaryKey(),
    partialId: text("parcial_id").notNull().references(() => academicPeriods.id),
    studentId: text("alumno_id").notNull().references(() => students.id),
    group: text("grupo"),
    classDays: numeric("dias_clase"),
    absences: numeric("faltas"),
    missingTasks: numeric("tareas_faltantes"),
    continuousAssessment: numeric("evaluacion_continua"),
    conduct: numeric("conducta"),
    attitude: numeric("actitud"),
    exam: numeric("examen"),
    partialGrade: numeric("calificacion_parcial"),
    status: text("estado"),
    teacherComment: text("comentario_docente"),
    aiReportStatus: text("reporte_ai_estado"),
    innovatStatus: text("innovat_estado"),
    updatedAt: instant("updated_at"),
  },
  (table) => [
    index("evaluations_partial_student_idx").on(table.partialId, table.studentId),
    index("evaluations_group_idx").on(table.group),
  ],
);

export const classSessions = pgTable(
  "class_sessions",
  {
    id: text("sesion_id").primaryKey(),
    partialId: text("parcial_id").notNull().references(() => academicPeriods.id),
    classDate: calendarDate("fecha_clase"),
    group: text("grupo"),
    subject: text("materia"),
    topic: text("tema"),
    status: text("estado"),
    notes: text("observaciones"),
    recordedBy: text("registrado_por"),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
    captureStatus: text("estado_captura"),
    rollCallComplete: boolean("pase_lista_completo"),
  },
  (table) => [index("class_sessions_partial_group_date_idx").on(table.partialId, table.group, table.classDate)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("tarea_id").primaryKey(),
    partialId: text("parcial_id").notNull().references(() => academicPeriods.id),
    group: text("grupo"),
    name: text("nombre").notNull(),
    type: text("tipo"),
    assignedOn: calendarDate("fecha_asignacion"),
    dueOn: calendarDate("fecha_entrega"),
    maxScore: numeric("puntaje_maximo"),
    mandatory: boolean("obligatoria"),
    active: boolean("activa"),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
    sessionId: text("sesion_id").references(() => classSessions.id),
    description: text("descripcion"),
    continuousAssessmentWeight: numeric("peso_ec"),
    bankStatus: text("estado_banco"),
    gradingSessionId: text("sesion_calificacion_id"),
  },
  (table) => [index("tasks_partial_group_status_idx").on(table.partialId, table.group, table.bankStatus)],
);

export const taskGrades = pgTable(
  "task_grades",
  {
    id: text("registro_id").primaryKey(),
    taskId: text("tarea_id").notNull().references(() => tasks.id),
    partialId: text("parcial_id").notNull().references(() => academicPeriods.id),
    studentId: text("alumno_id").notNull().references(() => students.id),
    group: text("grupo"),
    submitted: boolean("entregada"),
    submittedOn: calendarDate("fecha_entrega"),
    score: numeric("puntaje"),
    status: text("estado"),
    notes: text("observaciones"),
    updatedAt: instant("updated_at"),
    gradingSessionId: text("sesion_calificacion_id"),
  },
  (table) => [index("task_grades_partial_student_idx").on(table.partialId, table.studentId)],
);

export const attendance = pgTable(
  "attendance",
  {
    id: text("asistencia_id").primaryKey(),
    sessionId: text("sesion_id").notNull().references(() => classSessions.id),
    partialId: text("parcial_id").notNull().references(() => academicPeriods.id),
    studentId: text("alumno_id").notNull().references(() => students.id),
    group: text("grupo"),
    classDate: calendarDate("fecha_clase"),
    status: text("estado"),
    notes: text("observaciones"),
    recordedBy: text("registrado_por"),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
  },
  (table) => [
    index("attendance_partial_student_idx").on(table.partialId, table.studentId),
    index("attendance_session_idx").on(table.sessionId),
  ],
);

export const conductAttitude = pgTable(
  "conduct_attitude",
  {
    id: text("registro_id").primaryKey(),
    partialId: text("parcial_id").notNull().references(() => academicPeriods.id),
    studentId: text("alumno_id").notNull().references(() => students.id),
    group: text("grupo"),
    date: calendarDate("fecha"),
    type: text("tipo"),
    observation: text("observacion"),
    infraction: text("infraccion"),
    score: numeric("puntuacion"),
    rubricVersion: text("rubrica_version"),
    status: text("estado"),
    recordedBy: text("registrado_por"),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
    sessionId: text("sesion_id").references(() => classSessions.id),
    rubricCriteria: jsonb("rubrica_criterios_json"),
    rubricProposal: jsonb("rubrica_propuesta_json"),
    rubricEvidence: jsonb("rubrica_evidencias_json"),
    rubricModel: text("rubrica_modelo"),
    sourceHash: text("rubrica_fuente_hash"),
    aiEvaluationStatus: text("evaluacion_ia_estado"),
    aiSuggestedScore: numeric("evaluacion_ia_puntaje_sugerido"),
    aiJustification: text("evaluacion_ia_justificacion"),
    aiPromptVersion: text("evaluacion_ia_prompt_version"),
  },
  (table) => [
    index("conduct_attitude_partial_student_idx").on(table.partialId, table.studentId),
    index("conduct_attitude_session_idx").on(table.sessionId),
  ],
);

export const exams = pgTable(
  "exams",
  {
    id: text("examen_id").primaryKey(),
    partialId: text("parcial_id").notNull().references(() => academicPeriods.id),
    name: text("nombre").notNull(),
    subject: text("materia"),
    grade: text("grado"),
    group: text("grupo"),
    status: text("estado"),
    opensAt: instant("fecha_apertura"),
    closesAt: instant("fecha_cierre"),
    durationMinutes: integer("duracion_minutos"),
    maxScore: numeric("puntaje_maximo"),
    requiresFullscreen: boolean("requiere_pantalla_completa"),
    instructions: text("instrucciones"),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
    version: integer("version"),
    sourceExamId: text("examen_origen_id"),
    aiProvider: text("proveedor_ia"),
  },
  (table) => [index("exams_partial_group_status_idx").on(table.partialId, table.group, table.status)],
);

export const examQuestions = pgTable(
  "exam_questions",
  {
    id: text("reactivo_id").primaryKey(),
    examId: text("examen_id").notNull().references(() => exams.id),
    order: integer("orden"),
    topic: text("tema"),
    type: text("tipo"),
    prompt: text("consigna"),
    options: jsonb("opciones_json"),
    correctAnswer: jsonb("respuesta_correcta"),
    maxScore: numeric("puntaje_maximo"),
    evaluationMethod: text("metodo_evaluacion"),
    rubric: text("rubrica"),
    active: boolean("activo"),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
  },
  (table) => [index("exam_questions_exam_order_idx").on(table.examId, table.order)],
);

export const examAssignments = pgTable(
  "exam_assignments",
  {
    id: text("asignacion_id").primaryKey(),
    studentId: text("alumno_id").notNull().references(() => students.id),
    examId: text("examen_id").notNull().references(() => exams.id),
    status: text("estado"),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
  },
  (table) => [
    index("exam_assignments_exam_student_idx").on(table.examId, table.studentId),
    uniqueIndex("exam_assignments_student_exam_unique").on(table.studentId, table.examId),
  ],
);

export const examAttempts = pgTable(
  "exam_attempts",
  {
    id: text("intento_id").primaryKey(),
    examId: text("examen_id").notNull().references(() => exams.id),
    partialId: text("parcial_id").notNull().references(() => academicPeriods.id),
    studentId: text("alumno_id").notNull().references(() => students.id),
    group: text("grupo"),
    status: text("estado"),
    startedAt: instant("inicio_at"),
    finishedAt: instant("fin_at"),
    timeLimitMinutes: numeric("tiempo_limite_min"),
    automaticScore: numeric("puntaje_automatico"),
    aiScore: numeric("puntaje_ai"),
    totalScore: numeric("puntaje_total"),
    gradeOnTen: numeric("calificacion_10"),
    aiPending: boolean("ai_pendiente"),
    locked: boolean("bloqueo_activo"),
    lockedAt: instant("bloqueado_at"),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
  },
  (table) => [
    index("exam_attempts_exam_student_status_idx").on(table.examId, table.studentId, table.status),
    index("exam_attempts_partial_student_idx").on(table.partialId, table.studentId),
  ],
);

export const examAnswers = pgTable(
  "exam_answers",
  {
    id: text("respuesta_id").primaryKey(),
    attemptId: text("intento_id").notNull().references(() => examAttempts.id),
    questionId: text("reactivo_id").notNull().references(() => examQuestions.id),
    studentId: text("alumno_id").notNull().references(() => students.id),
    answer: text("respuesta"),
    status: text("estado_respuesta"),
    score: numeric("puntaje_obtenido"),
    manualScore: numeric("puntaje_manual"),
    manualScoreUpdatedAt: instant("puntaje_manual_updated_at"),
    evaluationMethod: text("metodo_evaluacion"),
    feedback: text("retroalimentacion"),
    aiStatus: text("ai_estado"),
    updatedAt: instant("updated_at"),
  },
  (table) => [
    index("exam_answers_attempt_idx").on(table.attemptId),
    uniqueIndex("exam_answers_attempt_question_unique").on(table.attemptId, table.questionId),
  ],
);

export const aiEvaluations = pgTable(
  "ai_evaluations",
  {
    id: text("evaluacion_ai_id").primaryKey(),
    attemptId: text("intento_id").notNull().references(() => examAttempts.id),
    questionId: text("reactivo_id").notNull().references(() => examQuestions.id),
    model: text("modelo"),
    promptVersion: text("prompt_version"),
    input: jsonb("entrada_json"),
    status: text("estado"),
    score: numeric("puntaje"),
    feedback: text("retroalimentacion"),
    breakdown: jsonb("desglose_json"),
    error: text("error"),
    executedAt: instant("ejecutado_at"),
    approvedAt: instant("aprobado_at"),
  },
  (table) => [
    index("ai_evaluations_attempt_question_idx").on(table.attemptId, table.questionId),
    uniqueIndex("ai_evaluations_attempt_question_unique").on(table.attemptId, table.questionId),
  ],
);

export const grades = pgTable(
  "grades",
  {
    id: text("calificacion_id").primaryKey(),
    partialId: text("parcial_id").notNull().references(() => academicPeriods.id),
    studentId: text("alumno_id").notNull().references(() => students.id),
    group: text("grupo"),
    classDays: numeric("dias_clase"),
    absences: numeric("faltas"),
    missingTasks: numeric("tareas_faltantes"),
    continuousAssessment: numeric("evaluacion_continua"),
    conduct: numeric("conducta"),
    attitude: numeric("actitud"),
    exam: numeric("examen"),
    partialGrade: numeric("calificacion_parcial"),
    gradeOnTen: numeric("calificacion_10"),
    status: text("estado"),
    teacherComment: text("comentario_docente"),
    aiReportStatus: text("reporte_ai_estado"),
    innovatStatus: text("innovat_estado"),
    updatedAt: instant("updated_at"),
    conductAttitudeGrade: numeric("calificacion_ca"),
    continuousAssessmentMode: text("modo_evaluacion_continua"),
    continuousAssessmentDetails: jsonb("detalle_ec_json"),
    calculationVersion: text("version_calculo"),
  },
  (table) => [
    index("grades_partial_student_idx").on(table.partialId, table.studentId),
    uniqueIndex("grades_partial_student_unique").on(table.partialId, table.studentId),
  ],
);

export const aiReports = pgTable(
  "ai_reports",
  {
    id: text("reporte_id").primaryKey(),
    partialId: text("parcial_id").notNull().references(() => academicPeriods.id),
    studentId: text("alumno_id").notNull().references(() => students.id),
    type: text("tipo"),
    status: text("estado"),
    summary: text("resumen"),
    strengths: text("fortalezas"),
    opportunities: text("areas_oportunidad"),
    recommendations: jsonb("recomendaciones_json"),
    evidence: jsonb("evidencias_json"),
    studentVisible: boolean("visibilidad_alumno"),
    reviewedBy: text("revisado_por"),
    reviewedAt: instant("revisado_at"),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
  },
  (table) => [index("ai_reports_partial_student_idx").on(table.partialId, table.studentId)],
);

export const innovatExports = pgTable(
  "innovat_exports",
  {
    id: text("export_id").primaryKey(),
    partialId: text("parcial_id").notNull().references(() => academicPeriods.id),
    studentId: text("alumno_id").notNull().references(() => students.id),
    group: text("grupo"),
    payload: jsonb("payload_json"),
    status: text("estado"),
    sendAttempts: integer("intentos_envio"),
    response: text("respuesta_innovat"),
    error: text("error"),
    sentAt: instant("enviado_at"),
    updatedAt: instant("updated_at"),
  },
  (table) => [index("innovat_exports_partial_student_idx").on(table.partialId, table.studentId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("evento_id").primaryKey(),
    type: text("tipo"),
    entity: text("entidad"),
    entityId: text("entidad_id"),
    partialId: text("parcial_id"),
    studentId: text("alumno_id"),
    actorId: text("actor_id"),
    details: jsonb("detalle_json"),
    occurredAt: instant("ocurrido_at"),
  },
  (table) => [index("audit_events_entity_time_idx").on(table.entity, table.entityId, table.occurredAt)],
);

export const accessRecords = pgTable("access_records", {
  id: text("acceso_id").primaryKey(),
  role: text("rol"),
  studentId: text("alumno_id"),
  login: text("usuario_login"),
  status: text("estado"),
  mustChangeCredential: boolean("debe_cambiar_credencial"),
  lastAccessAt: instant("ultimo_acceso"),
  createdAt: instant("created_at"),
  updatedAt: instant("updated_at"),
});

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: text("job_id").primaryKey(),
    type: text("tipo").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("estado").notNull().default("queued"),
    attempts: integer("intentos").notNull().default(0),
    runAfter: instant("ejecutar_despues").notNull(),
    lockedBy: text("bloqueado_por"),
    lockedAt: instant("bloqueado_at"),
    lastError: text("ultimo_error"),
    createdAt: instant("created_at").notNull().defaultNow(),
    updatedAt: instant("updated_at").notNull().defaultNow(),
    completedAt: instant("completado_at"),
  },
  (table) => [
    uniqueIndex("background_jobs_idempotency_key_unique").on(table.idempotencyKey),
    index("background_jobs_status_run_after_idx").on(table.status, table.runAfter),
  ],
);
