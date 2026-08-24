import type { BoardSummary } from "../Types/TypeRegistry";
import { readErrorMessage } from "./ContentApiService";
import { apiUrl } from "./AppConfig";
import type { SitePageName } from "./SiteService";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  createdAt: string;
  profile: { handle: string | null } | null;
  isOwner: boolean;
  _count: { boards: number; posts: number; comments: number };
}

export type AdminBoard = Omit<BoardSummary, "owner" | "layout"> & {
  owner: BoardSummary["owner"] & { email: string };
};

export interface AdminSnapshot {
  users: AdminUser[];
  boards: AdminBoard[];
  stats: { users: number; boards: number; posts: number };
}

const send = (init: RequestInit = {}): RequestInit => ({ credentials: "include", ...init });

async function json<T>(pending: Promise<Response>): Promise<T> {
  const response = await pending;
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as T;
}

export const fetchAdmin = (): Promise<AdminSnapshot> =>
  json(fetch(apiUrl("/api/admin"), send()));

export const updateAdminBoard = (
  id: string,
  data: { published?: boolean; sitePage?: SitePageName | null },
): Promise<AdminBoard> =>
  json(fetch(apiUrl(`/api/admin/boards/${encodeURIComponent(id)}`), send({
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })));

async function remove(path: string): Promise<void> {
  const response = await fetch(apiUrl(path), send({ method: "DELETE" }));
  if (!response.ok) throw new Error(await readErrorMessage(response));
}

export const deleteAdminBoard = (id: string): Promise<void> =>
  remove(`/api/admin/boards/${encodeURIComponent(id)}`);

export const deleteAdminUser = (id: string): Promise<void> =>
  remove(`/api/admin/users/${encodeURIComponent(id)}`);
