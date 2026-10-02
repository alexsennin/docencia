import { readFile } from "node:fs/promises";
import { normalizeSheetsSnapshot } from "../lib/sheets-postgres-import.mjs";
import { reconcileSheetsSnapshot } from "../lib/sheets-snapshot-reconcile.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--input" || !args[1]) {
  process.stdout.write(`${JSON.stringify({ ok: false, errors: [{ code: "usage", tab: "", row: 0, field: "--input" }], warnings: [] })}\n`);
  process.exitCode = 2;
} else {
  try {
    const snapshot = normalizeSheetsSnapshot(JSON.parse(await readFile(args[1], "utf8")));
    const result = reconcileSheetsSnapshot(snapshot);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.ok) process.exitCode = 2;
  } catch {
    process.stdout.write(`${JSON.stringify({ ok: false, errors: [{ code: "input_unreadable_or_invalid_json", tab: "", row: 0, field: "" }], warnings: [] })}\n`);
    process.exitCode = 2;
  }
}
