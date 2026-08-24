import type { BoardSummary, ProfileLayout } from "../Types/TypeRegistry";
import { readErrorMessage } from "./ContentApiService";
import { apiUrl } from "./AppConfig";

const send = (init: RequestInit = {}): RequestInit => ({ credentials: "include", ...init });

async function json<T>(pending: Response | Promise<Response>): Promise<T> {
  const response = await pending;
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as T;
}

export async function fetchBoards(options: {
  feed?: "home" | "explore";
  sort?: "trending" | "recent" | "random";
  limit?: number;
} = {}): Promise<BoardSummary[]> {
  const query = new URLSearchParams();
  if (options.feed) query.set("feed", options.feed);
  if (options.sort) query.set("sort", options.sort);
  if (options.limit) query.set("limit", String(options.limit));
  const suffix = query.size ? `?${query.toString()}` : "";
  const result = await json<{ boards: BoardSummary[] }>(
    await fetch(apiUrl(`/api/boards${suffix}`), send()),
  );
  return result.boards;
}

export async function fetchMyBoards(): Promise<BoardSummary[]> {
  const result = await json<{ boards: BoardSummary[] }>(
    await fetch(apiUrl("/api/boards/mine"), send()),
  );
  return result.boards;
}

export const fetchMyBoard = (id: string): Promise<BoardSummary> =>
  json(fetch(apiUrl(`/api/boards/mine/${encodeURIComponent(id)}`), send()));

export const fetchPrimaryBoard = (handle: string): Promise<BoardSummary> =>
  json(fetch(apiUrl(`/api/boards/primary/${encodeURIComponent(handle)}`), send()));

export const fetchBoard = (handle: string, slug: string): Promise<BoardSummary> =>
  json(fetch(apiUrl(`/api/boards/by/${encodeURIComponent(handle)}/${encodeURIComponent(slug)}`), send()));

export async function createBoard(data: {
  title: string;
  slug: string;
  description?: string;
  layout?: ProfileLayout;
  published?: boolean;
  isPrimary?: boolean;
}): Promise<BoardSummary> {
  return json(
    fetch(apiUrl("/api/boards"), send({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })),
  );
}

export async function updateBoard(id: string, data: {
  title?: string;
  slug?: string;
  description?: string;
  layout?: ProfileLayout;
  published?: boolean;
  isPrimary?: boolean;
}): Promise<BoardSummary> {
  return json(
    fetch(apiUrl(`/api/boards/${encodeURIComponent(id)}`), send({
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })),
  );
}

export async function deleteBoard(id: string): Promise<void> {
  const response = await fetch(
    apiUrl(`/api/boards/${encodeURIComponent(id)}`),
    send({ method: "DELETE" }),
  );
  if (!response.ok) throw new Error(await readErrorMessage(response));
}
