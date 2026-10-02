import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:13000";

async function post(path, body) {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("Postgres devuelve sólo exámenes publicados del grupo o asignados al alumno", async () => {
  const response = await post("/api/access", { credential: "SYNTH-001" });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(data.role, "student");
  assert.equal(data.source, "postgres");
  assert.deepEqual(
    data.exams.map((exam) => exam.id).sort(),
    ["SYNTH-EXAM-001", "SYNTH-EXAM-ASSIGNED"].sort(),
  );

  const sameGroupExam = data.exams.find((exam) => exam.id === "SYNTH-EXAM-001");
  assert.equal(sameGroupExam.attemptStatus, "Enviado");
  assert.equal(sameGroupExam.questions.length, 1);
  assert.equal("correctAnswer" in sameGroupExam.questions[0], false);
  assert.equal("rubric" in sameGroupExam.questions[0], false);
});

test("el lookup directo conserva errores de entrada y protege datos del alumno con no-store", async () => {
  const found = await post("/api/student/lookup", { studentId: "SYNTH-001" });
  const foundData = await found.json();
  assert.equal(found.status, 200);
  assert.equal(found.headers.get("cache-control"), "no-store");
  assert.equal(foundData.source, "postgres");
  assert.equal(foundData.student.id, "SYNTH-001");

  const missing = await post("/api/access", { credential: "NO-EXISTE" });
  assert.equal(missing.status, 401);
  const empty = await post("/api/access", { credential: " " });
  assert.equal(empty.status, 400);
});

test("avance académico Postgres calcula el periodo y sólo entrega retroalimentación visible", async () => {
  const response = await fetch(new URL("/api/student/academic?studentId=SYNTH-001", baseUrl));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(data.source, "postgres");
  assert.equal(data.student.id, "SYNTH-001");
  const syntheticPartial = data.matrix.find((row) => row.partialId === "SYNTH-P1");
  assert.ok(syntheticPartial, "la consulta debe conservar el resultado del parcial sintético aunque existan parciales importados");
  assert.equal(syntheticPartial.days, 1);
  assert.equal(syntheticPartial.absences, 1);
  assert.equal(syntheticPartial.ec, 90);
  assert.ok(data.reports.some((report) => report.summary === "Reporte ficticio visible"), "debe incluir el reporte visible de prueba entre los reportes importados");
});
