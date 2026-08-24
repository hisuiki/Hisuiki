/**
 * Where post and page bodies live: the data bucket, not a database column.
 *
 * The reasoning is the bucket's, not the database's. Object versioning gives every edit a history
 * for free, which is what a database column would have to reimplement with a revisions table. And a
 * user's writing stays a file they can fetch, keep, or take elsewhere, rather than a row only this
 * application can read. Postgres keeps the pointer and the metadata worth querying — author, slug,
 * timestamps, counts — so a feed never touches the bucket.
 *
 * Paths follow {userId}/{kind}/{id}.md, so everything one account owns shares a prefix and deleting
 * that account is a prefix delete rather than a search.
 */
import { config } from "../AppConfig.js";
import {
  deleteObject,
  getTextAtGeneration,
  getTextFromBucket,
  listVersionsInBucket,
  saveTextToBucket,
  type ObjectVersion,
} from "./StorageService.js";

export type ContentKind = "posts" | "pages";

/** Object path for one piece of authored content. */
export const contentPath = (userId: string, kind: ContentKind, id: string): string =>
  `${userId}/${kind}/${id}.md`;

/** Everything one account owns, for account deletion. */
export const userPrefix = (userId: string): string => `${userId}/`;

export interface SaveContentOptions {
  userId: string;
  kind: ContentKind;
  id: string;
  markdown: string;
  /** Shown in the edit history beside the version it produced. */
  message?: string;
  authorName?: string;
}

/**
 * Writes a body and returns its path. The author and message ride along as custom metadata, which
 * is what lets the history list say who changed what — a bare object generation carries neither.
 */
export async function saveContent(options: SaveContentOptions): Promise<string> {
  const path = contentPath(options.userId, options.kind, options.id);

  await saveTextToBucket(config.storage.dataBucketName, path, options.markdown, {
    contentType: "text/markdown; charset=utf-8",
    // Authored content changes on the author's schedule, and an edit should be visible promptly.
    cacheControl: "private, max-age=0, must-revalidate",
    customMetadata: {
      editorId: options.userId,
      editorName: options.authorName ?? "",
      commitMessage: options.message ?? "",
      editedAt: new Date().toISOString(),
    },
  });

  return path;
}

/** The current source, or null when the object is missing. */
export async function readContent(path: string): Promise<string | null> {
  return getTextFromBucket(config.storage.dataBucketName, path);
}

/** One stored generation, for the history view's side-by-side. */
export async function readContentAt(path: string, generation: string): Promise<string | null> {
  return getTextAtGeneration(config.storage.dataBucketName, path, generation);
}

/** Every stored generation of a body, newest first. */
export async function listContentVersions(path: string): Promise<ObjectVersion[]> {
  return listVersionsInBucket(config.storage.dataBucketName, path);
}

export async function deleteContent(path: string): Promise<void> {
  await deleteObject(path, config.storage.dataBucketName);
}
