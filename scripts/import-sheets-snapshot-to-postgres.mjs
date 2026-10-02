import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { importPreparedSheetsSnapshot, isLocalPostgresUrl, prepareSheetsImport } from "../lib/sheets-postgres-import.mjs";

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : "";
const applyLocal = args.includes("--apply-local");
const dryRun = args.includes("--dry-run");
const skipEvaluaciones = args.includes("--skip-evaluaciones");
const knownFlags = new Set(["--input", inputPath, "--apply-local", "--dry-run", "--skip-evaluaciones"]);
const unknownArgument = args.some((argument, index) => !knownFlags.has(argument) || (argument === "--input" && index !== inputIndex));

if (!inputPath || unknownArgument || (applyLocal && dryRun)) {
  process.stdout.write(`${JSON.stringify({ ok: false, errors: [{ code: "usage", field: "--input" }] })}\n`);
  process.exitCode = 2;
} else {
  let snapshot;
  let inputRead = false;
  try {
    snapshot = JSON.parse(await readFile(inputPath, "utf8"));
    inputRead = true;
  } catch {
    process.stdout.write(`${JSON.stringify({ ok: false, errors: [{ code: "input_unreadable_or_invalid_json" }] })}\n`);
    process.exitCode = 2;
  }

  if (inputRead) {
    const prepared = prepareSheetsImport(snapshot, { skipEvaluaciones });
    if (!prepared.ok) {
      process.stdout.write(`${JSON.stringify({ ok: false, counts: prepared.counts ?? {}, errors: prepared.errors, warnings: prepared.warnings })}\n`);
      process.exitCode = 2;
    } else if (!applyLocal || dryRun) {
      const summary = { ok: prepared.ok, counts: prepared.counts, skipped: prepared.skipped, warnings: prepared.warnings };
      process.stdout.write(`${JSON.stringify({ ...summary, ok: true, mode: "dry-run", target: "none" })}\n`);
    } else if (!isLocalPostgresUrl(process.env.DATABASE_URL)) {
      process.stdout.write(`${JSON.stringify({ ok: false, errors: [{ code: "local_database_url_required" }] })}\n`);
      process.exitCode = 2;
    } else {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000 });
      let client;
      try {
        client = await pool.connect();
        const result = await importPreparedSheetsSnapshot(client, prepared);
        process.stdout.write(`${JSON.stringify({ ...result, counts: prepared.counts, target: "local_postgres" })}\n`);
        if (!result.ok) process.exitCode = 2;
      } catch {
        process.stdout.write(`${JSON.stringify({ ok: false, errors: [{ code: "local_database_unavailable" }] })}\n`);
        process.exitCode = 2;
      } finally {
        client?.release();
        await pool.end();
      }
    }
  }
}
