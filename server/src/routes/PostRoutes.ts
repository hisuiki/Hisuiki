import { Router } from "express";
import { prisma } from "../services/PrismaService.js";
import { Prisma } from "../generated/prisma/client.js";
import { getViewer } from "../services/IdentityService.js";
import { consumeQuota } from "../services/RateLimitService.js";
import { postScope, renderUserContent } from "../services/UserContentUtils.js";
import {
  deleteContent,
  listContentVersions,
  readContent,
  readContentAt,
  saveContent,
} from "../services/ContentService.js";
import { displayName } from "../services/IdentityService.js";
import { rankFeed } from "../services/RankingUtils.js";
import { randomUUID } from "node:crypto";

export const postsRouter = Router();

/**
 * A post is addressed by UUID, not by slug. A slug is a title the author can change and two authors
 * can share, so it identifies a post only in the context of its author; the UUID identifies it
 * everywhere — in the bucket path holding its body, in a permalink, and across a rename.
 */
const generateId = () => randomUUID();

/** Matches the ids above, so a slug can never be mistaken for one. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/posts — the feed.
 *
 * `?author=` scopes it to one profile, which is what a profile subdomain asks for. `?kind=media`
 * narrows it to posts carrying images, so the media tab is this route rather than another one.
 * `?sort=recent` returns plain reverse-chronological order — what Explore shows, and the reason
 * there is always a way to see what is actually being posted rather than what ranking chose.
 *
 * Bodies are not read here. The rendered HTML cached on each row is what a feed shows, so fifty
 * posts cost one query rather than fifty bucket reads.
 */
postsRouter.get("/", async (req, res) => {
  const authorHandle = req.query.author as string | undefined;
  const kind = req.query.kind as string | undefined;

  const where: Prisma.PostWhereInput = {
    ...(authorHandle ? { author: { profile: { handle: authorHandle } } } : {}),
    ...(kind === "media" ? { media: { some: {} } } : {}),
  };

  const posts = await prisma.post.findMany({
    where,
    include: {
      author: { select: { id: true, name: true, image: true, profile: { select: { handle: true } } } },
      media: true,
      _count: { select: { likes: true, comments: true, reposts: true } },
    },
    // Ranking needs more than it returns: a post that ranks 40th out of 200 would never appear if
    // only the newest 50 were fetched and then scored.
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const recentFirst = req.query.sort === "recent";
  if (recentFirst) return res.json({ posts: posts.slice(0, 50) });

  // Scoped to the viewer so their own recent post surfaces — otherwise publishing something and not
  // seeing it reads as the post having failed.
  const viewer = await getViewer(req);
  return res.json({ posts: rankFeed(posts, viewer?.id).slice(0, 50) });
});

// POST /api/posts - Create an article or text post
postsRouter.post("/", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  if (!consumeQuota(`post:create:${viewer.id}`, 50, 60 * 60 * 1000)) {
    return res.status(429).json({ error: "Too many posts. Try again later." });
  }

  const { body, title, slug } = req.body;
  if (typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "Post body cannot be empty" });
  }

  // The id is minted first so the stylesheet can be scoped to this post specifically. Scoping every
  // post to one shared class would let any post restyle every other post shown beside it.
  // The id is minted first: it names the object the body is written to, and scopes the post's own
  // stylesheet so it cannot restyle its neighbours in a feed.
  const id = generateId();
  const rendered = renderUserContent(body, { scopeSelector: postScope(id) });

  const bodyPath = await saveContent({
    userId: viewer.id,
    kind: "posts",
    id,
    markdown: body,
    message: "Created",
    authorName: displayName(viewer),
  });

  const post = await prisma.post.create({
    data: {
      id,
      authorId: viewer.id,
      title: title || null,
      slug: slug || null,
      bodyPath,
      renderedHtml: rendered.html + (rendered.css ? `\n<style>${rendered.css}</style>` : ""),
      publishedAt: new Date(),
    },
  });

  return res.status(201).json(post);
});

// GET /api/posts/resolve?slug=...&isHome=...&author=...
postsRouter.get("/resolve", async (req, res) => {
  const slug = typeof req.query.slug === "string" ? req.query.slug : "README";
  const isHome = req.query.isHome === "true";
  const authorHandle = req.query.author as string | undefined;

  if (!authorHandle) return res.status(404).json({ error: "Author required" });

  const profile = await prisma.profile.findUnique({
    where: { handle: authorHandle },
    include: { user: true },
  });

  if (!profile) return res.status(404).json({ error: "Author not found" });

  if (!isHome) {
    const post = await prisma.post.findUnique({
      where: { authorId_slug: { authorId: profile.userId, slug } },
    });
    if (!post) return res.status(404).json({ error: "Page not found" });

    return res.json({
      path: `posts/${slug}`,
      content: post.bodyPath ? ((await readContent(post.bodyPath)) ?? "") : "",
      renderedHtml: post.renderedHtml,
      contentType: "text/markdown",
      found: true,
      meta: {
        title: post.title || slug,
        description: "",
        author: profile.user.name,
        lastEdited: post.updatedAt.toISOString(),
      },
    });
  } else {
    const page = await prisma.profilePage.findUnique({
      where: { userId_slug: { userId: profile.userId, slug } },
    });
    if (!page) return res.status(404).json({ error: "Page not found" });

    return res.json({
      path: slug,
      content: page.bodyPath ? ((await readContent(page.bodyPath)) ?? "") : "",
      renderedHtml: page.renderedHtml,
      contentType: "text/markdown",
      found: true,
      meta: {
        title: page.title || slug,
        description: "",
        author: profile.user.name,
        lastEdited: page.updatedAt.toISOString(),
      },
    });
  }
});

// GET /api/posts/raw?slug=...&isHome=...&author=...
postsRouter.get("/raw", async (req, res) => {
  const slug = typeof req.query.slug === "string" ? req.query.slug : "README";
  const isHome = req.query.isHome === "true";
  const authorHandle = req.query.author as string | undefined;

  if (!authorHandle) return res.status(404).json({ error: "Author required" });

  const profile = await prisma.profile.findUnique({
    where: { handle: authorHandle },
  });

  if (!profile) return res.status(404).json({ error: "Author not found" });

  let body = "";
  if (!isHome) {
    const post = await prisma.post.findUnique({
      where: { authorId_slug: { authorId: profile.userId, slug } },
    });
    if (post?.bodyPath) body = (await readContent(post.bodyPath)) ?? "";
  } else {
    const page = await prisma.profilePage.findUnique({
      where: { userId_slug: { userId: profile.userId, slug } },
    });
    if (page?.bodyPath) body = (await readContent(page.bodyPath)) ?? "";
  }

  return res.json({ path: slug, rawContent: body, found: body !== "" });
});


// GET /api/posts/articles?author=...
postsRouter.get("/articles", async (req, res) => {
  const authorHandle = req.query.author as string | undefined;
  if (!authorHandle) return res.json([]);

  const posts = await prisma.post.findMany({
    where: { author: { profile: { handle: authorHandle } }, slug: { not: null } },
    orderBy: { publishedAt: "desc" },
  });

  const list = posts.map((post) => ({
    slug: post.slug,
    isHome: false,
    title: post.title || post.slug,
    description: "",
    author: authorHandle,
    lastEdited: post.updatedAt.toISOString().split("T")[0],
    lastEditedIso: post.updatedAt.toISOString(),
    created: post.createdAt.toISOString().split("T")[0],
  }));

  return res.json(list);
});

// GET /api/posts/:id - Get single post
postsRouter.get("/:id", async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: "Invalid post id." });

  const post = await prisma.post.findUnique({
    where: { id: req.params.id },
    include: {
      author: { select: { id: true, name: true, image: true, profile: { select: { handle: true } } } },
      media: true,
      _count: { select: { likes: true, comments: true, reposts: true } },
    }
  });

  if (!post) return res.status(404).json({ error: "Post not found" });

  // The source comes from the bucket, so a single post carries what an editor needs to round-trip
  // it. The feed above deliberately does not pay this cost.
  const body = post.bodyPath ? await readContent(post.bodyPath) : null;
  return res.json({ ...post, body });
});

// GET /api/posts/slug/:slug - Get single post by slug
postsRouter.get("/slug/:slug", async (req, res) => {
  const authorHandle = req.query.author as string | undefined;

  const where: Prisma.PostWhereInput = { slug: req.params.slug };
  if (authorHandle) {
    where.author = { profile: { handle: authorHandle } };
  }

  const posts = await prisma.post.findMany({
    where,
    include: {
      author: { select: { id: true, name: true, image: true, profile: { select: { handle: true } } } },
      media: true,
      _count: { select: { likes: true, comments: true, reposts: true } },
    },
    take: 1
  });

  if (posts.length === 0) return res.status(404).json({ error: "Post not found" });
  return res.json(posts[0]);
});

// PUT /api/posts/:id - Edit post
postsRouter.put("/:id", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.authorId !== viewer.id) return res.status(403).json({ error: "Forbidden" });

  const { body, title, slug } = req.body;
  if (typeof body !== "string" || !body.trim()) {
    return res.status(400).json({ error: "Post body cannot be empty" });
  }

  const rendered = renderUserContent(body, { scopeSelector: postScope(post.id) });

  // A write, not a replace: bucket versioning keeps the previous bytes, which is what the history
  // below reads back.
  const bodyPath = await saveContent({
    userId: viewer.id,
    kind: "posts",
    id: post.id,
    markdown: body,
    message: typeof req.body.message === "string" ? req.body.message : "Edited",
    authorName: displayName(viewer),
  });

  const updated = await prisma.post.update({
    where: { id: req.params.id },
    data: {
      title: title !== undefined ? title : post.title,
      slug: slug !== undefined ? slug : post.slug,
      bodyPath,
      renderedHtml: rendered.html + (rendered.css ? `\n<style>${rendered.css}</style>` : ""),
    },
  });

  return res.json(updated);
});

// DELETE /api/posts/:id - Delete post
postsRouter.delete("/:id", async (req, res) => {
  const viewer = await getViewer(req);
  if (!viewer) return res.status(401).json({ error: "Unauthorized" });

  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (post.authorId !== viewer.id) return res.status(403).json({ error: "Forbidden" });

  // The row goes first: a leftover object is invisible, whereas a row pointing at a body that is
  // gone is a broken post in the feed.
  await prisma.post.delete({ where: { id: req.params.id } });
  if (post.bodyPath) await deleteContent(post.bodyPath);
  return res.sendStatus(204);
});

/**
 * GET /api/posts/:id/history — one entry per stored generation of the body, newest first.
 *
 * This is the reason bodies live in the bucket rather than a column: versioning is the bucket's,
 * and an edit history comes with it instead of needing a revisions table.
 */
postsRouter.get("/:id/history", async (req, res) => {
  if (!UUID.test(req.params.id)) return res.status(400).json({ error: "Invalid post id." });

  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post?.bodyPath) return res.status(404).json({ error: "Post not found" });

  const versions = await listContentVersions(post.bodyPath);
  return res.json(
    versions.map((version) => ({
      generation: version.generation,
      date: version.metadata.editedAt || version.updated,
      message: version.metadata.commitMessage || "",
      authorName: version.metadata.editorName || "",
      sizeBytes: version.sizeBytes,
    }))
  );
});

/** GET /api/posts/:id/version?generation= — the source as it stood at one generation. */
postsRouter.get("/:id/version", async (req, res) => {
  const generation = typeof req.query.generation === "string" ? req.query.generation : "";
  if (!UUID.test(req.params.id) || !/^\d+$/.test(generation)) {
    return res.status(400).json({ error: "A post id and a numeric generation are required." });
  }

  const post = await prisma.post.findUnique({ where: { id: req.params.id } });
  if (!post?.bodyPath) return res.status(404).json({ error: "Post not found" });

  const rawContent = await readContentAt(post.bodyPath, generation);
  if (rawContent === null) return res.status(404).json({ error: "That revision no longer exists." });

  return res.json({ id: post.id, generation, rawContent });
});
