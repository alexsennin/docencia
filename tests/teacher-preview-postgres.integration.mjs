import assert from "node:assert/strict";
import test, { after } from "node:test";
import { eq } from "drizzle-orm";
import { closeDatabaseForTests, getDatabase } from "../db/client.ts";
import { examAttempts } from "../db/schema.ts";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:13000";
const examId = "exam-1-esp-1";

async function post(path, body, cookie) {
  return fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

after(async () => closeDatabaseForTests());

test("vista docente Postgres usa el examen de demostración local sin leer Sheets ni crear intentos", async () => {
  const db = getDatabase();
  const before = await db.select().from(examAttempts).where(eq(examAttempts.studentId, "docente"));

  const unauthorized = await fetch(new URL(`/api/teacher/preview?examId=${examId}`, baseUrl));
  assert.equal(unauthorized.status, 401);

  const password = process.env.TEST_TEACHER_PASSWORD;
  assert.ok(password, "configura TEST_TEACHER_PASSWORD para autenticar el recorrido local");
  const login = await post("/api/teacher/login", { password });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);

  const response = await fetch(new URL(`/api/teacher/preview?examId=${examId}`, baseUrl), { headers: { cookie } });
  const loaded = await response.json();
  assert.equal(response.status, 200, JSON.stringify(loaded));
  assert.equal(loaded.exam.id, examId);
  assert.equal(loaded.exam.name, "Cazadores de Greenwashing");
  assert.ok(loaded.exam.questions.length > 0);
  for (const question of loaded.exam.questions) {
    assert.equal("correctAnswer" in question, false);
    assert.equal("rubric" in question, false);
  }

  const evaluatedResponse = await post("/api/teacher/preview", { examId, answers: { "ex1-q1": "B" } }, cookie);
  const evaluated = await evaluatedResponse.json();
  assert.equal(evaluatedResponse.status, 200, JSON.stringify(evaluated));
  assert.equal(evaluated.preview, true);
  assert.equal(evaluated.result.items.find((item) => item.questionId === "ex1-q1")?.score, 5);
  assert.equal(evaluated.result.grade10, 0.5);

  const afterPreview = await db.select().from(examAttempts).where(eq(examAttempts.studentId, "docente"));
  assert.deepEqual(afterPreview, before, "la vista de prueba no debe crear intentos persistidos");
});
