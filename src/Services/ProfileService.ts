import { apiUrl } from "./AppConfig";
import type { ProfileData } from "../Types/TypeRegistry";
import { readErrorMessage } from "./ContentApiService";

const send = (init: RequestInit = {}): RequestInit => ({ credentials: "include", ...init });

const jsonInit = (method: string, body: unknown): RequestInit =>
  send({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return (await response.json()) as T;
}

export async function fetchMyProfile(): Promise<ProfileData> {
  const response = await fetch(apiUrl("/api/profile/me"), send());
  return readJson<ProfileData>(response);
}

export async function updateMyProfile(data: Partial<ProfileData>): Promise<ProfileData> {
  const response = await fetch(apiUrl("/api/profile/me"), jsonInit("PUT", data));
  return readJson<ProfileData>(response);
}

export async function fetchProfile(handle: string): Promise<ProfileData> {
  const response = await fetch(apiUrl(`/api/profile/${encodeURIComponent(handle)}`), send());
  return readJson<ProfileData>(response);
}
