import { readErrorMessage } from "./api";
import { apiUrl } from "./config";
import type { AdminDashboard } from "./types";

export async function fetchAdminDashboard(query = ""): Promise<AdminDashboard> {
  const search = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const response = await fetch(apiUrl(`/api/admin${search}`), { credentials: "include" });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as AdminDashboard;
}

export async function revokeAdminUserSessions(userId: string): Promise<boolean> {
  const response = await fetch(
    apiUrl(`/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`),
    { method: "POST", credentials: "include" }
  );
  if (!response.ok) throw new Error(await readErrorMessage(response));
  const result = (await response.json()) as { signedOutCurrentAccount?: boolean };
  return result.signedOutCurrentAccount === true;
}

export async function deleteAdminUser(userId: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(userId)}`), {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}
