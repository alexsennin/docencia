import assert from "node:assert/strict";
import test from "node:test";
import { parseGeminiRubricCandidate } from "../lib/ca-rubric-postgres.ts";

test("lee únicamente el JSON de salida y omite partes de pensamiento", () => {
  const parsed = parseGeminiRubricCandidate({
    finishReason: "STOP",
    content: { parts: [
      { thought: true, text: "parte interna que no forma parte de la salida" },
      { text: '{"criterios":[' },
      { text: "1,2,3,4,5]}" },
    ] },
  }, "modelo-de-prueba");

  assert.deepEqual(parsed, { data: { criterios: [1, 2, 3, 4, 5] }, model: "modelo-de-prueba" });
});

test("detecta respuestas truncadas antes de intentar interpretarlas", () => {
  assert.throws(
    () => parseGeminiRubricCandidate({ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }, "modelo-de-prueba"),
    /truncó la respuesta/,
  );
});
