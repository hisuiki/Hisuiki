import { Router } from "express";
import { developmentOwnerId, getViewer, isSiteOwner } from "../services/IdentityService.js";
import { prisma } from "../services/PrismaService.js";
import { config } from "../AppConfig.js";
import { deletePrefix } from "../services/StorageService.js";
import { ensureSystemBoards, SITE_PAGES } from "../services/SystemBoardService.js";

export const adminRouter = Router();

// Layouts can approach the request-size ceiling and the table never renders them. Keeping them out
// of a 300-board overview prevents Admin from becoming a multi-megabyte response as the site grows.
const adminBoardSelect = {
  id: true,
  ownerId: true,
  slug: true,
  title: true,
  description: true,
  isPrimary: true,
  sitePage: true,
  systemPage: true,
  publishedAt: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    select: { id: true, name: true, email: true, image: true, profile: { select: { handle: true } } },
  },
} as const;

adminRouter.use(async (req, res, next) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });
  if (!isSiteOwner(viewer)) return res.status(403).json({ error: "Site owner access is required." });
  res.locals.viewer = viewer;
  next();
});

/** One owner-only snapshot keeps the admin page useful without a chain of dependent requests. */
adminRouter.get("/", async (_req, res) => {
  const viewer = res.locals.viewer as { id: string };
  await ensureSystemBoards(viewer.id);

  const [users, boards, totals, firstDevelopmentUser] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        profile: { select: { handle: true } },
        _count: {
          select: {
            boards: { where: { systemPage: null } },
            posts: true,
            comments: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.board.findMany({
      select: adminBoardSelect,
      orderBy: [{ systemPage: "asc" }, { sitePage: "asc" }, { updatedAt: "desc" }],
      take: 300,
    }),
    Promise.all([prisma.user.count(), prisma.board.count(), prisma.post.count()]),
    developmentOwnerId(),
  ]);

  return res.json({
    users: users.map((user) => ({
      ...user,
      isOwner:
        user.id === firstDevelopmentUser || isSiteOwner({ ...user, image: user.image ?? "" }),
    })),
    boards,
    stats: { users: totals[0], boards: totals[1], posts: totals[2] },
  });
});

/** Moderation plus assignment of the three website pages. Layout editing remains in the editor. */
adminRouter.patch("/boards/:id", async (req, res) => {
  const existing = await prisma.board.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Board not found." });

  const published = req.body?.published;
  const requestedPage = req.body?.sitePage;
  if (existing.systemPage && (published !== undefined || requestedPage !== undefined)) {
    return res.status(400).json({ error: "System boards can only be changed in the layout editor." });
  }
  if (published !== undefined && typeof published !== "boolean") {
    return res.status(400).json({ error: "published must be true or false." });
  }
  if (published === false && existing.sitePage && requestedPage === undefined) {
    return res.status(400).json({ error: "Unassign this website page before making its board private." });
  }
  if (
    requestedPage !== undefined &&
    requestedPage !== null &&
    !(SITE_PAGES as readonly unknown[]).includes(requestedPage)
  ) {
    return res.status(400).json({ error: "Unknown standalone page." });
  }

  const board = await prisma.$transaction(async (tx) => {
    if (typeof requestedPage === "string") {
      await tx.board.updateMany({ where: { sitePage: requestedPage }, data: { sitePage: null } });
    }
    return tx.board.update({
      where: { id: existing.id },
      data: {
        ...(published === undefined ? {} : { publishedAt: published ? new Date() : null }),
        ...(requestedPage === undefined ? {} : { sitePage: requestedPage }),
        // A website page must remain publicly available even if it was a draft beforehand.
        ...(typeof requestedPage === "string" ? { publishedAt: new Date() } : {}),
      },
      select: adminBoardSelect,
    });
  });
  return res.json(board);
});

adminRouter.delete("/boards/:id", async (req, res) => {
  const existing = await prisma.board.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Board not found." });
  if (existing.systemPage) return res.status(400).json({ error: "System boards cannot be deleted." });

  await prisma.$transaction(async (tx) => {
    await tx.board.delete({ where: { id: existing.id } });
    if (existing.isPrimary) {
      const replacement = await tx.board.findFirst({ where: { ownerId: existing.ownerId }, orderBy: { updatedAt: "desc" } });
      if (replacement) await tx.board.update({ where: { id: replacement.id }, data: { isPrimary: true } });
    }
  });
  return res.sendStatus(204);
});

adminRouter.delete("/users/:id", async (req, res) => {
  const viewer = res.locals.viewer as { id: string };
  if (req.params.id === viewer.id) return res.status(400).json({ error: "You cannot delete your own admin account." });

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "User not found." });
  if (user.id === (await developmentOwnerId()) || isSiteOwner({ ...user, image: user.image ?? "" })) {
    return res.status(400).json({ error: "Another site owner cannot be deleted here." });
  }

  // Database cascades remove metadata; the bucket is separate and must be erased explicitly or an
  // admin deletion would leave every uploaded file and every historical generation behind.
  await deletePrefix(config.storage.dataBucketName, `${user.id}/`);
  await prisma.user.delete({ where: { id: user.id } });
  return res.sendStatus(204);
});
