/**
 * Owner-only account administration.
 *
 * Better Auth remains responsible for creating accounts and sessions. These routes only expose the
 * small set of moderation operations this site needs, with SITE_OWNER_EMAILS as the single source
 * of authority already used by photo moderation.
 */
import { Router, type Request, type Response } from "express";
import { getViewer, isSiteOwner, isSiteOwnerEmail, type Viewer } from "../services/identity.js";
import { prisma } from "../services/prisma.js";

export const adminRouter = Router();

const MAX_USERS = 200;
const MAX_QUERY_LENGTH = 100;

/** Resolves and authorizes once per handler, keeping every future admin route deny-by-default. */
async function requireOwner(req: Request, res: Response): Promise<Viewer | undefined> {
  const viewer = await getViewer(req);
  if (!viewer) {
    res.status(401).json({ error: "Sign in to open the control panel." });
    return undefined;
  }
  if (!isSiteOwner(viewer)) {
    res.status(403).json({ error: "This account is not a site owner." });
    return undefined;
  }
  return viewer;
}

/** Lightweight capability check used by the header after a session has loaded. */
adminRouter.get("/status", async (req, res, next) => {
  try {
    const viewer = await getViewer(req);
    res.json({ isAdmin: isSiteOwner(viewer) });
  } catch (error) {
    next(error);
  }
});

/** GET /api/admin[?q=...] — dashboard totals and the matching account list. */
adminRouter.get("/", async (req, res, next) => {
  try {
    const viewer = await requireOwner(req, res);
    if (!viewer) return;

    const query = (typeof req.query.q === "string" ? req.query.q : "")
      .trim()
      .slice(0, MAX_QUERY_LENGTH);
    const now = new Date();
    const where = query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : undefined;

    const [totalUsers, activeSessions, providerRows, users] = await Promise.all([
      prisma.user.count(),
      prisma.session.count({ where: { expiresAt: { gt: now } } }),
      prisma.account.groupBy({ by: ["providerId"], _count: { _all: true } }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: MAX_USERS,
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
          updatedAt: true,
          accounts: { select: { providerId: true } },
          sessions: { where: { expiresAt: { gt: now } }, select: { id: true } },
        },
      }),
    ]);

    res.json({
      viewerId: viewer.id,
      totals: {
        users: totalUsers,
        activeSessions,
        providers: Object.fromEntries(
          providerRows.map((row) => [row.providerId, row._count._all])
        ),
      },
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? "",
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        providers: [...new Set(user.accounts.map((account) => account.providerId))].sort(),
        activeSessions: user.sessions.length,
        isOwner: isSiteOwnerEmail(user.email),
      })),
      truncated: users.length === MAX_USERS,
    });
  } catch (error) {
    next(error);
  }
});

/** POST /api/admin/users/:id/revoke-sessions — signs an account out everywhere. */
adminRouter.post("/users/:id/revoke-sessions", async (req, res, next) => {
  try {
    const viewer = await requireOwner(req, res);
    if (!viewer) return;

    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!target) {
      res.status(404).json({ error: "Account not found." });
      return;
    }

    const result = await prisma.session.deleteMany({ where: { userId: target.id } });
    res.json({ revoked: result.count, signedOutCurrentAccount: target.id === viewer.id });
  } catch (error) {
    next(error);
  }
});

/** DELETE /api/admin/users/:id — removes a non-owner account and its linked sessions/providers. */
adminRouter.delete("/users/:id", async (req, res, next) => {
  try {
    const viewer = await requireOwner(req, res);
    if (!viewer) return;

    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true },
    });
    if (!target) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    // The owner allow-list is operational configuration. An account cannot remove that authority
    // (or itself) through a stale browser session and leave the site without an administrator.
    if (target.id === viewer.id || isSiteOwnerEmail(target.email)) {
      res.status(400).json({ error: "Site-owner accounts cannot be deleted here." });
      return;
    }

    await prisma.user.delete({ where: { id: target.id } });
    res.json({ deleted: true });
  } catch (error) {
    next(error);
  }
});
