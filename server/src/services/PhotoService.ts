/**
 * The photo gallery's data layer, backed by the Post / PostMedia / Like / Comment tables.
 *
 * Before August 2026 this was a JSON-in-the-bucket store (photos/index.json and
 * photos/social/*.json). The interfaces and function signatures are unchanged so that
 * routes/photos.ts required no edits — only the bodies moved from bucket read-modify-write
 * loops to Prisma queries.
 */
import { prisma } from "./PrismaService.js";
import { readContent, saveContent } from "./ContentService.js";

export interface PhotoAuthor {
  id: string;
  name: string;
  image: string;
}

export interface PhotoPost {
  id: string;
  full: string;
  thumb: string;
  width: number;
  height: number;
  caption: string;
  alt: string;
  tags: string[];
  author: PhotoAuthor;
  postedAt: string;
  editedAt: string;
}

export interface PhotoComment {
  id: string;
  author: PhotoAuthor;
  body: string;
  postedAt: string;
}

export interface PhotoSocial {
  likes: string[];
  comments: PhotoComment[];
}

export const MEDIA_PREFIX = "photos/media";
export const mediaPath = (id: string, variant: "full" | "thumb", ext: string): string =>
  `${MEDIA_PREFIX}/${id}${variant === "thumb" ? ".thumb" : ""}.${ext}`;

export async function listPosts(): Promise<PhotoPost[]> {
  const posts = await prisma.post.findMany({
    where: { media: { some: {} } },
    include: { author: true, media: true },
    orderBy: { publishedAt: "desc" },
  });

  // Captions live in the bucket with every other body. Fetched together rather than per row, so a
  // gallery of fifty costs fifty parallel reads instead of fifty sequential ones.
  const captions = new Map<string, string>(
    await Promise.all(
      posts.map(async (p) =>
        [p.id, p.bodyPath ? ((await readContent(p.bodyPath)) ?? "") : ""] as [string, string]
      )
    )
  );

  return posts.map((p) => {
    const media = p.media[0];
    return {
      id: p.id,
      full: media?.path ?? "",
      thumb: media?.thumbPath ?? "",
      width: media?.width ?? 0,
      height: media?.height ?? 0,
      caption: captions.get(p.id) ?? "",
      alt: media?.alt ?? "",
      tags: [],
      author: {
        id: p.author.id,
        name: p.author.name,
        image: p.author.image ?? "",
      },
      postedAt: (p.publishedAt ?? p.createdAt).toISOString(),
      editedAt: p.updatedAt.toISOString(),
    };
  });
}

export async function getPost(id: string): Promise<PhotoPost | null> {
  const posts = await listPosts();
  return posts.find((p) => p.id === id) ?? null;
}

export async function updatePosts(
  mutate: (posts: PhotoPost[]) => PhotoPost[] | null
): Promise<PhotoPost[] | null> {
  const current = await listPosts();
  const next = mutate(current);
  if (next === null) return null;

  // Diffing
  const currentById = new Map(current.map((p) => [p.id, p]));
  const nextById = new Map(next.map((p) => [p.id, p]));

  for (const nextPost of next) {
    const existing = currentById.get(nextPost.id);
    if (!existing) {
      // Create
      await prisma.post.create({
        data: {
          id: nextPost.id,
          authorId: nextPost.author.id,
          bodyPath: await saveContent({
            userId: nextPost.author.id,
            kind: "posts",
            id: nextPost.id,
            markdown: nextPost.caption,
            message: "Posted",
          }),
          publishedAt: new Date(nextPost.postedAt),
          createdAt: new Date(nextPost.postedAt),
          updatedAt: new Date(nextPost.editedAt),
          media: {
            create: {
              id: nextPost.id,
              path: nextPost.full,
              thumbPath: nextPost.thumb,
              width: nextPost.width,
              height: nextPost.height,
              alt: nextPost.alt,
            },
          },
        },
      });
    } else {
      // Check for updates
      if (
        existing.caption !== nextPost.caption ||
        existing.alt !== nextPost.alt
      ) {
        await prisma.post.update({
          where: { id: nextPost.id },
          data: {
            bodyPath: await saveContent({
              userId: nextPost.author.id,
              kind: "posts",
              id: nextPost.id,
              markdown: nextPost.caption,
              message: "Edited",
            }),
            updatedAt: new Date(nextPost.editedAt),
            media: {
              update: {
                where: { id: nextPost.id },
                data: { alt: nextPost.alt },
              },
            },
          },
        });
      }
    }
  }

  for (const currentPost of current) {
    if (!nextById.has(currentPost.id)) {
      // Delete
      await prisma.post.delete({ where: { id: currentPost.id } }).catch(() => {});
    }
  }

  return next;
}

export async function getSocial(id: string): Promise<PhotoSocial> {
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      likes: true,
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!post) return { likes: [], comments: [] };

  return {
    likes: post.likes.map((l) => l.userId),
    comments: post.comments.map((c) => ({
      id: c.id,
      author: {
        id: c.author.id,
        name: c.author.name,
        image: c.author.image ?? "",
      },
      body: c.body,
      postedAt: c.createdAt.toISOString(),
    })),
  };
}

export async function getSocialMany(ids: string[]): Promise<Map<string, PhotoSocial>> {
  const posts = await prisma.post.findMany({
    where: { id: { in: ids } },
    include: {
      likes: true,
      comments: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });

  const map = new Map<string, PhotoSocial>();
  for (const id of ids) map.set(id, { likes: [], comments: [] });

  for (const post of posts) {
    map.set(post.id, {
      likes: post.likes.map((l) => l.userId),
      comments: post.comments.map((c) => ({
        id: c.id,
        author: {
          id: c.author.id,
          name: c.author.name,
          image: c.author.image ?? "",
        },
        body: c.body,
        postedAt: c.createdAt.toISOString(),
      })),
    });
  }
  return map;
}

export async function updateSocial(
  id: string,
  mutate: (current: PhotoSocial) => PhotoSocial | null
): Promise<PhotoSocial | null> {
  const current = await getSocial(id);
  const next = mutate(current);
  if (next === null) return null;

  // Diff likes
  const currentLikes = new Set(current.likes);
  const nextLikes = new Set(next.likes);

  for (const userId of nextLikes) {
    if (!currentLikes.has(userId)) {
      await prisma.like.create({ data: { userId, postId: id } }).catch(() => {});
    }
  }
  for (const userId of currentLikes) {
    if (!nextLikes.has(userId)) {
      await prisma.like.delete({ where: { userId_postId: { userId, postId: id } } }).catch(() => {});
    }
  }

  // Diff comments
  const currentCommentsById = new Map(current.comments.map((c) => [c.id, c]));
  const nextCommentsById = new Map(next.comments.map((c) => [c.id, c]));

  for (const nextComment of next.comments) {
    if (!currentCommentsById.has(nextComment.id)) {
      await prisma.comment.create({
        data: {
          id: nextComment.id,
          postId: id,
          authorId: nextComment.author.id,
          body: nextComment.body,
          createdAt: new Date(nextComment.postedAt),
        },
      }).catch(() => {});
    }
  }

  for (const currentComment of current.comments) {
    if (!nextCommentsById.has(currentComment.id)) {
      await prisma.comment.delete({ where: { id: currentComment.id } }).catch(() => {});
    }
  }

  return next;
}

export async function deleteSocial(_id: string): Promise<void> {
  // Prisma onDelete: Cascade handles likes and comments when the post is deleted.
  // Wait, deleteSocial is called by the route after updatePosts deletes the post!
  // If the post is already deleted, Cascade has already removed likes and comments.
  // So this can be a no-op!
}
