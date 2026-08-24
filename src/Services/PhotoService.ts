import { getSiteHandle } from "./AppRouter";
import { readErrorMessage } from "./ContentApiService";
import { apiUrl } from "./AppConfig";
import type { PhotoComment, PhotoDetail, PhotoPost } from "../Types/TypeRegistry";

/**
 * Client for the photo gallery API.
 *
 * Every call sends credentials, reads included — not because reading needs an account, but because
 * whether the viewer has liked a photo or may edit it is part of the response, and the server can
 * only answer that if the session cookie comes along.
 */

/** Shared by every request here, so no call site can forget the cookie. */
const send = (init: RequestInit = {}): RequestInit => ({ credentials: "include", ...init });

const jsonInit = (method: string, body: unknown): RequestInit =>
  send({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as T;
}


export async function fetchPhotos(author?: string): Promise<PhotoPost[]> {
  const finalAuthor = author ?? getSiteHandle();
  const query = finalAuthor ? `?author=${encodeURIComponent(finalAuthor)}` : "";
  const response = await fetch(apiUrl(`/api/photos${query}`), send());
  const body = await readJson<{ posts: PhotoPost[] }>(response);
  return body.posts ?? [];
}

export async function fetchPhoto(id: string): Promise<PhotoDetail> {
  const response = await fetch(apiUrl(`/api/photos/${encodeURIComponent(id)}`), send());
  return readJson<PhotoDetail>(response);
}

export interface UploadedMedia {
  id: string;
  path: string;
  url: string;
}

/**
 * Sends one already-resized image as the raw request body. The full variant mints the id that ties
 * both objects to the post; the thumbnail is uploaded against that same id.
 */
export async function uploadMedia(
  blob: Blob,
  variant: "full" | "thumb",
  id?: string
): Promise<UploadedMedia> {
  const query = new URLSearchParams({ variant });
  if (id) query.set("id", id);

  const response = await fetch(
    apiUrl(`/api/photos/media?${query.toString()}`),
    // The blob's own type is the Content-Type: it is what the API matches against its allow-list.
    send({ method: "POST", headers: { "Content-Type": blob.type }, body: blob })
  );
  return readJson<UploadedMedia>(response);
}

export interface PhotoDraft {
  caption: string;
  alt: string;
  tags: string[];
}

export async function createPhoto(
  body: PhotoDraft & { id: string; full: string; thumb: string; width: number; height: number }
): Promise<PhotoPost> {
  const response = await fetch(apiUrl("/api/photos"), jsonInit("POST", body));
  return readJson<PhotoPost>(response);
}

export async function updatePhoto(id: string, body: PhotoDraft): Promise<PhotoPost> {
  const response = await fetch(apiUrl(`/api/photos/${encodeURIComponent(id)}`), jsonInit("PATCH", body));
  return readJson<PhotoPost>(response);
}

export async function deletePhoto(id: string): Promise<void> {
  const response = await fetch(
    apiUrl(`/api/photos/${encodeURIComponent(id)}`),
    send({ method: "DELETE" })
  );
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export async function toggleLike(id: string): Promise<{ likeCount: number; likedByViewer: boolean }> {
  const response = await fetch(
    apiUrl(`/api/photos/${encodeURIComponent(id)}/like`),
    send({ method: "POST" })
  );
  return readJson<{ likeCount: number; likedByViewer: boolean }>(response);
}

export async function addComment(
  id: string,
  body: string
): Promise<{ comment: PhotoComment; commentCount: number }> {
  const response = await fetch(
    apiUrl(`/api/photos/${encodeURIComponent(id)}/comments`),
    jsonInit("POST", { body })
  );
  return readJson<{ comment: PhotoComment; commentCount: number }>(response);
}

export async function deleteComment(
  id: string,
  commentId: string
): Promise<{ commentCount: number }> {
  const response = await fetch(
    apiUrl(`/api/photos/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`),
    send({ method: "DELETE" })
  );
  return readJson<{ commentCount: number }>(response);
}

/** "/photos/ab12cd34ef56" — the permalink for one post, in the current language. */
export const photoRoute = (id: string, japanese: boolean): string =>
  japanese ? `/photos/${id}/ja` : `/photos/${id}`;

/** "Aug 21, 2026" — matches the date format the markdown pages already show. */
export function formatPhotoDate(iso: string, japanese: boolean): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(japanese ? "ja-JP" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
