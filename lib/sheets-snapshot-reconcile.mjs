const define = (headers, primaryKey, options = {}) => ({ headers, primaryKey, ...options });

export const SHEETS_MIGRATION_CONTRACT = {
  Registros: define("id nombre nivel grado grupo ciclo_escolar asignacion hoja_origen".split(" "), "id", { caseInsensitiveKey: true }),
  PARCIALES: define("parcial_id nombre orden ciclo_escolar materia estado fecha_inicio fecha_cierre peso_asistencias peso_trabajos_clase peso_tareas peso_evaluacion_continua peso_conducta peso_actitud peso_examen ponderacion_total created_at updated_at modo_evaluacion_continua".split(" "), "parcial_id", { integers: ["orden"], dates: ["fecha_inicio", "fecha_cierre"], timestamps: ["created_at", "updated_at"], numerics: ["peso_asistencias", "peso_trabajos_clase", "peso_tareas", "peso_evaluacion_continua", "peso_conducta", "peso_actitud", "peso_examen", "ponderacion_total"] }),
  EVALUACIONES: define("evaluacion_id parcial_id alumno_id grupo dias_clase faltas tareas_faltantes evaluacion_continua conducta actitud examen calificacion_parcial estado comentario_docente reporte_ai_estado innovat_estado updated_at".split(" "), "evaluacion_id", { refs: [["parcial_id", "PARCIALES", "parcial_id"], ["alumno_id", "Registros", "id"]], timestamps: ["updated_at"], numerics: ["dias_clase", "faltas", "tareas_faltantes", "evaluacion_continua", "conducta", "actitud", "examen", "calificacion_parcial"] }),
  TAREAS: define("tarea_id parcial_id grupo nombre tipo fecha_asignacion fecha_entrega puntaje_maximo obligatoria activa created_at updated_at sesion_id descripcion peso_ec estado_banco sesion_calificacion_id".split(" "), "tarea_id", { refs: [["parcial_id", "PARCIALES", "parcial_id"], ["sesion_id", "SESIONES_CLASE", "sesion_id", true], ["sesion_calificacion_id", "SESIONES_CLASE", "sesion_id", true]], dates: ["fecha_asignacion", "fecha_entrega"], timestamps: ["created_at", "updated_at"], numerics: ["puntaje_maximo", "peso_ec"], booleans: ["obligatoria", "activa"] }),
  CALIFICACIONES_TAREAS: define("registro_id tarea_id parcial_id alumno_id grupo entregada fecha_entrega puntaje estado observaciones updated_at sesion_calificacion_id".split(" "), "registro_id", { refs: [["tarea_id", "TAREAS", "tarea_id"], ["parcial_id", "PARCIALES", "parcial_id"], ["alumno_id", "Registros", "id"], ["sesion_calificacion_id", "SESIONES_CLASE", "sesion_id", true]], dates: ["fecha_entrega"], timestamps: ["updated_at"], numerics: ["puntaje"], booleans: ["entregada"], uniqueKeys: [["tarea_id", "alumno_id"]] }),
  CONFIG: define("clave valor descripcion editable updated_at".split(" "), "clave", { timestamps: ["updated_at"], booleans: ["editable"] }),
  SESIONES_CLASE: define("sesion_id parcial_id fecha_clase grupo materia tema estado observaciones registrado_por created_at updated_at estado_captura pase_lista_completo".split(" "), "sesion_id", { refs: [["parcial_id", "PARCIALES", "parcial_id"]], dates: ["fecha_clase"], timestamps: ["created_at", "updated_at"], booleans: ["pase_lista_completo"] }),
  ASISTENCIAS: define("asistencia_id sesion_id parcial_id alumno_id grupo fecha_clase estado observaciones registrado_por created_at updated_at".split(" "), "asistencia_id", { refs: [["sesion_id", "SESIONES_CLASE", "sesion_id"], ["parcial_id", "PARCIALES", "parcial_id"], ["alumno_id", "Registros", "id"]], dates: ["fecha_clase"], timestamps: ["created_at", "updated_at"] }),
  CONDUCTA_ACTITUD: define("registro_id parcial_id alumno_id grupo fecha tipo observacion infraccion puntuacion rubrica_version estado registrado_por created_at updated_at sesion_id rubrica_criterios_json rubrica_propuesta_json rubrica_evidencias_json rubrica_modelo rubrica_fuente_hash evaluacion_ia_estado evaluacion_ia_puntaje_sugerido evaluacion_ia_justificacion evaluacion_ia_prompt_version".split(" "), "registro_id", { refs: [["parcial_id", "PARCIALES", "parcial_id"], ["alumno_id", "Registros", "id"], ["sesion_id", "SESIONES_CLASE", "sesion_id", true]], dates: ["fecha"], timestamps: ["created_at", "updated_at"], numerics: ["puntuacion", "evaluacion_ia_puntaje_sugerido"], json: ["rubrica_criterios_json", "rubrica_propuesta_json", "rubrica_evidencias_json"] }),
  EXAMENES: define("examen_id parcial_id nombre materia grado grupo estado fecha_apertura fecha_cierre duracion_minutos puntaje_maximo requiere_pantalla_completa instrucciones created_at updated_at version examen_origen_id proveedor_ia".split(" "), "examen_id", { refs: [["parcial_id", "PARCIALES", "parcial_id"]], timestamps: ["fecha_apertura", "fecha_cierre", "created_at", "updated_at"], integers: ["duracion_minutos", "version"], numerics: ["puntaje_maximo"], booleans: ["requiere_pantalla_completa"] }),
  REACTIVOS: define("reactivo_id examen_id orden tema tipo consigna opciones_json respuesta_correcta puntaje_maximo metodo_evaluacion rubrica activo created_at updated_at".split(" "), "reactivo_id", { refs: [["examen_id", "EXAMENES", "examen_id"]], integers: ["orden"], numerics: ["puntaje_maximo"], timestamps: ["created_at", "updated_at"], booleans: ["activo"], json: ["opciones_json", "respuesta_correcta"] }),
  EXAMEN_ASIGNACIONES: define("asignacion_id alumno_id examen_id estado created_at updated_at".split(" "), "asignacion_id", { refs: [["alumno_id", "Registros", "id"], ["examen_id", "EXAMENES", "examen_id"]], timestamps: ["created_at", "updated_at"], uniqueKeys: [["alumno_id", "examen_id"]] }),
  INTENTOS: define("intento_id examen_id parcial_id alumno_id grupo estado inicio_at fin_at tiempo_limite_min puntaje_automatico puntaje_ai puntaje_total calificacion_10 ai_pendiente bloqueo_activo created_at updated_at".split(" "), "intento_id", { refs: [["examen_id", "EXAMENES", "examen_id"], ["parcial_id", "PARCIALES", "parcial_id"], ["alumno_id", "Registros", "id"]], timestamps: ["inicio_at", "fin_at", "created_at", "updated_at"], numerics: ["tiempo_limite_min", "puntaje_automatico", "puntaje_ai", "puntaje_total", "calificacion_10"], booleans: ["ai_pendiente", "bloqueo_activo"] }),
  RESPUESTAS: define("respuesta_id intento_id reactivo_id alumno_id respuesta estado_respuesta puntaje_obtenido metodo_evaluacion retroalimentacion ai_estado updated_at".split(" "), "respuesta_id", { refs: [["intento_id", "INTENTOS", "intento_id"], ["reactivo_id", "REACTIVOS", "reactivo_id"], ["alumno_id", "Registros", "id"]], timestamps: ["updated_at"], numerics: ["puntaje_obtenido"], uniqueKeys: [["intento_id", "reactivo_id"]] }),
  EVALUACION_AI: define("evaluacion_ai_id intento_id reactivo_id modelo prompt_version entrada_json estado puntaje retroalimentacion desglose_json error ejecutado_at aprobado_at".split(" "), "evaluacion_ai_id", { refs: [["intento_id", "INTENTOS", "intento_id"], ["reactivo_id", "REACTIVOS", "reactivo_id"]], timestamps: ["ejecutado_at", "aprobado_at"], numerics: ["puntaje"], json: ["entrada_json", "desglose_json"], uniqueKeys: [["intento_id", "reactivo_id"]] }),
  CALIFICACIONES: define("calificacion_id parcial_id alumno_id grupo dias_clase faltas tareas_faltantes evaluacion_continua conducta actitud examen calificacion_parcial calificacion_10 estado comentario_docente reporte_ai_estado innovat_estado updated_at calificacion_ca modo_evaluacion_continua detalle_ec_json version_calculo".split(" "), "calificacion_id", { refs: [["parcial_id", "PARCIALES", "parcial_id"], ["alumno_id", "Registros", "id"]], timestamps: ["updated_at"], numerics: ["dias_clase", "faltas", "tareas_faltantes", "evaluacion_continua", "conducta", "actitud", "examen", "calificacion_parcial", "calificacion_10", "calificacion_ca"], json: ["detalle_ec_json"], uniqueKeys: [["parcial_id", "alumno_id"]] }),
  REPORTES_AI: define("reporte_id parcial_id alumno_id tipo estado resumen fortalezas areas_oportunidad recomendaciones_json evidencias_json visibilidad_alumno revisado_por revisado_at created_at updated_at".split(" "), "reporte_id", { refs: [["parcial_id", "PARCIALES", "parcial_id"], ["alumno_id", "Registros", "id"]], timestamps: ["revisado_at", "created_at", "updated_at"], booleans: ["visibilidad_alumno"], json: ["recomendaciones_json", "evidencias_json"] }),
  INNOVAT_SALIDA: define("export_id parcial_id alumno_id grupo payload_json estado intentos_envio respuesta_innovat error enviado_at updated_at".split(" "), "export_id", { refs: [["parcial_id", "PARCIALES", "parcial_id"], ["alumno_id", "Registros", "id"]], timestamps: ["enviado_at", "updated_at"], integers: ["intentos_envio"], json: ["payload_json"] }),
  EVENTOS: define("evento_id tipo entidad entidad_id parcial_id alumno_id actor_id detalle_json ocurrido_at".split(" "), "evento_id", { timestamps: ["ocurrido_at"], json: ["detalle_json"] }),
  ACCESOS: define("acceso_id rol alumno_id usuario_login estado debe_cambiar_credencial ultimo_acceso created_at updated_at".split(" "), "acceso_id", { refs: [["alumno_id", "Registros", "id", true]], timestamps: ["ultimo_acceso", "created_at", "updated_at"], booleans: ["debe_cambiar_credencial"] }),
};

export const SHEETS_TARGET_TABLES = {
  Registros: "students",
  PARCIALES: "academic_periods",
  EVALUACIONES: "evaluations",
  TAREAS: "tasks",
  CALIFICACIONES_TAREAS: "task_grades",
  CONFIG: "app_config",
  SESIONES_CLASE: "class_sessions",
  ASISTENCIAS: "attendance",
  CONDUCTA_ACTITUD: "conduct_attitude",
  EXAMENES: "exams",
  REACTIVOS: "exam_questions",
  EXAMEN_ASIGNACIONES: "exam_assignments",
  INTENTOS: "exam_attempts",
  RESPUESTAS: "exam_answers",
  EVALUACION_AI: "ai_evaluations",
  CALIFICACIONES: "grades",
  REPORTES_AI: "ai_reports",
  INNOVAT_SALIDA: "innovat_exports",
  EVENTOS: "audit_events",
  ACCESOS: "access_records",
};

export const SHEETS_TARGET_SCHEMA_EXPORTS = {
  Registros: "students",
  PARCIALES: "academicPeriods",
  EVALUACIONES: "evaluations",
  TAREAS: "tasks",
  CALIFICACIONES_TAREAS: "taskGrades",
  CONFIG: "appConfig",
  SESIONES_CLASE: "classSessions",
  ASISTENCIAS: "attendance",
  CONDUCTA_ACTITUD: "conductAttitude",
  EXAMENES: "exams",
  REACTIVOS: "examQuestions",
  EXAMEN_ASIGNACIONES: "examAssignments",
  INTENTOS: "examAttempts",
  RESPUESTAS: "examAnswers",
  EVALUACION_AI: "aiEvaluations",
  CALIFICACIONES: "grades",
  REPORTES_AI: "aiReports",
  INNOVAT_SALIDA: "innovatExports",
  EVENTOS: "auditEvents",
  ACCESOS: "accessRecords",
};

// Columns managed by the PostgreSQL application which have no source-sheet field.
export const SHEETS_TARGET_ONLY_COLUMNS = {
  INTENTOS: ["bloqueado_at"],
};

const isBlank = (value) => value === null || value === undefined || value === "";
const asText = (value) => String(value ?? "").trim();
const keyValue = (value, caseInsensitive = false) => {
  const result = asText(value);
  return caseInsensitive ? result.toUpperCase() : result;
};
const isNumeric = (value) => typeof value === "number"
  ? Number.isFinite(value)
  : typeof value === "string" && /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value.trim());
const isInteger = (value) => isNumeric(value) && Number.isInteger(Number(String(value).replaceAll(",", "")));
const isBoolean = (value) => typeof value === "boolean" || value === 0 || value === 1
  || (typeof value === "string" && ["true", "false", "sí", "si", "no", "1", "0"].includes(value.trim().toLocaleLowerCase("es-MX")));
const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const isTimestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
  && !Number.isNaN(Date.parse(value));
const isJson = (value) => {
  if (typeof value === "object") return true;
  if (typeof value !== "string") return false;
  try { JSON.parse(value); return true; } catch { return false; }
};
const isLegacyCorrectAnswer = (tab, field, value) => tab === "REACTIVOS" && field === "respuesta_correcta"
  && typeof value === "string" && !/^[\[{\"]/.test(value.trim());

export function reconcileSheetsSnapshot(snapshot) {
  const issues = [];
  const warnings = [];
  const issue = (code, tab, row, field = "") => issues.push({ code, tab, row, field });
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { ok: false, counts: {}, errors: [{ code: "snapshot_not_object", tab: "", row: 0, field: "" }], warnings: [] };
  }

  const tabs = snapshot.tabs;
  const headers = snapshot.headers;
  if (!tabs || typeof tabs !== "object" || Array.isArray(tabs)) {
    return { ok: false, counts: {}, errors: [{ code: "tabs_missing", tab: "", row: 0, field: "tabs" }], warnings: [] };
  }
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return { ok: false, counts: {}, errors: [{ code: "headers_missing", tab: "", row: 0, field: "headers" }], warnings: [] };
  }

  const expectedTabs = Object.keys(SHEETS_MIGRATION_CONTRACT);
  const unknownTabs = Object.keys(tabs).filter((tab) => !expectedTabs.includes(tab));
  for (const tab of unknownTabs) warnings.push({ code: "unmapped_tab", tab });
  const tables = {};
  const counts = {};

  for (const tab of expectedTabs) {
    const definition = SHEETS_MIGRATION_CONTRACT[tab];
    const rows = tabs[tab];
    if (!Array.isArray(rows)) {
      issue("tab_missing_or_not_array", tab, 0);
      tables[tab] = [];
      counts[tab] = 0;
      continue;
    }
    tables[tab] = rows;
    counts[tab] = rows.length;
    if (!Array.isArray(headers[tab])) {
      issue("header_missing_or_not_array", tab, 0);
    } else {
      const found = new Set(headers[tab].map(asText));
      for (const column of definition.headers) if (!found.has(column)) issue("expected_header_missing", tab, 1, column);
      for (const column of found) if (column && !definition.headers.includes(column)) warnings.push({ code: "unmapped_header", tab, field: column });
    }
    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        issue("row_not_object", tab, rowNumber);
        return;
      }
      for (const column of definition.headers) {
        if (!Object.hasOwn(row, column)) issue("row_missing_header_field", tab, rowNumber, column);
      }
      for (const column of Object.keys(row)) {
        if (!definition.headers.includes(column)) issue("unmapped_row_field", tab, rowNumber, column);
      }
      if (isBlank(row[definition.primaryKey])) issue("primary_key_missing", tab, rowNumber, definition.primaryKey);
      for (const field of definition.numerics ?? []) if (!isBlank(row[field]) && !isNumeric(row[field])) issue("invalid_numeric", tab, rowNumber, field);
      for (const field of definition.integers ?? []) if (!isBlank(row[field]) && !isInteger(row[field])) issue("invalid_integer", tab, rowNumber, field);
      for (const field of definition.booleans ?? []) if (!isBlank(row[field]) && !isBoolean(row[field])) issue("invalid_boolean", tab, rowNumber, field);
      for (const field of definition.dates ?? []) if (!isBlank(row[field]) && !isDate(row[field])) issue("date_not_iso", tab, rowNumber, field);
      for (const field of definition.timestamps ?? []) if (!isBlank(row[field]) && !isTimestamp(row[field])) issue("timestamp_not_iso8601_with_timezone", tab, rowNumber, field);
      for (const field of definition.json ?? []) if (!isBlank(row[field]) && !isJson(row[field]) && !isLegacyCorrectAnswer(tab, field, row[field])) issue("invalid_json", tab, rowNumber, field);
    });
  }

  const indexes = {};
  for (const tab of expectedTabs) {
    const definition = SHEETS_MIGRATION_CONTRACT[tab];
    const primary = new Map();
    const caseInsensitive = Boolean(definition.caseInsensitiveKey);
    tables[tab].forEach((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      const value = keyValue(row[definition.primaryKey], caseInsensitive);
      if (!value) return;
      if (primary.has(value)) issue("duplicate_primary_key", tab, index + 2, definition.primaryKey);
      else primary.set(value, index + 2);
    });
    indexes[tab] = primary;
    for (const fields of definition.uniqueKeys ?? []) {
      const seen = new Set();
      tables[tab].forEach((row, index) => {
        if (!row || fields.some((field) => isBlank(row[field]))) return;
        const key = fields.map((field) => keyValue(row[field], field === "alumno_id")).join("\u001f");
        if (seen.has(key)) issue("duplicate_unique_key", tab, index + 2, fields.join(","));
        else seen.add(key);
      });
    }
  }

  for (const tab of expectedTabs) {
    const definition = SHEETS_MIGRATION_CONTRACT[tab];
    tables[tab].forEach((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      for (const [field, parentTab, parentField, optional] of definition.refs ?? []) {
        if (isBlank(row[field])) {
          if (!optional) issue("foreign_key_missing", tab, index + 2, field);
          continue;
        }
        const parentRows = tables[parentTab] ?? [];
        const parentDefinition = SHEETS_MIGRATION_CONTRACT[parentTab];
        const normalized = keyValue(row[field], parentDefinition?.caseInsensitiveKey && parentField === parentDefinition.primaryKey);
        if (!parentRows.some((parent) => parent && keyValue(parent[parentField], parentDefinition?.caseInsensitiveKey && parentField === parentDefinition.primaryKey) === normalized)) {
          issue("foreign_key_orphan", tab, index + 2, field);
        }
      }
    });
  }

  const byId = (tab, field, value) => (tables[tab] ?? []).find((row) => row && keyValue(row[field], tab === "Registros") === keyValue(value, tab === "Registros"));
  const consistency = (tab, rows, check) => rows.forEach((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    const field = check(row);
    if (field) issue("relationship_mismatch", tab, index + 2, field);
  });
  consistency("ASISTENCIAS", tables.ASISTENCIAS ?? [], (row) => {
    const session = byId("SESIONES_CLASE", "sesion_id", row.sesion_id);
    return session && asText(session.parcial_id) !== asText(row.parcial_id) ? "parcial_id" : "";
  });
  consistency("CALIFICACIONES_TAREAS", tables.CALIFICACIONES_TAREAS ?? [], (row) => {
    const task = byId("TAREAS", "tarea_id", row.tarea_id);
    return task && asText(task.parcial_id) !== asText(row.parcial_id) ? "parcial_id" : "";
  });
  consistency("INTENTOS", tables.INTENTOS ?? [], (row) => {
    const exam = byId("EXAMENES", "examen_id", row.examen_id);
    return exam && asText(exam.parcial_id) !== asText(row.parcial_id) ? "parcial_id" : "";
  });
  consistency("RESPUESTAS", tables.RESPUESTAS ?? [], (row) => {
    const attempt = byId("INTENTOS", "intento_id", row.intento_id);
    const question = byId("REACTIVOS", "reactivo_id", row.reactivo_id);
    if (attempt && keyValue(attempt.alumno_id, true) !== keyValue(row.alumno_id, true)) return "alumno_id";
    if (attempt && question && asText(attempt.examen_id) !== asText(question.examen_id)) return "reactivo_id";
    return "";
  });
  consistency("EVALUACION_AI", tables.EVALUACION_AI ?? [], (row) => {
    const attempt = byId("INTENTOS", "intento_id", row.intento_id);
    const question = byId("REACTIVOS", "reactivo_id", row.reactivo_id);
    return attempt && question && asText(attempt.examen_id) !== asText(question.examen_id) ? "reactivo_id" : "";
  });

  if ((counts.EVALUACIONES ?? 0) > 0) warnings.push({ code: "evaluations_semantics_require_review", tab: "EVALUACIONES" });
  const errors = issues.slice(0, 500);
  const truncatedErrors = Math.max(0, issues.length - errors.length);
  return { ok: issues.length === 0, counts, errors, errorCount: issues.length, truncatedErrors, warnings };
}
