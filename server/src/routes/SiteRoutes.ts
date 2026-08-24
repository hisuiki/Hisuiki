import { Router } from "express";
import { prisma } from "../services/PrismaService.js";
import { Prisma } from "../generated/prisma/client.js";
import { getViewer, isSiteOwner } from "../services/IdentityService.js";
import { availableProviders } from "../services/AuthService.js";
import { scopeLayoutCss } from "../services/LayoutCssUtils.js";
import { SITE_PAGES } from "../services/SystemBoardService.js";

export const siteRouter = Router();
export { SITE_PAGES };

/** The standalone app layout, also used as the starting point for a new board. */
const DEFAULT_LAYOUT = "defaultLayout";

/** What this deployment can do, and whether the caller may configure it. */
siteRouter.get("/", async (req, res) => {
  const viewer = await getViewer(req);
  return res.json({ socialProviders: availableProviders(), isOwner: isSiteOwner(viewer) });
});

/**
 * The published starting layout.
 *
 * Readable by anyone: it draws the front-facing app and is the starting point for new boards.
 */
siteRouter.get("/defaults", async (_req, res) => {
  const row = await prisma.siteSetting.findUnique({ where: { key: DEFAULT_LAYOUT } });
  return res.json({ layout: row?.value ?? null, publishedAt: row?.updatedAt ?? null });
});

/** The optional override, then the protected system board, then the legacy shipped fallback. */
siteRouter.get("/pages/:page", async (req, res) => {
  const page = String(req.params.page);
  if (!(SITE_PAGES as readonly string[]).includes(page)) {
    return res.status(404).json({ error: "Unknown site page." });
  }

  const override = await prisma.board.findUnique({
    where: { sitePage: page },
    select: { id: true, title: true, layout: true, updatedAt: true },
  });
  if (override) return res.json({ board: override, layout: override.layout, source: "override" });

  const system = await prisma.board.findUnique({
    where: { systemPage: page },
    select: { id: true, title: true, layout: true, updatedAt: true },
  });
  if (system) return res.json({ board: system, layout: system.layout, source: "system" });

  const row = await prisma.siteSetting.findUnique({ where: { key: DEFAULT_LAYOUT } });
  return res.json({ board: null, layout: row?.value ?? null, source: "fallback" });
});

/** Publishing one is a site-wide act, so it is owners only. */
siteRouter.put("/defaults", async (req, res) => {
  const viewer = await getViewer(req);
  if (!isSiteOwner(viewer)) return res.status(403).json({ error: "Not allowed" });

  const layout = req.body?.layout;
  if (!layout || typeof layout !== "object") {
    return res.status(400).json({ error: "A layout is required." });
  }

  // Through the same filter as anyone's own layout: this one reaches every new profile.
  const value = scopeLayoutCss(layout) as Prisma.InputJsonValue;

  const row = await prisma.siteSetting.upsert({
    where: { key: DEFAULT_LAYOUT },
    update: { value },
    create: { key: DEFAULT_LAYOUT, value },
  });

  return res.json({ layout: row.value, publishedAt: row.updatedAt });
});

/** Clears it, so standalone pages and new boards go back to the layout the app ships. */
siteRouter.delete("/defaults", async (req, res) => {
  const viewer = await getViewer(req);
  if (!isSiteOwner(viewer)) return res.status(403).json({ error: "Not allowed" });

  await prisma.siteSetting.deleteMany({ where: { key: DEFAULT_LAYOUT } });
  return res.json({ layout: null, publishedAt: null });
});

/** Used when a profile row is first created. */
export async function publishedDefaultLayout(): Promise<Prisma.InputJsonValue | undefined> {
  const row = await prisma.siteSetting.findUnique({ where: { key: DEFAULT_LAYOUT } });
  return (row?.value as Prisma.InputJsonValue) ?? undefined;
}
