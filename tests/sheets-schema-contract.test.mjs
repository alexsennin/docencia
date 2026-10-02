import assert from "node:assert/strict";
import { test } from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { SHEETS_MIGRATION_CONTRACT, SHEETS_TARGET_ONLY_COLUMNS, SHEETS_TARGET_SCHEMA_EXPORTS, SHEETS_TARGET_TABLES } from "../lib/sheets-snapshot-reconcile.mjs";

test("every source sheet column maps to PostgreSQL and every target-only field is explicitly declared", () => {
  assert.deepEqual(Object.keys(SHEETS_TARGET_SCHEMA_EXPORTS).sort(), Object.keys(SHEETS_MIGRATION_CONTRACT).sort());
  assert.equal(new Set(Object.values(SHEETS_TARGET_TABLES)).size, Object.keys(SHEETS_TARGET_TABLES).length);

  for (const [tab, exportName] of Object.entries(SHEETS_TARGET_SCHEMA_EXPORTS)) {
    const table = schema[exportName];
    assert.ok(table, `Missing Drizzle table export for ${tab}: ${exportName}`);
    assert.equal(getTableName(table), SHEETS_TARGET_TABLES[tab], `${tab} SQL table name does not match its Drizzle target`);
    const targetColumns = getTableConfig(table).columns.map((column) => column.name);
    const sourceColumns = SHEETS_MIGRATION_CONTRACT[tab].headers;
    const targetOnly = SHEETS_TARGET_ONLY_COLUMNS[tab] ?? [];

    for (const field of sourceColumns) {
      assert.ok(targetColumns.includes(field), `${tab}.${field} has no matching PostgreSQL column in ${SHEETS_TARGET_TABLES[tab]}`);
    }
    for (const field of targetColumns) {
      assert.ok(sourceColumns.includes(field) || targetOnly.includes(field), `${SHEETS_TARGET_TABLES[tab]}.${field} is neither a source field nor an approved target-only field`);
    }
    for (const field of targetOnly) {
      assert.ok(targetColumns.includes(field), `${tab}.${field} is allowlisted but absent from ${SHEETS_TARGET_TABLES[tab]}`);
      assert.ok(!sourceColumns.includes(field), `${tab}.${field} is marked target-only but exists in the source contract`);
    }
  }
});
