/**
 * Applies pending Prisma migrations at startup.
 *
 * The database is private to the VPC, so a workstation cannot reach it and migrations have to run
 * from inside — either here, as the API boots, or through the hisuiki-migrate Cloud Run job for a
 * migration that should land without a deploy.
 *
 * Concurrency is safe: `prisma migrate deploy` takes an advisory lock on the database, so several
 * instances starting at once serialise rather than racing. A failure is deliberately fatal — a
 * revision serving requests against a schema it was not built for is worse than one that will not
 * start, and Cloud Run keeps the previous revision live when the new one never becomes ready.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "../AppConfig.js";

const run = promisify(execFile);

export async function applyMigrations(): Promise<void> {
  if (!config.servesApi || !config.database.url) return;

  console.log("Applying database migrations…");

  try {
    const { stdout } = await run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: process.env,
      // Long enough for a real migration on a cold instance, short enough to fail rather than hang.
      timeout: 120_000,
    });
    console.log(stdout.trim());
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Migrations failed, refusing to start: ${detail}`);
    throw error;
  }
}
