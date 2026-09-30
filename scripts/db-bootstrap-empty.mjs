#!/usr/bin/env node
/**
 * Build an EMPTY database from the migration history (CI, staging, restore
 * rehearsals). Never run against production.
 *
 * Two 2026-08-24 migrations are one-time owner password recoveries that
 * require the production owner row and raise on an empty database. Applied
 * migration files must stay byte-identical (Prisma checksums), so instead of
 * editing them this script marks exactly those two as applied when — and only
 * when — the database has no users; their effect is meaningless there.
 */
import { execFileSync } from "node:child_process";

const ONE_TIME_OWNER_RECOVERY = new Set([
  "20260824153000_reset_owner_password_recovery",
  "20260824154500_rotate_owner_recovery_password",
]);
const prisma = (args) =>
  execFileSync("npx", ["prisma", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

for (let attempt = 0; attempt < ONE_TIME_OWNER_RECOVERY.size + 1; attempt += 1) {
  try {
    process.stdout.write(prisma(["migrate", "deploy"]));
    process.exit(0);
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    const failed = [...ONE_TIME_OWNER_RECOVERY].find((name) => output.includes(name));
    if (!failed || !/Expected exactly one owner account, updated 0/.test(output)) {
      process.stderr.write(output);
      process.exit(1);
    }
    console.log(`Empty database: marking one-time owner recovery ${failed} as applied.`);
    prisma(["migrate", "resolve", "--rolled-back", failed]);
    prisma(["migrate", "resolve", "--applied", failed]);
  }
}
console.error("db-bootstrap-empty: migrations did not converge.");
process.exit(1);
