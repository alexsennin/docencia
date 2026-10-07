import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseStudentRosterWorkbook } from "../lib/student-roster-file.ts";

function workbookFor(sheet, name = "Alumnos") {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, name);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

function rowsWorkbook(rows, sheetName = "Alumnos") {
  return workbookFor(XLSX.utils.aoa_to_sheet(rows), sheetName);
}

test("lee la plantilla de tres columnas y conserva filas y texto de ID", () => {
  const buffer = rowsWorkbook([
    ["ID", "Nombre alumno", "Grupo y grado"],
    ["00123", "Alumna sintética", "1o A Sec, SECUNDARIA"],
  ]);
  assert.deepEqual(parseStudentRosterWorkbook(buffer), [{ rowNumber: 2, id: "00123", name: "Alumna sintética", groupAndGrade: "1o A Sec, SECUNDARIA" }]);
});

test("acepta el encabezado escrito como Nombre alumbo y usa la primera hoja disponible", () => {
  const buffer = rowsWorkbook([
    ["id", "Nombre alumbo", "Grupo y grado"],
    ["PAD-SYNTH-2", "Alumno sintético", "1o A Sec, SECUNDARIA"],
  ], "Hoja 1");
  assert.equal(parseStudentRosterWorkbook(buffer)[0].id, "PAD-SYNTH-2");
});

test("rechaza encabezados incompletos y filas fuera de las tres columnas", () => {
  assert.throws(() => parseStudentRosterWorkbook(rowsWorkbook([["ID", "Nombre", "Grupo y grado"], ["A-1", "Nombre", "1o A Sec, SECUNDARIA"]])), /primera fila/);
  assert.throws(() => parseStudentRosterWorkbook(rowsWorkbook([["ID", "Nombre alumno", "Grupo y grado", "Extra"], ["A-1", "Nombre", "1o A Sec, SECUNDARIA", "dato"]])), /sólo las tres columnas/);
});

test("rechaza fórmulas y encabezados que no comienzan en A1", () => {
  const formulaSheet = XLSX.utils.aoa_to_sheet([["ID", "Nombre alumno", "Grupo y grado"], ["A-1", "Nombre", "1o A Sec, SECUNDARIA"]]);
  formulaSheet.C2 = { t: "s", f: "CONCATENATE(\"1o A Sec, \",\"SECUNDARIA\")", v: "1o A Sec, SECUNDARIA" };
  assert.throws(() => parseStudentRosterWorkbook(workbookFor(formulaSheet)), /fórmulas/);

  const shifted = {
    "!ref": "B1:D1",
    B1: { t: "s", v: "ID" },
    C1: { t: "s", v: "Nombre alumno" },
    D1: { t: "s", v: "Grupo y grado" },
  };
  assert.throws(() => parseStudentRosterWorkbook(workbookFor(shifted)), /celda A1/);
});
