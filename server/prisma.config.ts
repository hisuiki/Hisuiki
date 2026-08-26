/**
 * Prisma 7 reads the connection URL from here rather than from schema.prisma, and only for the
 * commands that touch a live database — `migrate`, `db push`, `introspect`. `prisma generate` needs
 * no connection, which is what lets the Docker build generate the client before any database
 * exists, so the datasource is attached only when a database URL is actually set: `env()` throws
 * on a missing variable and would otherwise break the build.
 *
 * Production runtime traffic uses DATABASE_URL through PgBouncer. Prisma CLI operations must use
 * DIRECT_DATABASE_URL so schema migrations never pass through transaction pooling. Local setups
 * can keep setting only DATABASE_URL because it remains the fallback.
 */
import { defineConfig } from "prisma/config";

const url = process.env.DIRECT_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url } } : {}),
});
