import { randomUUID } from "node:crypto";
import { Router } from "express";
import { Prisma } from "../generated/prisma/client.js";
import { getViewer, isSiteOwner } from "../services/IdentityService.js";
import { scopeLayoutCss } from "../services/LayoutCssUtils.js";
import { prisma } from "../services/PrismaService.js";
import { consumeQuota } from "../services/RateLimitService.js";
import { publishedDefaultLayout } from "./SiteRoutes.js";
import { synchronizeSiteLayout } from "../services/SiteLayoutUtils.js";

export const boardsRouter = Router();

const SLUG = /^[a-z0-9][a-z0-9-]{0,49}$/;
const boardInclude = {
  owner: {
    select: {
      id: true,
      name: true,
      image: true,
      profile: { select: { handle: true } },
    },
  },
} satisfies Prisma.BoardInclude;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length <= max ? text : null;
}

function safeLayout(value: unknown): Prisma.InputJsonValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return scopeLayoutCss(value) as Prisma.InputJsonValue;
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Public board discovery. Home lightly personalises by putting the viewer's boards first. */
boardsRouter.get("/", async (req, res) => {
  const viewer = await getViewer(req);
  const feed = req.query.feed === "home" ? "home" : "explore";
  const sort = req.query.sort === "random" ? "random" : req.query.sort === "recent" ? "recent" : "trending";
  const requested = Number(req.query.limit ?? 24);
  const limit = Number.isFinite(requested) ? Math.min(50, Math.max(1, Math.round(requested))) : 24;

  const boards = await prisma.board.findMany({
    where: {
      publishedAt: { not: null },
      sitePage: null,
      systemPage: null,
      owner: { profile: { handle: { not: null } } },
    },
    include: boardInclude,
    orderBy:
      sort === "recent"
        ? [{ publishedAt: "desc" }, { updatedAt: "desc" }]
        : [{ viewCount: "desc" }, { updatedAt: "desc" }],
    // Random selection is made from a bounded discovery pool; asking PostgreSQL to randomise the
    // whole table would turn Explore into an increasingly expensive full scan.
    take: sort === "random" ? Math.max(limit, 100) : limit,
  });

  if (sort === "random") {
    // Fisher-Yates rather than Array.sort(Math.random), which is biased and engine-dependent.
    for (let i = boards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [boards[i], boards[j]] = [boards[j]!, boards[i]!];
    }
  } else if (feed === "home" && viewer) {
    boards.sort((a, b) => Number(b.ownerId === viewer.id) - Number(a.ownerId === viewer.id));
  }

  return res.json({ boards: boards.slice(0, limit) });
});

/** The signed-in user's board manager, including drafts. */
boardsRouter.get("/mine", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  const boards = await prisma.board.findMany({
    where: { ownerId: viewer.id, systemPage: null },
    include: boardInclude,
    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
  });
  return res.json({ boards });
});

boardsRouter.get("/mine/:id", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  const board = await prisma.board.findUnique({
    where: { id: req.params.id },
    include: boardInclude,
  });
  if (!board || (board.ownerId !== viewer.id && !isSiteOwner(viewer))) {
    return res.status(404).json({ error: "Board not found" });
  }
  return res.json(board);
});

boardsRouter.get("/primary/:handle", async (req, res) => {
  const board = await prisma.board.findFirst({
    where: {
      isPrimary: true,
      publishedAt: { not: null },
      systemPage: null,
      owner: { profile: { handle: req.params.handle } },
    },
    include: boardInclude,
  });
  if (!board) return res.status(404).json({ error: "Board not found" });

  await prisma.board.update({ where: { id: board.id }, data: { viewCount: { increment: 1 } } });
  return res.json(board);
});

boardsRouter.get("/by/:handle/:slug", async (req, res) => {
  const board = await prisma.board.findFirst({
    where: {
      slug: req.params.slug,
      publishedAt: { not: null },
      systemPage: null,
      owner: { profile: { handle: req.params.handle } },
    },
    include: boardInclude,
  });
  if (!board) return res.status(404).json({ error: "Board not found" });

  await prisma.board.update({ where: { id: board.id }, data: { viewCount: { increment: 1 } } });
  return res.json(board);
});

boardsRouter.post("/", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });
  if (!consumeQuota(`board:create:${viewer.id}`, 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: "Board creation limit reached. Try again later." });
  }

  const title = cleanText(req.body?.title, 100);
  const slug = cleanText(req.body?.slug, 50)?.toLowerCase() ?? "";
  const description = cleanText(req.body?.description ?? "", 300);
  if (!title) return res.status(400).json({ error: "A title under 100 characters is required." });
  if (!SLUG.test(slug)) return res.status(400).json({ error: "Use lowercase letters, numbers and dashes for the slug." });
  if (description === null) return res.status(400).json({ error: "Description must be under 300 characters." });

  const suppliedLayout = req.body?.layout === undefined ? undefined : safeLayout(req.body.layout);
  if (req.body?.layout !== undefined && suppliedLayout === null) {
    return res.status(400).json({ error: "A valid widget layout is required." });
  }
  const startingLayout = suppliedLayout ?? (await publishedDefaultLayout()) ?? ({} as Prisma.InputJsonValue);

  try {
    const board = await prisma.$transaction(async (tx) => {
      const existing = await tx.board.count({ where: { ownerId: viewer.id, systemPage: null } });
      const isPrimary = existing === 0 || req.body?.isPrimary === true;
      if (isPrimary) await tx.board.updateMany({ where: { ownerId: viewer.id, systemPage: null }, data: { isPrimary: false } });

      return tx.board.create({
        data: {
          id: randomUUID(),
          ownerId: viewer.id,
          title,
          slug,
          description,
          layout: startingLayout,
          isPrimary,
          // Creation starts private unless the caller explicitly asks to publish it.
          publishedAt: req.body?.published === true ? new Date() : null,
        },
        include: boardInclude,
      });
    });
    return res.status(201).json(board);
  } catch (error) {
    if (isUniqueError(error)) return res.status(409).json({ error: "You already have a board with that slug." });
    throw error;
  }
});

boardsRouter.put("/:id", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });
  if (!consumeQuota(`board:update:${viewer.id}`, 600, 60 * 60 * 1000)) {
    return res.status(429).json({ error: "Board update limit reached. Try again later." });
  }

  const existing = await prisma.board.findUnique({ where: { id: req.params.id } });
  if (!existing || (existing.ownerId !== viewer.id && !isSiteOwner(viewer))) {
    return res.status(404).json({ error: "Board not found" });
  }
  if (
    existing.systemPage &&
    Object.keys(req.body ?? {}).some((key) => key !== "layout")
  ) {
    return res.status(400).json({ error: "Only the layout of a system board can be changed." });
  }

  const data: Prisma.BoardUpdateInput = {};
  if (req.body?.title !== undefined) {
    const title = cleanText(req.body.title, 100);
    if (!title) return res.status(400).json({ error: "A title under 100 characters is required." });
    data.title = title;
  }
  if (req.body?.description !== undefined) {
    const description = cleanText(req.body.description, 300);
    if (description === null) return res.status(400).json({ error: "Description must be under 300 characters." });
    data.description = description;
  }
  if (req.body?.slug !== undefined) {
    const slug = cleanText(req.body.slug, 50)?.toLowerCase() ?? "";
    if (!SLUG.test(slug)) return res.status(400).json({ error: "Use lowercase letters, numbers and dashes for the slug." });
    data.slug = slug;
  }
  if (req.body?.layout !== undefined) {
    const layout = safeLayout(req.body.layout);
    if (!layout) return res.status(400).json({ error: "A valid widget layout is required." });
    data.layout = layout;
  }
  if (typeof req.body?.published === "boolean") {
    if (!req.body.published && existing.sitePage) {
      return res.status(400).json({ error: "Unassign this board from the website in Admin before making it private." });
    }
    data.publishedAt = req.body.published ? new Date() : null;
  }

  try {
    const board = await prisma.$transaction(async (tx) => {
      if (req.body?.isPrimary === true) {
        await tx.board.updateMany({ where: { ownerId: existing.ownerId, systemPage: null }, data: { isPrimary: false } });
        data.isPrimary = true;
      }

      if (existing.systemPage && data.layout !== undefined) {
        const peers = await tx.board.findMany({
          where: { systemPage: { not: null }, id: { not: existing.id } },
          select: { id: true, layout: true },
        });
        await Promise.all(
          peers.map((peer) =>
            tx.board.update({
              where: { id: peer.id },
              data: {
                layout: synchronizeSiteLayout(data.layout, peer.layout, existing.layout) as Prisma.InputJsonValue,
              },
            }),
          ),
        );
      }
      return tx.board.update({ where: { id: existing.id }, data, include: boardInclude });
    });
    return res.json(board);
  } catch (error) {
    if (isUniqueError(error)) return res.status(409).json({ error: "You already have a board with that slug." });
    throw error;
  }
});

boardsRouter.delete("/:id", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  const existing = await prisma.board.findFirst({ where: { id: req.params.id, ownerId: viewer.id } });
  if (!existing) return res.status(404).json({ error: "Board not found" });
  if (existing.systemPage) return res.status(400).json({ error: "System boards cannot be deleted." });

  await prisma.$transaction(async (tx) => {
    await tx.board.delete({ where: { id: existing.id } });
    if (existing.isPrimary) {
      const replacement = await tx.board.findFirst({
        where: { ownerId: viewer.id, systemPage: null },
        orderBy: { updatedAt: "desc" },
      });
      if (replacement) await tx.board.update({ where: { id: replacement.id }, data: { isPrimary: true } });
    }
  });
  return res.sendStatus(204);
});
