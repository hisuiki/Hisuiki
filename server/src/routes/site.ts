import { Router } from "express";
import { prisma } from "../services/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { getViewer, isSiteOwner } from "../services/identity.js";
import { availableProviders } from "../services/auth.js";
import { scopeLayoutCss } from "../services/layoutCss.js";

export const siteRouter = Router();

/** The layout a new profile starts from, when a site owner has published one. */
const DEFAULT_LAYOUT = "defaultLayout";

/** What this deployment can do, and whether the caller may configure it. */
siteRouter.get("/", async (req, res) => {
  const viewer = await getViewer(req);
  return res.json({ socialProviders: availableProviders(), isOwner: isSiteOwner(viewer) });
});

/**
 * The published starting layout.
 *
 * Readable by anyone: it is what every new profile is about to be given, and the client needs it to
 * show an owner what is currently published.
 */
siteRouter.get("/defaults", async (_req, res) => {
  const row = await prisma.siteSetting.findUnique({ where: { key: DEFAULT_LAYOUT } });
  return res.json({ layout: row?.value ?? null, publishedAt: row?.updatedAt ?? null });
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

/** Clears it, so new profiles go back to the layout the app ships. */
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
