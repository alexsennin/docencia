import assert from "node:assert/strict";
import { test } from "node:test";
import { SHEETS_MIGRATION_CONTRACT } from "../lib/sheets-snapshot-reconcile.mjs";
import { importPreparedSheetsSnapshot, isLocalPostgresUrl, normalizeSheetsSnapshot, prepareSheetsImport } from "../lib/sheets-postgres-import.mjs";

const emptySnapshot = () => ({
  headers: Object.fromEntries(Object.entries(SHEETS_MIGRATION_CONTRACT).map(([tab, definition]) => [tab, [...definition.headers]])),
  tabs: Object.fromEntries(Object.keys(SHEETS_MIGRATION_CONTRACT).map((tab) => [tab, []])),
});

const row = (tab, values = {}) => Object.assign(
  Object.fromEntries(SHEETS_MIGRATION_CONTRACT[tab].headers.map((field) => [field, ""])),
  values,
);

const referencedSnapshot = () => {
  const snapshot = emptySnapshot();
  snapshot.tabs.Registros.push(row("Registros", { id: "ST-001", nombre: "Alumno de prueba", grupo: "1A" }));
  snapshot.tabs.PARCIALES.push(row("PARCIALES", { parcial_id: "P-001", nombre: "Bimestre 1", orden: "1", peso_conducta: "10.00", fecha_inicio: "2026-09-01" }));
  snapshot.tabs.CONFIG.push(row("CONFIG", { clave: "editable", valor: "false", editable: "FALSE" }));
  snapshot.tabs.TAREAS.push(row("TAREAS", { tarea_id: "T-001", parcial_id: "P-001", nombre: "Actividad" }));
  snapshot.tabs.SESIONES_CLASE.push(row("SESIONES_CLASE", { sesion_id: "S-001", parcial_id: "P-001", fecha_clase: "2026-09-10", pase_lista_completo: "0" }));
  snapshot.tabs.ASISTENCIAS.push(row("ASISTENCIAS", { asistencia_id: "A-001", sesion_id: "S-001", parcial_id: "P-001", alumno_id: "st-001", estado: "P" }));
  snapshot.tabs.EVALUACIONES.push(row("EVALUACIONES", { evaluacion_id: "EV-001", parcial_id: "P-001", alumno_id: "ST-001", evaluacion_continua: "8.5" }));
  return snapshot;
};

test("normalizes source scalar values and explicitly skips unresolved EVALUACIONES only when requested", () => {
  const snapshot = referencedSnapshot();
  const blocked = prepareSheetsImport(snapshot);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors[0].code, "evaluaciones_review_required");

  const prepared = prepareSheetsImport(snapshot, { skipEvaluaciones: true });
  assert.equal(prepared.ok, true);
  assert.equal(prepared.rowsByTab.PARCIALES[0].orden, 1);
  assert.equal(prepared.rowsByTab.PARCIALES[0].peso_conducta, 10);
  assert.equal(prepared.rowsByTab.PARCIALES[0].fecha_inicio, "2026-09-01");
  assert.equal(prepared.rowsByTab.CONFIG[0].editable, false);
  assert.equal(prepared.rowsByTab.SESIONES_CLASE[0].pase_lista_completo, false);
  assert.equal(prepared.rowsByTab.TAREAS[0].sesion_id, null);
  assert.equal(prepared.rowsByTab.TAREAS[0].sesion_calificacion_id, null);
  assert.equal(prepared.rowsByTab.ASISTENCIAS[0].alumno_id, "ST-001");
  assert.equal(prepared.rowsByTab.ASISTENCIAS[0].updated_at, null);
  assert.deepEqual(prepared.rowsByTab.EVALUACIONES, []);
  assert.deepEqual(prepared.skipped, { EVALUACIONES: 1 });
});

test("normalizes Google Sheets date and timestamp serials in the sheet timezone", () => {
  const snapshot = emptySnapshot();
  snapshot.tabs.PARCIALES.push(row("PARCIALES", {
    parcial_id: "P-001", fecha_inicio: 46287, created_at: 46287,
  }));
  snapshot.tabs.SESIONES_CLASE.push(row("SESIONES_CLASE", {
    sesion_id: "S-001", parcial_id: "P-001", fecha_clase: 46287, updated_at: "2026-09-22",
  }));
  snapshot.tabs.EVENTOS.push(row("EVENTOS", { evento_id: "E-001", ocurrido_at: 46287.5 }));
  const normalized = normalizeSheetsSnapshot(snapshot);
  assert.equal(normalized.tabs.PARCIALES[0].fecha_inicio, "2026-09-22");
  assert.equal(normalized.tabs.PARCIALES[0].created_at, "2026-09-22T00:00:00-06:00");
  assert.equal(normalized.tabs.SESIONES_CLASE[0].fecha_clase, "2026-09-22");
  assert.equal(normalized.tabs.SESIONES_CLASE[0].updated_at, "2026-09-22T00:00:00-06:00");
  assert.equal(normalized.tabs.EVENTOS[0].ocurrido_at, "2026-09-22T12:00:00-06:00");
  assert.equal(prepareSheetsImport(snapshot).ok, true);
});

test("keeps timestamp calendar dates in Mexico City when converting to date fields", () => {
  const snapshot = emptySnapshot();
  snapshot.tabs.PARCIALES.push(row("PARCIALES", { parcial_id: "P-001", fecha_inicio: "2026-09-22T02:00:00Z" }));
  const normalized = normalizeSheetsSnapshot(snapshot);
  assert.equal(normalized.tabs.PARCIALES[0].fecha_inicio, "2026-09-21");
});

test("preserves legacy plain-text correct answers as JSON string scalars", async () => {
  const snapshot = emptySnapshot();
  snapshot.tabs.PARCIALES.push(row("PARCIALES", { parcial_id: "P-001", nombre: "Parcial" }));
  snapshot.tabs.EXAMENES.push(row("EXAMENES", { examen_id: "EX-001", parcial_id: "P-001", nombre: "Examen" }));
  snapshot.tabs.REACTIVOS.push(row("REACTIVOS", {
    reactivo_id: "Q-001", examen_id: "EX-001", orden: "1", respuesta_correcta: "A", opciones_json: "[\"A\",\"B\"]",
  }));
  const prepared = prepareSheetsImport(snapshot);
  assert.equal(prepared.ok, true, JSON.stringify(prepared.errors));
  assert.equal(prepared.rowsByTab.REACTIVOS[0].respuesta_correcta, "A");

  let questionValues;
  const client = {
    async query(query, values) {
      if (query === "BEGIN" || query === "COMMIT" || query === "ROLLBACK") return { rowCount: null, rows: [] };
      if (query.includes('INSERT INTO "exam_questions"')) questionValues = values;
      return { rowCount: 1, rows: [{}] };
    },
  };
  const result = await importPreparedSheetsSnapshot(client, prepared);
  assert.equal(result.ok, true);
  assert.equal(questionValues[7], "\"A\"");

  const malformed = emptySnapshot();
  malformed.tabs.PARCIALES.push(row("PARCIALES", { parcial_id: "P-001", nombre: "Parcial" }));
  malformed.tabs.EXAMENES.push(row("EXAMENES", { examen_id: "EX-001", parcial_id: "P-001", nombre: "Examen" }));
  malformed.tabs.REACTIVOS.push(row("REACTIVOS", { reactivo_id: "Q-001", examen_id: "EX-001", respuesta_correcta: "[\"A\"" }));
  const invalid = prepareSheetsImport(malformed);
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((entry) => entry.code === "invalid_json" && entry.tab === "REACTIVOS"));
});

test("refuses unknown source fields and invalid local database targets", () => {
  const snapshot = emptySnapshot();
  snapshot.tabs.Registros.push(row("Registros", { id: "ST-001", nombre: "Alumno" , columna_nueva: "valor" }));
  const prepared = prepareSheetsImport(snapshot);
  assert.equal(prepared.ok, false);
  assert.ok(prepared.errors.some((entry) => entry.code === "unmapped_row_field"));

  assert.equal(isLocalPostgresUrl("postgresql://user:pass@127.0.0.1:15432/docencia_dev"), true);
  assert.equal(isLocalPostgresUrl("postgresql://user:pass@db:5432/docencia_dev"), true);
  assert.equal(isLocalPostgresUrl("postgresql://user:pass@ep-example.neon.tech/db"), false);
  assert.equal(isLocalPostgresUrl("not a URL"), false);
});

test("inserts in FK order and commits without exposing source values", async () => {
  const prepared = prepareSheetsImport(referencedSnapshot(), { skipEvaluaciones: true });
  const insertedTables = [];
  const client = {
    async query(query) {
      if (query === "BEGIN" || query === "COMMIT" || query === "ROLLBACK") return { rowCount: null, rows: [] };
      const table = query.match(/INSERT INTO "([^"]+)"/)?.[1];
      if (!table) throw new Error("unexpected_query");
      insertedTables.push(table);
      return { rowCount: 1, rows: [{}] };
    },
  };
  const result = await importPreparedSheetsSnapshot(client, prepared);
  assert.equal(result.ok, true);
  assert.deepEqual(insertedTables, ["students", "academic_periods", "app_config", "class_sessions", "tasks", "attendance"]);
  assert.equal(result.inserted.Registros, 1);
  assert.equal(result.skipped.EVALUACIONES, 1);
  assert.equal(JSON.stringify(result).includes("Alumno de prueba"), false);
});

test("rolls back instead of overwriting a different row with the same primary key", async () => {
  const prepared = prepareSheetsImport(referencedSnapshot(), { skipEvaluaciones: true });
  const statements = [];
  const client = {
    async query(query) {
      statements.push(query);
      if (query === "BEGIN" || query === "COMMIT" || query === "ROLLBACK") return { rowCount: null, rows: [] };
      if (query.startsWith("INSERT INTO \"students\"")) return { rowCount: 0, rows: [] };
      if (query.startsWith("SELECT")) return { rowCount: 1, rows: [{ id: "ST-001", nombre: "Registro distinto", nivel: "", grado: "", grupo: "1A", ciclo_escolar: "", asignacion: "", hoja_origen: "" }] };
      throw new Error("unexpected_query");
    },
  };
  const result = await importPreparedSheetsSnapshot(client, prepared);
  assert.deepEqual(result, { ok: false, error: "conflicting_existing_record", table: "Registros", field: "nombre" });
  assert.ok(statements.includes("ROLLBACK"));
  assert.ok(!statements.includes("COMMIT"));
  assert.equal(JSON.stringify(result).includes("ST-001"), false);
});
