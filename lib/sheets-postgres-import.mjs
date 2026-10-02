import { isDeepStrictEqual } from "node:util";
import {
  SHEETS_MIGRATION_CONTRACT,
  SHEETS_TARGET_ONLY_COLUMNS,
  SHEETS_TARGET_TABLES,
  reconcileSheetsSnapshot,
} from "./sheets-snapshot-reconcile.mjs";

export const SHEETS_IMPORT_ORDER = [
  "Registros", "PARCIALES", "CONFIG", "SESIONES_CLASE", "TAREAS", "CALIFICACIONES_TAREAS",
  "ASISTENCIAS", "CONDUCTA_ACTITUD", "EXAMENES", "REACTIVOS", "EXAMEN_ASIGNACIONES",
  "INTENTOS", "RESPUESTAS", "EVALUACION_AI", "CALIFICACIONES", "REPORTES_AI", "INNOVAT_SALIDA",
  "EVENTOS", "ACCESOS", "EVALUACIONES",
];

const tableDefinitions = {
  Registros: { key: "id", text: ["id", "nombre", "nivel", "grado", "grupo", "ciclo_escolar", "asignacion", "hoja_origen"] },
  PARCIALES: { key: "parcial_id", text: ["parcial_id", "nombre", "ciclo_escolar", "materia", "estado", "modo_evaluacion_continua"], ints: ["orden"], dates: ["fecha_inicio", "fecha_cierre"], timestamps: ["created_at", "updated_at"], numbers: ["peso_asistencias", "peso_trabajos_clase", "peso_tareas", "peso_evaluacion_continua", "peso_conducta", "peso_actitud", "peso_examen", "ponderacion_total"] },
  EVALUACIONES: { key: "evaluacion_id", text: ["evaluacion_id", "parcial_id", "alumno_id", "grupo", "estado", "comentario_docente", "reporte_ai_estado", "innovat_estado"], timestamps: ["updated_at"], numbers: ["dias_clase", "faltas", "tareas_faltantes", "evaluacion_continua", "conducta", "actitud", "examen", "calificacion_parcial"] },
  TAREAS: { key: "tarea_id", text: ["tarea_id", "parcial_id", "grupo", "nombre", "tipo", "sesion_id", "descripcion", "estado_banco", "sesion_calificacion_id"], dates: ["fecha_asignacion", "fecha_entrega"], timestamps: ["created_at", "updated_at"], numbers: ["puntaje_maximo", "peso_ec"], booleans: ["obligatoria", "activa"] },
  CALIFICACIONES_TAREAS: { key: "registro_id", text: ["registro_id", "tarea_id", "parcial_id", "alumno_id", "grupo", "estado", "observaciones", "sesion_calificacion_id"], dates: ["fecha_entrega"], timestamps: ["updated_at"], numbers: ["puntaje"], booleans: ["entregada"] },
  CONFIG: { key: "clave", text: ["clave", "valor", "descripcion"], timestamps: ["updated_at"], booleans: ["editable"] },
  SESIONES_CLASE: { key: "sesion_id", text: ["sesion_id", "parcial_id", "grupo", "materia", "tema", "estado", "observaciones", "registrado_por", "estado_captura"], dates: ["fecha_clase"], timestamps: ["created_at", "updated_at"], booleans: ["pase_lista_completo"] },
  ASISTENCIAS: { key: "asistencia_id", text: ["asistencia_id", "sesion_id", "parcial_id", "alumno_id", "grupo", "estado", "observaciones", "registrado_por"], dates: ["fecha_clase"], timestamps: ["created_at", "updated_at"] },
  CONDUCTA_ACTITUD: { key: "registro_id", text: ["registro_id", "parcial_id", "alumno_id", "grupo", "tipo", "observacion", "infraccion", "rubrica_version", "estado", "registrado_por", "rubrica_modelo", "rubrica_fuente_hash", "evaluacion_ia_estado", "evaluacion_ia_justificacion", "evaluacion_ia_prompt_version"], dates: ["fecha"], timestamps: ["created_at", "updated_at"], numbers: ["puntuacion", "evaluacion_ia_puntaje_sugerido"], json: ["rubrica_criterios_json", "rubrica_propuesta_json", "rubrica_evidencias_json"] },
  EXAMENES: { key: "examen_id", text: ["examen_id", "parcial_id", "nombre", "materia", "grado", "grupo", "estado", "instrucciones", "examen_origen_id", "proveedor_ia"], timestamps: ["fecha_apertura", "fecha_cierre", "created_at", "updated_at"], ints: ["duracion_minutos", "version"], numbers: ["puntaje_maximo"], booleans: ["requiere_pantalla_completa"] },
  REACTIVOS: { key: "reactivo_id", text: ["reactivo_id", "examen_id", "tema", "tipo", "consigna", "metodo_evaluacion", "rubrica"], ints: ["orden"], numbers: ["puntaje_maximo"], timestamps: ["created_at", "updated_at"], booleans: ["activo"], json: ["opciones_json", "respuesta_correcta"] },
  EXAMEN_ASIGNACIONES: { key: "asignacion_id", text: ["asignacion_id", "alumno_id", "examen_id", "estado"], timestamps: ["created_at", "updated_at"] },
  INTENTOS: { key: "intento_id", text: ["intento_id", "examen_id", "parcial_id", "alumno_id", "grupo", "estado"], timestamps: ["inicio_at", "fin_at", "created_at", "updated_at"], numbers: ["tiempo_limite_min", "puntaje_automatico", "puntaje_ai", "puntaje_total", "calificacion_10"], booleans: ["ai_pendiente", "bloqueo_activo"] },
  RESPUESTAS: { key: "respuesta_id", text: ["respuesta_id", "intento_id", "reactivo_id", "alumno_id", "respuesta", "estado_respuesta", "metodo_evaluacion", "retroalimentacion", "ai_estado"], timestamps: ["updated_at"], numbers: ["puntaje_obtenido"] },
  EVALUACION_AI: { key: "evaluacion_ai_id", text: ["evaluacion_ai_id", "intento_id", "reactivo_id", "modelo", "prompt_version", "estado", "retroalimentacion", "error"], timestamps: ["ejecutado_at", "aprobado_at"], numbers: ["puntaje"], json: ["entrada_json", "desglose_json"] },
  CALIFICACIONES: { key: "calificacion_id", text: ["calificacion_id", "parcial_id", "alumno_id", "grupo", "estado", "comentario_docente", "reporte_ai_estado", "innovat_estado", "modo_evaluacion_continua", "version_calculo"], timestamps: ["updated_at"], numbers: ["dias_clase", "faltas", "tareas_faltantes", "evaluacion_continua", "conducta", "actitud", "examen", "calificacion_parcial", "calificacion_10", "calificacion_ca"], json: ["detalle_ec_json"] },
  REPORTES_AI: { key: "reporte_id", text: ["reporte_id", "parcial_id", "alumno_id", "tipo", "estado", "resumen", "fortalezas", "areas_oportunidad", "revisado_por"], timestamps: ["revisado_at", "created_at", "updated_at"], booleans: ["visibilidad_alumno"], json: ["recomendaciones_json", "evidencias_json"] },
  INNOVAT_SALIDA: { key: "export_id", text: ["export_id", "parcial_id", "alumno_id", "grupo", "estado", "respuesta_innovat", "error"], timestamps: ["enviado_at", "updated_at"], ints: ["intentos_envio"], json: ["payload_json"] },
  EVENTOS: { key: "evento_id", text: ["evento_id", "tipo", "entidad", "entidad_id", "parcial_id", "alumno_id", "actor_id"], timestamps: ["ocurrido_at"], json: ["detalle_json"] },
  ACCESOS: { key: "acceso_id", text: ["acceso_id", "rol", "alumno_id", "usuario_login", "estado"], timestamps: ["ultimo_acceso", "created_at", "updated_at"], booleans: ["debe_cambiar_credencial"] },
};

const asNormalizedText = (value) => String(value ?? "").trim().toLocaleLowerCase("es-MX");
const boolValues = new Map([["true", true], ["1", true], ["si", true], ["sí", true], ["yes", true], ["false", false], ["0", false], ["no", false]]);
const SHEETS_EPOCH = Date.UTC(1899, 11, 30);

function sheetSerialParts(serial) {
  if (!Number.isFinite(serial)) throw new Error("invalid_datetime");
  const milliseconds = Math.round(serial * 86_400_000);
  const date = new Date(SHEETS_EPOCH + milliseconds);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_datetime");
  return {
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(),
  };
}

function localDateParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map(({ type, value: partValue }) => [type, Number(partValue)]));
}

function timeZoneOffsetMinutes(parts, timeZone) {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0);
  const zoned = new Date(utcGuess);
  const rendered = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(zoned);
  const parsed = Object.fromEntries(rendered.filter((part) => part.type !== "literal").map(({ type, value }) => [type, Number(value)]));
  return Math.round((Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second) - utcGuess) / 60_000);
}

const formatDateParts = ({ year, month, day }) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

function normalizeSheetDate(value, timeZone) {
  if (typeof value === "number") return formatDateParts(sheetSerialParts(value));
  if (typeof value !== "string") return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value))) return formatDateParts(localDateParts(value, timeZone));
  return value;
}

function normalizeSheetTimestamp(value, timeZone) {
  if (typeof value === "number") {
    const parts = sheetSerialParts(value);
    const offset = timeZoneOffsetMinutes(parts, timeZone);
    const sign = offset < 0 ? "-" : "+";
    const absoluteOffset = Math.abs(offset);
    return `${formatDateParts(parts)}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:${String(parts.second).padStart(2, "0")}${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, "0")}:${String(absoluteOffset % 60).padStart(2, "0")}`;
  }
  if (typeof value !== "string") return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = { ...Object.fromEntries(value.split("-").map((part, index) => [["year", "month", "day"][index], Number(part)])), hour: 0, minute: 0, second: 0 };
    const offset = timeZoneOffsetMinutes(parts, timeZone);
    const sign = offset < 0 ? "-" : "+";
    const absoluteOffset = Math.abs(offset);
    return `${value}T00:00:00${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, "0")}:${String(absoluteOffset % 60).padStart(2, "0")}`;
  }
  return value;
}

export function normalizeSheetsSnapshot(snapshot, timeZone = "America/Mexico_City") {
  if (!snapshot?.tabs || typeof snapshot.tabs !== "object") return snapshot;
  const tabs = Object.fromEntries(Object.entries(snapshot.tabs).map(([tab, rows]) => {
    const definition = tableDefinitions[tab];
    if (!definition || !Array.isArray(rows)) return [tab, rows];
    const normalizedRows = rows.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      const normalized = { ...row };
      for (const field of definition.dates ?? []) if (normalized[field] !== "" && normalized[field] != null) normalized[field] = normalizeSheetDate(normalized[field], timeZone);
      for (const field of definition.timestamps ?? []) if (normalized[field] !== "" && normalized[field] != null) normalized[field] = normalizeSheetTimestamp(normalized[field], timeZone);
      return normalized;
    });
    return [tab, normalizedRows];
  }));
  return { ...snapshot, tabs };
}

function normalizeValue(tab, field, value) {
  const definition = tableDefinitions[tab];
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    return [...(definition.numbers ?? []), ...(definition.ints ?? []), ...(definition.booleans ?? []), ...(definition.dates ?? []), ...(definition.timestamps ?? []), ...(definition.json ?? [])].includes(field) ? null : value ?? "";
  }
  if ((definition.numbers ?? []).includes(field) || (definition.ints ?? []).includes(field)) {
    const parsed = Number(String(value).replaceAll(",", "").trim());
    if (!Number.isFinite(parsed)) throw new Error("invalid_number");
    return parsed;
  }
  if ((definition.booleans ?? []).includes(field)) {
    if (typeof value === "boolean") return value;
    const parsed = boolValues.get(asNormalizedText(value));
    if (parsed === undefined) throw new Error("invalid_boolean");
    return parsed;
  }
  if ((definition.json ?? []).includes(field)) {
    if (typeof value !== "string") return value;
    if (tab === "REACTIVOS" && field === "respuesta_correcta" && !/^[\[{\"]/.test(value.trim())) return value;
    return JSON.parse(value);
  }
  return value;
}

export function prepareSheetsImport(sourceSnapshot, { skipEvaluaciones = false, timeZone = "America/Mexico_City" } = {}) {
  const snapshot = normalizeSheetsSnapshot(sourceSnapshot, timeZone);
  const validation = reconcileSheetsSnapshot(snapshot);
  if (!validation.ok) return { ok: false, errors: validation.errors, warnings: validation.warnings, counts: validation.counts };
  if (validation.warnings.some((warning) => warning.code === "unmapped_header" || warning.code === "unmapped_tab")) {
    return { ok: false, errors: [{ code: "unmapped_source_schema" }], warnings: validation.warnings, counts: validation.counts };
  }
  if (validation.counts.EVALUACIONES > 0 && !skipEvaluaciones) {
    return { ok: false, errors: [{ code: "evaluaciones_review_required" }], warnings: validation.warnings, counts: validation.counts };
  }

  const rowsByTab = {};
  const canonicalStudents = new Map(snapshot.tabs.Registros.map((row) => [String(row.id).trim().toUpperCase(), row.id]));
  for (const tab of SHEETS_IMPORT_ORDER) {
    if (tab === "EVALUACIONES" && skipEvaluaciones) {
      rowsByTab[tab] = [];
      continue;
    }
    try {
      rowsByTab[tab] = snapshot.tabs[tab].map((sourceRow) => {
        const targetRow = Object.fromEntries(
          SHEETS_MIGRATION_CONTRACT[tab].headers.map((field) => [field, normalizeValue(tab, field, sourceRow[field])]),
        );
        for (const [field, parentTab, parentField, optional] of SHEETS_MIGRATION_CONTRACT[tab].refs ?? []) {
          if (optional && (targetRow[field] == null || (typeof targetRow[field] === "string" && !targetRow[field].trim()))) {
            targetRow[field] = null;
            continue;
          }
          const parentDefinition = SHEETS_MIGRATION_CONTRACT[parentTab];
          if (parentDefinition?.caseInsensitiveKey && parentField === parentDefinition.primaryKey && targetRow[field]) {
            targetRow[field] = canonicalStudents.get(String(targetRow[field]).trim().toUpperCase());
          }
        }
        return targetRow;
      });
    } catch (error) {
      const reason = ["invalid_number", "invalid_boolean", "invalid_datetime"].includes(error?.message) ? error.message : "invalid_json";
      return { ok: false, errors: [{ code: reason, tab }], warnings: validation.warnings, counts: validation.counts };
    }
  }
  return {
    ok: true,
    counts: validation.counts,
    skipped: skipEvaluaciones ? { EVALUACIONES: validation.counts.EVALUACIONES } : {},
    warnings: validation.warnings,
    rowsByTab,
  };
}

export async function importPreparedSheetsSnapshot(client, prepared) {
  if (!prepared?.ok || !prepared.rowsByTab) throw new Error("import_plan_invalid");
  const inserted = {};
  const unchanged = {};
  let currentTab = "";
  await client.query("BEGIN");
  try {
    for (const tab of SHEETS_IMPORT_ORDER) {
      currentTab = tab;
      const rows = prepared.rowsByTab[tab] ?? [];
      const table = SHEETS_TARGET_TABLES[tab];
      const primaryKey = tableDefinitions[tab].key;
      inserted[tab] = 0;
      unchanged[tab] = 0;
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
        const jsonColumns = tableDefinitions[tab].json ?? [];
        const values = columns.map((column) => jsonColumns.includes(column) && row[column] != null ? JSON.stringify(row[column]) : row[column]);
        const insert = await client.query(
          `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders}) ON CONFLICT ("${primaryKey}") DO NOTHING RETURNING "${primaryKey}"`,
          values,
        );
        if (insert.rowCount) {
          inserted[tab] += 1;
          continue;
        }
        const current = await client.query(`SELECT ${columns.map((column) => `"${column}"`).join(", ")} FROM "${table}" WHERE "${primaryKey}" = $1`, [row[primaryKey]]);
        const matchesColumn = (column) => {
          const existing = current.rows[0][column];
          const incoming = row[column];
          if ([...(tableDefinitions[tab].numbers ?? []), ...(tableDefinitions[tab].ints ?? [])].includes(column)) {
            if (existing == null || incoming == null) return existing == null && incoming == null;
            return Number(existing) === Number(incoming);
          }
          if (existing instanceof Date) {
            if (typeof incoming === "string" && /^\d{4}-\d{2}-\d{2}$/.test(incoming)) {
              const localDate = `${existing.getFullYear()}-${String(existing.getMonth() + 1).padStart(2, "0")}-${String(existing.getDate()).padStart(2, "0")}`;
              return localDate === incoming;
            }
            return existing.toISOString() === new Date(incoming).toISOString();
          }
          if (existing && typeof existing === "object") return isDeepStrictEqual(existing, incoming);
          return existing === incoming || (existing != null && incoming != null && String(existing) === String(incoming));
        };
        const mismatchField = current.rowCount === 1 ? columns.find((column) => !matchesColumn(column)) : primaryKey;
        if (mismatchField) throw Object.assign(new Error("conflicting_existing_record"), { code: "conflicting_existing_record", table: tab, field: mismatchField });
        unchanged[tab] += 1;
      }
    }
    await client.query("COMMIT");
    return { ok: true, inserted, unchanged, skipped: prepared.skipped ?? {} };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error?.code === "conflicting_existing_record") return { ok: false, error: "conflicting_existing_record", table: error.table, field: error.field };
    const postgresCodes = {
      "23502": "not_null_violation",
      "23503": "foreign_key_violation",
      "23505": "unique_violation",
      "22P02": "invalid_database_value",
      "22003": "numeric_out_of_range",
      "22007": "invalid_datetime",
    };
    return {
      ok: false,
      error: postgresCodes[error?.code] ?? "database_import_failed",
      ...(typeof error?.code === "string" && /^\d{5}$/.test(error.code) ? { postgresCode: error.code } : {}),
      ...(typeof error?.table === "string" ? { table: error.table } : {}),
      ...(typeof error?.constraint === "string" ? { constraint: error.constraint } : {}),
      ...(currentTab ? { sourceTab: currentTab } : {}),
      ...(error instanceof Error ? { errorType: error.name } : {}),
    };
  }
}

export function isLocalPostgresUrl(connectionString) {
  try {
    const url = new URL(connectionString);
    return ["localhost", "127.0.0.1", "::1", "db"].includes(url.hostname)
      && !url.hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

export const SHEETS_IMPORT_TARGET_ONLY_COLUMNS = SHEETS_TARGET_ONLY_COLUMNS;
