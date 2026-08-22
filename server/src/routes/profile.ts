import { Router } from "express";
import { prisma } from "../services/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { displayName, getViewer } from "../services/identity.js";
import { saveContent } from "../services/content.js";
import { PROFILE_SCOPE, scopeCss } from "../services/userContent.js";
import { scopeLayoutCss } from "../services/layoutCss.js";
import { publishedDefaultLayout } from "./site.js";
import { consumeQuota } from "../services/rateLimit.js";

export const profileRouter = Router();

const RESERVED_HANDLES = ['www', 'api', 'cdn', 'admin', 'static', 'localhost'];

// GET /api/profile/me - Get current user's profile
profileRouter.get("/me", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // A new profile starts from whatever a site owner has published, if anything.
  const starting = await publishedDefaultLayout();

  const profile = await prisma.profile.upsert({
    where: { userId: viewer.id },
    update: {},
    create: {
      userId: viewer.id,
      ...(starting ? { layout: starting } : {}),
    },
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

  /**
   * Two different rates, because there are two different kinds of write here.
   *
   * Changing a handle, a stylesheet or a wallpaper is something a person does a handful of times,
   * and twenty an hour is a generous ceiling on it. Arranging a page is not: the layout autosaves
   * after every drag and every pause in typing, so the same ceiling was being spent in a couple of
   * minutes of ordinary use and the editor started answering 429 to its own saves.
   *
   * A request that touches nothing but the layout gets its own, much larger allowance. It is still
   * bounded — this is a write to the database from an unattended loop, and a stuck client should not
   * be able to hammer it forever.
   */
  const layoutOnly =
    Object.keys(req.body ?? {}).length > 0 &&
    Object.keys(req.body ?? {}).every((field) => field === "layout");

  const allowed = layoutOnly
    ? consumeQuota(`profile:layout:${viewer.id}`, 600, 60 * 60 * 1000)
    : consumeQuota(`profile:update:${viewer.id}`, 60, 60 * 60 * 1000);

  if (!allowed) {
    return res.status(429).json({ error: "Profile update limit reached. Try again later." });
  }

  const {
    handle, headline, bio, headerLinks, showProfileLink, accentColor, customCss, wallpaperPath,
    profileLinks, publicEmail, location, pronouns, layout,
  } = req.body;

  /**
   * Every widget's own stylesheet, confined to that widget.
   *
   * The layout is a JSON blob the client sends whole, so a stylesheet inside it would otherwise
   * arrive unexamined and be served to anyone who visits this profile. It goes through the same
   * filter as the profile's own custom CSS, and only the confined result is what the page renders.
   */
  const safeLayout =
    layout === undefined ? undefined : (scopeLayoutCss(layout) as Prisma.InputJsonValue);

  // Refuse a stylesheet that cannot be made safe, rather than storing something whose scoped form is
  // empty and leaving the author wondering why nothing applied.
  if (customCss !== undefined && customCss !== null) {
    if (typeof customCss !== "string" || customCss.length > 100_000) {
      return res.status(400).json({ error: "Custom CSS must be text under 100KB." });
    }
    const { css, removed } = scopeCss(customCss, PROFILE_SCOPE);
    if (!css.trim() && customCss.trim()) {
      return res.status(400).json({
        error: `None of that CSS can be applied${removed.length ? `: ${removed.join(", ")}` : "."}`,
      });
    }
  }

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
      headerLinks,
      showProfileLink,
      accentColor,
      customCss,
      wallpaperPath,
      profileLinks,
      publicEmail,
      location,
      pronouns,
      layout: safeLayout,
    },
    create: {
      userId: viewer.id,
      handle,
      headline,
      bio,
      headerLinks,
      showProfileLink,
      accentColor,
      customCss,
      wallpaperPath,
      profileLinks,
      publicEmail,
      location,
      pronouns,
      layout: safeLayout,
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

  // customCss is the author's raw source and never leaves the server: a visitor gets only the
  // scoped, filtered stylesheet, which is what stops one profile restyling the app chrome or
  // reaching another person's content.
  const { customCss, ...publicProfile } = profile;
  return res.json({ ...publicProfile, scopedCss: scopeCss(customCss ?? "", PROFILE_SCOPE).css });
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

  const { renderUserContent } = await import("../services/userContent.js");
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
    const { renderUserContent } = await import("../services/userContent.js");
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
