import { Router } from "express";
import { prisma } from "../services/PrismaService.js";
import { Prisma } from "../generated/prisma/client.js";
import { displayName, getViewer } from "../services/IdentityService.js";
import { saveContent } from "../services/ContentService.js";
import { consumeQuota } from "../services/RateLimitService.js";

export const profileRouter = Router();

const RESERVED_HANDLES = ['www', 'api', 'cdn', 'admin', 'static', 'localhost'];

// GET /api/profile/me - Get current user's profile
profileRouter.get("/me", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const profile = await prisma.profile.upsert({
    where: { userId: viewer.id },
    update: {},
    create: { userId: viewer.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  return res.json(profile);
});

// PUT /api/profile/me - Update current user's profile
profileRouter.put("/me", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!consumeQuota(`profile:update:${viewer.id}`, 60, 60 * 60 * 1000)) {
    return res.status(429).json({ error: "Profile update limit reached. Try again later." });
  }

  const { handle, headline, bio, profileLinks, publicEmail, location, pronouns } = req.body;

  if (handle !== undefined && handle !== null) {
    if (typeof handle !== "string" || !/^[a-z0-9-]+$/.test(handle) || handle.length < 3 || handle.length > 30) {
      return res.status(400).json({ error: "Invalid handle format" });
    }
    if (RESERVED_HANDLES.includes(handle)) {
      return res.status(400).json({ error: "Handle is reserved" });
    }
    
    const existing = await prisma.profile.findUnique({
      where: { handle },
    });
    if (existing && existing.userId !== viewer.id) {
      return res.status(409).json({ error: "Handle is already taken" });
    }
  }

  const profile = await prisma.profile.upsert({
    where: { userId: viewer.id },
    update: {
      handle,
      headline,
      bio,
      profileLinks,
      publicEmail,
      location,
      pronouns,
    },
    create: {
      userId: viewer.id,
      handle,
      headline,
      bio,
      profileLinks,
      publicEmail,
      location,
      pronouns,
    },
  });

  return res.json(profile);
});

// GET /api/profile/:handle - Look up a profile by handle
profileRouter.get("/:handle", async (req, res) => {
  const { handle } = req.params;
  
  const profile = await prisma.profile.findUnique({
    where: { handle },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });

  if (!profile) {
    return res.status(404).json({ error: "Profile not found" });
  }

  // Visual customization belongs to Board.layout. Old profile columns remain only as migration
  // source and are intentionally neither rendered nor exposed by the live profile API.
  const {
    customCss: _customCss,
    wallpaperPath: _wallpaperPath,
    accentColor: _accentColor,
    headerLinks: _headerLinks,
    showProfileLink: _showProfileLink,
    layout: _layout,
    ...publicProfile
  } = profile;
  return res.json(publicProfile);
});

// GET /api/profile/me/pages
profileRouter.get("/me/pages", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  const pages = await prisma.profilePage.findMany({
    where: { userId: viewer.id },
    orderBy: { position: "asc" },
  });
  return res.json({ pages });
});

// POST /api/profile/me/pages
profileRouter.post("/me/pages", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  const { slug, title, body, inNav, isHome } = req.body;
  if (typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "Page body cannot be empty" });
  }
  
  if (!slug || typeof slug !== "string") {
    return res.status(400).json({ error: "Slug is required" });
  }

  const { renderUserContent } = await import("../services/UserContentUtils.js");
  const { randomUUID } = await import("node:crypto");
  const id = randomUUID();
  const bodyPath = await saveContent({
    userId: viewer.id,
    kind: "pages",
    id,
    markdown: body,
    message: "Created",
    authorName: displayName(viewer),
  });

  const rendered = renderUserContent(body, { scopeSelector: `[data-page="${id}"]` });

  const page = await prisma.profilePage.create({
    data: {
      id,
      userId: viewer.id,
      slug,
      title: title || slug,
      bodyPath,
      renderedHtml: rendered.html + (rendered.css ? `\n<style>${rendered.css}</style>` : ""),
      inNav: inNav ?? true,
      isHome: isHome ?? false,
    },
  });

  return res.status(201).json(page);
});

// PUT /api/profile/me/pages/:id
profileRouter.put("/me/pages/:id", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  const existing = await prisma.profilePage.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== viewer.id) return res.status(404).json({ error: "Page not found" });

  const { slug, title, body, inNav, isHome } = req.body;
  
  const data: Prisma.ProfilePageUpdateInput = {};
  if (slug !== undefined) data.slug = slug;
  if (title !== undefined) data.title = title;
  if (inNav !== undefined) data.inNav = inNav;
  if (isHome !== undefined) data.isHome = isHome;

  if (body !== undefined) {
    if (typeof body !== "string" || !body.trim()) return res.status(400).json({ error: "Page body cannot be empty" });
    const { renderUserContent } = await import("../services/UserContentUtils.js");
    // Scoped to this page specifically, so one page's stylesheet cannot reach another.
    const rendered = renderUserContent(body, { scopeSelector: `[data-page="${existing.id}"]` });
    data.bodyPath = await saveContent({
      userId: viewer.id,
      kind: "pages",
      id: existing.id,
      markdown: body,
      message: typeof req.body.message === "string" ? req.body.message : "Edited",
      authorName: displayName(viewer),
    });
    data.renderedHtml = rendered.html + (rendered.css ? `\n<style>${rendered.css}</style>` : "");
  }

  const updated = await prisma.profilePage.update({
    where: { id: req.params.id },
    data,
  });

  return res.json(updated);
});

// DELETE /api/profile/me - Delete current user's account
profileRouter.delete("/me", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  await prisma.user.delete({ where: { id: viewer.id } });
  return res.sendStatus(204);
});
