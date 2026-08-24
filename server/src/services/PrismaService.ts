/**
 * The Prisma client, constructed once per process.
 *
 * Prisma 7 takes its connection through a driver adapter rather than a URL in the schema, so the
 * pg pool is created here and handed to the client. On Cloud Run the URL points at the Cloud SQL
 * unix socket (`host=/cloudsql/<connection name>`), which is why nothing here assumes TCP.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "../AppConfig.js";

const adapter = new PrismaPg({ connectionString: config.database.url });

export const prisma = new PrismaClient({ adapter });
