/**
 * The photo gallery API.
 *
 * Reading is public. Every write requires a signed-in account, and any account may post — so
 * authorization here is about bounding what one account can do rather than about who gets in:
 * uploads are size- and type-capped, writes are quota'd per account, and a post or comment can
 * only be changed by whoever wrote it or by a site moderator.
 */
import { Router, type Request, type Response } from "express";
import express from "express";
import { randomBytes } from "node:crypto";
import { config } from "../AppConfig.js";
import { displayName, getViewer, isSiteOwner, type Viewer } from "../services/IdentityService.js";
import { consumeQuota } from "../services/RateLimitService.js";
import { containerBaseUrl, deleteObject, objectExists, saveBinary } from "../services/StorageService.js";
import {
  deleteSocial,
  getSocial,
  getSocialMany,
  listPosts,
  mediaPath,
  updatePosts,
  updateSocial,
  type PhotoAuthor,
  type PhotoComment,
  type PhotoPost,
} from "../services/PhotoService.js";

export const photosRouter = Router();

const HOUR_MS = 60 * 60 * 1000;

/** Liking is cheap and reversible, so its ceiling only exists to stop a loop from writing forever. */
const LIKES_PER_HOUR = 300;

const MAX_CAPTION_LENGTH = 2200;
const MAX_ALT_LENGTH = 300;
const MAX_COMMENT_LENGTH = 1000;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;
/** Guards against a client claiming absurd intrinsic dimensions for the grid's aspect ratios. */
const MAX_DIMENSION = 20000;

const ID_PATTERN = /^[0-9a-f]{12}$/;
const TAG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

const newId = (): string => randomBytes(6).toString("hex");

const assetUrl = (path: string): string => `${containerBaseUrl}/${path}`;

interface PhotoPostDto extends PhotoPost {
  fullUrl: string;
  thumbUrl: string;
  likeCount: number;
  commentCount: number;
  /** Whether the caller has already liked this post; false for anyone signed out. */
  likedByViewer: boolean;
  /** Whether the caller may edit or delete this post, so the UI need not re-derive the rule. */
  editableByViewer: boolean;
}

interface PhotoDetailDto extends PhotoPostDto {
  comments: (PhotoComment & { deletableByViewer: boolean })[];
}

/** A moderator can remove any post or comment, not only their own. */
const canModify = (viewer: Viewer | undefined, authorId: string): boolean =>
  viewer !== undefined && (viewer.id === authorId || isSiteOwner(viewer));

const authorOf = (viewer: Viewer): PhotoAuthor => ({
  id: viewer.id,
  name: displayName(viewer),
  image: viewer.image,
});

/** Answers 401 and returns undefined when the caller has no session, so routes can return early. */
async function requireViewer(req: Request, res: Response): Promise<Viewer | undefined> {
  const viewer = await getViewer(req);
  if (!viewer) {
    res.status(401).json({ error: "Sign in to do that." });
    return undefined;
  }
  return viewer;
}

function toDto(post: PhotoPost, likes: string[], commentCount: number, viewer: Viewer | undefined): PhotoPostDto {
  return {
    ...post,
    fullUrl: assetUrl(post.full),
    thumbUrl: assetUrl(post.thumb),
    likeCount: likes.length,
    commentCount,
    likedByViewer: viewer !== undefined && likes.includes(viewer.id),
    editableByViewer: canModify(viewer, post.author.id),
  };
}

const readString = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const tags = value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase().replace(/^#/, "").slice(0, MAX_TAG_LENGTH))
    .filter((tag) => TAG_PATTERN.test(tag));

  // Deduplicated, because the same tag twice is a UI slip rather than an intent.
  return [...new Set(tags)].slice(0, MAX_TAGS);
}

function readDimension(value: unknown): number {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(number, MAX_DIMENSION);
}

/**
 * GET /api/photos[?author=<user id>] — the gallery, newest first.
 *
 * The author filter exists ahead of its UI: profiles are moving to per-user subdomains, and scoping
 * a gallery to one person should stay a query against this route rather than a second one.
 */
photosRouter.get("/", async (req, res, next) => {
  try {
    const viewer = await getViewer(req);
    const author = typeof req.query.author === "string" ? req.query.author : "";

    const all = await listPosts();
    const posts = author ? all.filter((post) => post.author.id.toLowerCase() === author) : all;
    const social = await getSocialMany(posts.map((post) => post.id));

    res.json({
      posts: posts.map((post) => {
        const entry = social.get(post.id);
        return toDto(post, entry?.likes ?? [], entry?.comments.length ?? 0, viewer);
      }),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photos/media?variant=full|thumb&id=... — stores one image object and returns where it
 * landed. The body is the raw image: the browser has already resized and re-encoded it, so there is
 * nothing to parse out of a multipart envelope and no image library on this side.
 *
 * The full variant mints the id; the thumbnail is uploaded against that same id, which is what ties
 * the two objects to one post before the post itself exists.
 */
photosRouter.post(
  "/media",
  express.raw({
    type: Object.keys(config.photos.allowedTypes),
    limit: config.photos.maxUploadBytes,
  }),
  async (req, res, next) => {
    try {
      const viewer = await requireViewer(req, res);
      if (!viewer) return;

      const contentType = (req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
      const extension = config.photos.allowedTypes[contentType];

      if (!extension || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(415).json({ error: "Upload a JPEG, PNG, or WebP image as the request body." });
        return;
      }

      // Each post stores two objects, so the byte quota is twice the post quota.
      if (!consumeQuota(`photos:media:${viewer.id}`, config.photos.maxPostsPerHour * 2, HOUR_MS)) {
        res.status(429).json({ error: "Upload limit reached. Try again later." });
        return;
      }

      const variant = req.query.variant === "thumb" ? "thumb" : "full";
      const requestedId = typeof req.query.id === "string" ? req.query.id : "";

      if (variant === "thumb" && !ID_PATTERN.test(requestedId)) {
        res.status(400).json({ error: "A thumbnail upload needs the id its full image returned." });
        return;
      }

      const id = variant === "thumb" ? requestedId : newId();
      const path = mediaPath(id, variant, extension);

      await saveBinary(path, req.body, { contentType });

      res.json({ id, variant, path, url: assetUrl(path) });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/photos — publishes a post for media already uploaded above.
photosRouter.post("/", async (req, res, next) => {
  try {
    const viewer = await requireViewer(req, res);
    if (!viewer) return;

    const id = typeof req.body?.id === "string" ? req.body.id : "";
    if (!ID_PATTERN.test(id)) {
      res.status(400).json({ error: "Invalid photo id." });
      return;
    }

    const full = typeof req.body?.full === "string" ? req.body.full : "";
    const thumb = typeof req.body?.thumb === "string" ? req.body.thumb : "";

    // Paths are accepted only inside this id's own namespace. Without that a caller could publish a
    // post pointing at any other object in the bucket, including one they do not own.
    const expected = new RegExp(`^photos/media/${id}\\.(jpg|png|webp)$`);
    const expectedThumb = new RegExp(`^photos/media/${id}\\.thumb\\.(jpg|png|webp)$`);

    if (!expected.test(full) || !expectedThumb.test(thumb)) {
      res.status(400).json({ error: "full and thumb must be the paths returned by the upload." });
      return;
    }

    if (!(await objectExists(full))) {
      res.status(400).json({ error: "Upload the image before publishing the post." });
      return;
    }

    const now = new Date().toISOString();
    const post: PhotoPost = {
      id,
      full,
      thumb,
      width: readDimension(req.body?.width),
      height: readDimension(req.body?.height),
      caption: readString(req.body?.caption, MAX_CAPTION_LENGTH),
      alt: readString(req.body?.alt, MAX_ALT_LENGTH),
      tags: readTags(req.body?.tags),
      author: authorOf(viewer),
      postedAt: now,
      editedAt: now,
    };

    const posts = await updatePosts((current) => {
      // The id was minted by an upload, so a collision means a replayed request, not a clash.
      if (current.some((existing) => existing.id === id)) return null;
      return [post, ...current];
    });

    if (posts === null) {
      res.status(409).json({ error: "That photo has already been posted." });
      return;
    }

    res.status(201).json(toDto(post, [], 0, viewer));
  } catch (error) {
    next(error);
  }
});

// GET /api/photos/:id — one post with its comments.
photosRouter.get("/:id", async (req, res, next) => {
  try {
    const viewer = await getViewer(req);
    const id = req.params.id;

    const post = (await listPosts()).find((entry) => entry.id === id);
    if (!post) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }

    const social = await getSocial(id);
    const detail: PhotoDetailDto = {
      ...toDto(post, social.likes, social.comments.length, viewer),
      comments: social.comments.map((comment) => ({
        ...comment,
        // A post's author moderates its comments, as well as the comment's own author.
        deletableByViewer:
          canModify(viewer, comment.author.id) || canModify(viewer, post.author.id),
      })),
    };

    res.json(detail);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/photos/:id — caption, alt text, and tags. The image itself is immutable.
photosRouter.patch("/:id", async (req, res, next) => {
  try {
    const viewer = await requireViewer(req, res);
    if (!viewer) return;

    const id = req.params.id;
    let forbidden = false;

    const posts = await updatePosts((current) => {
      const index = current.findIndex((entry) => entry.id === id);
      if (index < 0) return null;

      const existing = current[index]!;
      if (!canModify(viewer, existing.author.id)) {
        forbidden = true;
        return null;
      }

      const next = [...current];
      next[index] = {
        ...existing,
        caption: readString(req.body?.caption, MAX_CAPTION_LENGTH),
        alt: readString(req.body?.alt, MAX_ALT_LENGTH),
        tags: readTags(req.body?.tags),
        editedAt: new Date().toISOString(),
      };
      return next;
    });

    if (forbidden) {
      res.status(403).json({ error: "That is not your photo." });
      return;
    }
    if (posts === null) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }

    const social = await getSocial(id);
    res.json(toDto(posts.find((entry) => entry.id === id)!, social.likes, social.comments.length, viewer));
  } catch (error) {
    next(error);
  }
});

// DELETE /api/photos/:id — drops the post, then the objects behind it.
photosRouter.delete("/:id", async (req, res, next) => {
  try {
    const viewer = await requireViewer(req, res);
    if (!viewer) return;

    const id = req.params.id;
    let forbidden = false;
    let removed: PhotoPost | undefined;

    const posts = await updatePosts((current) => {
      const existing = current.find((entry) => entry.id === id);
      if (!existing) return null;

      if (!canModify(viewer, existing.author.id)) {
        forbidden = true;
        return null;
      }

      removed = existing;
      return current.filter((entry) => entry.id !== id);
    });

    if (forbidden) {
      res.status(403).json({ error: "That is not your photo." });
      return;
    }
    if (posts === null || !removed) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }

    // The manifest is the source of truth, so it is updated first: a leftover object is invisible,
    // whereas a manifest entry whose image is gone is a broken tile in the grid.
    await Promise.all([deleteObject(removed.full), deleteObject(removed.thumb), deleteSocial(id)]);

    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

// POST /api/photos/:id/like — toggles the caller's like.
photosRouter.post("/:id/like", async (req, res, next) => {
  try {
    const viewer = await requireViewer(req, res);
    if (!viewer) return;

    const id = req.params.id;
    if (!(await listPosts()).some((post) => post.id === id)) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }

    if (!consumeQuota(`photos:like:${viewer.id}`, LIKES_PER_HOUR, HOUR_MS)) {
      res.status(429).json({ error: "Too many likes. Try again later." });
      return;
    }

    const social = await updateSocial(id, (current) => ({
      ...current,
      likes: current.likes.includes(viewer.id)
        ? current.likes.filter((likedBy) => likedBy !== viewer.id)
        : [...current.likes, viewer.id],
    }));

    res.json({
      likeCount: social?.likes.length ?? 0,
      likedByViewer: social?.likes.includes(viewer.id) ?? false,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/photos/:id/comments
photosRouter.post("/:id/comments", async (req, res, next) => {
  try {
    const viewer = await requireViewer(req, res);
    if (!viewer) return;

    const id = req.params.id;
    if (!(await listPosts()).some((post) => post.id === id)) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }

    const body = readString(req.body?.body, MAX_COMMENT_LENGTH);
    if (!body) {
      res.status(400).json({ error: "A comment needs some text." });
      return;
    }

    if (!consumeQuota(`photos:comment:${viewer.id}`, config.photos.maxCommentsPerHour, HOUR_MS)) {
      res.status(429).json({ error: "Comment limit reached. Try again later." });
      return;
    }

    const comment: PhotoComment = {
      id: newId(),
      author: authorOf(viewer),
      body,
      postedAt: new Date().toISOString(),
    };

    const social = await updateSocial(id, (current) => ({
      ...current,
      comments: [...current.comments, comment],
    }));

    res.status(201).json({ comment, commentCount: social?.comments.length ?? 1 });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/photos/:id/comments/:commentId
photosRouter.delete("/:id/comments/:commentId", async (req, res, next) => {
  try {
    const viewer = await requireViewer(req, res);
    if (!viewer) return;

    const { id, commentId } = req.params;

    const post = (await listPosts()).find((entry) => entry.id === id);
    if (!post) {
      res.status(404).json({ error: "Photo not found." });
      return;
    }

    let forbidden = false;
    let missing = false;

    const social = await updateSocial(id, (current) => {
      const comment = current.comments.find((entry) => entry.id === commentId);
      if (!comment) {
        missing = true;
        return null;
      }

      if (!canModify(viewer, comment.author.id) && !canModify(viewer, post.author.id)) {
        forbidden = true;
        return null;
      }

      return { ...current, comments: current.comments.filter((entry) => entry.id !== commentId) };
    });

    if (forbidden) {
      res.status(403).json({ error: "That is not your comment." });
      return;
    }
    if (missing || social === null) {
      res.status(404).json({ error: "Comment not found." });
      return;
    }

    res.json({ commentCount: social.comments.length });
  } catch (error) {
    next(error);
  }
});
