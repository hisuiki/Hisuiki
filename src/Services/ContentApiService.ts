import { apiUrl } from "./AppConfig";
import type { ArticleMetadata, Page, PageRaw, PageRevision, PostSummary } from "../Types/TypeRegistry";

/** The API's problem document if there is one, so the UI can show why a write was refused. */
export async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // Not a JSON problem document — fall through to the status code below.
  }
  return `HTTP ${response.status}`;
}

export async function fetchPage(slug: string, isHome: boolean, author?: string): Promise<Page> {
  const response = await fetch(apiUrl(`/api/posts/resolve?slug=${encodeURIComponent(slug)}&isHome=${isHome}${author ? `&author=${encodeURIComponent(author)}` : ""}`));
  if (!response.ok) throw new Error(`Could not load '${slug}' (HTTP ${response.status})`);
  return (await response.json()) as Page;
}

export async function fetchArticles(author?: string): Promise<ArticleMetadata[]> {
  const response = await fetch(apiUrl(`/api/posts/articles${author ? `?author=${encodeURIComponent(author)}` : ""}`));
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as ArticleMetadata[];
}

/** Renders arbitrary markdown through the same pipeline as a live page, so Preview matches exactly. */
export async function previewMarkdown(markdown: string): Promise<string> {
  const response = await fetch(apiUrl("/api/pages/preview"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const result = (await response.json()) as { html: string };
  return result.html ?? "";
}

export async function fetchRawPage(slug: string, isHome: boolean, author?: string): Promise<PageRaw> {
  const response = await fetch(apiUrl(`/api/posts/raw?slug=${encodeURIComponent(slug)}&isHome=${isHome}${author ? `&author=${encodeURIComponent(author)}` : ""}`));
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as PageRaw;
}

/**
 * Saves markdown straight to the bucket. `commitMessage` is not ceremony left over from the pull
 * request flow: it is stored on the object and is what gives each revision a label in the history.
 */
export async function savePage(body: {
  path: string;
  content: string;
  commitMessage: string;
  description: string;
}): Promise<void> {
  const response = await fetch(apiUrl("/api/pages"), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

/** Every stored revision of a page, newest first. */
export async function fetchPageHistory(path: string): Promise<PageRevision[]> {
  const response = await fetch(apiUrl(`/api/pages/history?path=${encodeURIComponent(path)}`));
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as PageRevision[];
}

/** The stored bytes of one revision. */
export async function fetchPageVersion(path: string, generation: string): Promise<string> {
  const response = await fetch(
    apiUrl(`/api/pages/version?path=${encodeURIComponent(path)}&generation=${encodeURIComponent(generation)}`)
  );
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const body = (await response.json()) as { rawContent: string };
  return body.rawContent ?? "";
}

export async function createPost(body: {
  title?: string;
  slug?: string;
  body: string;
}): Promise<PostSummary> {
  const response = await fetch(apiUrl("/api/posts"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as PostSummary;
}

export async function updatePost(id: string, body: {
  title?: string;
  slug?: string;
  body: string;
}): Promise<PostSummary> {
  const response = await fetch(apiUrl(`/api/posts/${id}`), {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as PostSummary;
}

/**
 * The feed. `author` scopes it to one profile, `kind: "media"` to posts carrying images — the media
 * tab is this same route rather than a second one, because a media post is a post.
 */
export async function fetchFeed(
  options: { author?: string; kind?: "media"; sort?: "recent" } = {}
): Promise<PostSummary[]> {
  const query = new URLSearchParams();
  if (options.author) query.set("author", options.author);
  if (options.kind) query.set("kind", options.kind);
  // Explore asks for this: the plain reverse-chronological view, outside whatever home ranks.
  if (options.sort) query.set("sort", options.sort);

  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(apiUrl(`/api/posts${suffix}`), { credentials: "include" });
  if (!response.ok) throw new Error(await readErrorMessage(response));

  const body = (await response.json()) as { posts?: PostSummary[] };
  return body.posts ?? [];
}
