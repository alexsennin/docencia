import assert from "node:assert/strict";
import test from "node:test";
import { getDataBackend } from "../lib/data-backend.ts";

const keys = ["DATA_BACKEND", "NODE_ENV", "VERCEL_ENV", "POSTGRES_PRODUCTION_CUTOVER_APPROVED"];

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, values);
  try {
    return callback();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("Sheets sigue siendo el backend predeterminado", () => {
  withEnvironment({}, () => assert.equal(getDataBackend(), "sheets"));
});

test("PostgreSQL sigue disponible para Docker/local", () => {
  withEnvironment({ DATA_BACKEND: "postgres", NODE_ENV: "development" }, () => {
    assert.equal(getDataBackend(), "postgres");
  });
});

test("next start local puede usar PostgreSQL aunque NODE_ENV sea production", () => {
  withEnvironment({ DATA_BACKEND: "postgres", NODE_ENV: "production" }, () => {
    assert.equal(getDataBackend(), "postgres");
  });
});

test("un deployment Preview de Vercel puede usar PostgreSQL de ensayo", () => {
  withEnvironment({ DATA_BACKEND: "postgres", NODE_ENV: "production", VERCEL_ENV: "preview" }, () => {
    assert.equal(getDataBackend(), "postgres");
  });
});

test("rechaza PostgreSQL en Producción hasta aprobar explícitamente el corte", () => {
  withEnvironment({ DATA_BACKEND: "postgres", NODE_ENV: "production", VERCEL_ENV: "production" }, () => {
    assert.throws(getDataBackend, /POSTGRES_PRODUCTION_CUTOVER_APPROVED=YES/);
  });
});

test("permite PostgreSQL en Producción sólo con la aprobación explícita", () => {
  withEnvironment({
    DATA_BACKEND: "postgres",
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    POSTGRES_PRODUCTION_CUTOVER_APPROVED: "YES",
  }, () => assert.equal(getDataBackend(), "postgres"));
});

test("rechaza nombres de backend no reconocidos", () => {
  withEnvironment({ DATA_BACKEND: "neon", NODE_ENV: "development" }, () => {
    assert.throws(getDataBackend, /DATA_BACKEND debe ser/);
  });
});
