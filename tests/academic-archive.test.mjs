import assert from "node:assert/strict";
import test from "node:test";
import { listArchivedAcademicItems } from "../lib/academic-archive.ts";

test("lista sesiones canceladas y actividades inactivas de todos los parciales", () => {
  const archived = listArchivedAcademicItems({
    partials: [{ parcial_id: "p1", nombre: "Primer parcial" }, { parcial_id: "p2", nombre: "Segundo parcial" }],
    sessions: [
      { sesion_id: "s1", parcial_id: "p1", fecha_clase: "2026-09-10", grupo: "1 A", tema: "Lectura", estado: "Cancelada", updated_at: "2026-09-11T12:00:00.000Z" },
      { sesion_id: "s2", parcial_id: "p1", fecha_clase: "2026-09-12", grupo: "1 A", estado: "Realizada" },
    ],
    tasks: [
      { tarea_id: "t1", parcial_id: "p2", fecha_asignacion: "2026-09-15", grupo: "2 B", nombre: "Ensayo", tipo: "Tarea", activa: false, updated_at: "2026-09-16T12:00:00.000Z" },
      { tarea_id: "t2", parcial_id: "p2", grupo: "2 B", nombre: "Cartel", tipo: "Trabajo en clase", activa: "FALSE", updated_at: "2026-09-14T12:00:00.000Z" },
      { tarea_id: "t3", parcial_id: "p2", grupo: "2 B", nombre: "Actividad activa", tipo: "Tarea", activa: true },
    ],
  });

  assert.deepEqual(archived.map((item) => item.id), ["task:t1", "task:t2", "session:s1"]);
  assert.deepEqual(archived.map((item) => item.type), ["Tarea", "Trabajo en clase", "Sesión"]);
  assert.equal(archived[0].partialName, "Segundo parcial");
  assert.equal(archived[2].name, "Lectura");
  assert.equal(archived.length, 3, "no debe listar sesiones ni actividades activas");
});
