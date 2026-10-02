import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileSheetsSnapshot, SHEETS_MIGRATION_CONTRACT } from "../lib/sheets-snapshot-reconcile.mjs";

const emptySnapshot = () => ({
  headers: Object.fromEntries(Object.entries(SHEETS_MIGRATION_CONTRACT).map(([tab, definition]) => [tab, [...definition.headers]])),
  tabs: Object.fromEntries(Object.keys(SHEETS_MIGRATION_CONTRACT).map((tab) => [tab, []])),
});

const row = (tab, values = {}) => {
  const result = Object.fromEntries(SHEETS_MIGRATION_CONTRACT[tab].headers.map((field) => [field, ""]));
  Object.assign(result, values);
  return result;
};

const baseSnapshot = () => {
  const snapshot = emptySnapshot();
  snapshot.tabs.Registros.push(row("Registros", { id: "ST-001", nombre: "Alumno Ficticio", grupo: "1A" }));
  snapshot.tabs.PARCIALES.push(row("PARCIALES", { parcial_id: "P-001", orden: 1, peso_conducta: 10, fecha_inicio: "2026-09-01" }));
  snapshot.tabs.SESIONES_CLASE.push(row("SESIONES_CLASE", { sesion_id: "S-001", parcial_id: "P-001", fecha_clase: "2026-09-10" }));
  snapshot.tabs.ASISTENCIAS.push(row("ASISTENCIAS", { asistencia_id: "A-001", sesion_id: "S-001", parcial_id: "P-001", alumno_id: "st-001", estado: "P" }));
  snapshot.tabs.TAREAS.push(row("TAREAS", { tarea_id: "T-001", parcial_id: "P-001", sesion_id: "S-001", nombre: "Trabajo ficticio" }));
  snapshot.tabs.CALIFICACIONES_TAREAS.push(row("CALIFICACIONES_TAREAS", { registro_id: "CT-001", tarea_id: "T-001", parcial_id: "P-001", alumno_id: "ST-001", grupo: "1A" }));
  return snapshot;
};

test("accepts a complete empty export and reports only aggregate counts", () => {
  const result = reconcileSheetsSnapshot(emptySnapshot());
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result.counts).length, 20);
  assert.deepEqual(result.errors, []);
});

test("accepts a valid synthetic reference graph, including populated optional references", () => {
  const result = reconcileSheetsSnapshot(baseSnapshot());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.counts.ASISTENCIAS, 1);
});

test("finds duplicate keys, orphan optional references, and cross-table period mismatches without exposing row values", () => {
  const snapshot = baseSnapshot();
  snapshot.tabs.Registros.push(row("Registros", { id: "st-001", nombre: "Dato Privado Ficticio" }));
  snapshot.tabs.TAREAS[0].sesion_calificacion_id = "SESION-INEXISTENTE";
  snapshot.tabs.CALIFICACIONES_TAREAS[0].parcial_id = "P-OTRO";
  const result = reconcileSheetsSnapshot(snapshot);
  const codes = result.errors.map((entry) => entry.code);
  assert.ok(codes.includes("duplicate_primary_key"));
  assert.ok(codes.includes("foreign_key_orphan"));
  assert.ok(codes.includes("relationship_mismatch"));
  assert.equal(JSON.stringify(result).includes("Dato Privado Ficticio"), false);
  assert.equal(JSON.stringify(result).includes("ST-001"), false);
});

test("validates field types, missing headers, and date formats", () => {
  const snapshot = baseSnapshot();
  snapshot.tabs.PARCIALES[0].fecha_inicio = "01/09/2026";
  snapshot.tabs.PARCIALES[0].orden = "primero";
  delete snapshot.tabs.PARCIALES[0].peso_actitud;
  const result = reconcileSheetsSnapshot(snapshot);
  assert.ok(result.errors.some((entry) => entry.code === "date_not_iso" && entry.field === "fecha_inicio"));
  assert.ok(result.errors.some((entry) => entry.code === "invalid_integer" && entry.field === "orden"));
  assert.ok(result.errors.some((entry) => entry.code === "row_missing_header_field" && entry.field === "peso_actitud"));
});

test("warns about unmapped schema and EVALUACIONES data for manual semantic review", () => {
  const snapshot = baseSnapshot();
  snapshot.headers.CONFIG.push("columna_nueva");
  snapshot.tabs.TabNueva = [];
  snapshot.tabs.EVALUACIONES.push(row("EVALUACIONES", { evaluacion_id: "EV-001", parcial_id: "P-001", alumno_id: "ST-001" }));
  const result = reconcileSheetsSnapshot(snapshot);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((entry) => entry.code === "unmapped_tab"));
  assert.ok(result.warnings.some((entry) => entry.code === "unmapped_header"));
  assert.ok(result.warnings.some((entry) => entry.code === "evaluations_semantics_require_review"));
});
