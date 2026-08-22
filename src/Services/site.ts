import { apiUrl } from "./config";
import type { ProfileLayout } from "../Types";

const send = (init: RequestInit = {}): RequestInit => ({ credentials: "include", ...init });

export interface SiteInfo {
  socialProviders: string[];
  isOwner: boolean;
}

export interface SiteDefaults {
  layout: ProfileLayout | null;
  publishedAt: string | null;
}

export async function fetchSite(): Promise<SiteInfo> {
  const res = await fetch(apiUrl("/api/site"), send());
  if (!res.ok) throw new Error("Could not read site settings");
  return (await res.json()) as SiteInfo;
}

export async function fetchSiteDefaults(): Promise<SiteDefaults> {
  const res = await fetch(apiUrl("/api/site/defaults"), send());
  if (!res.ok) throw new Error("Could not read the published layout");
  return (await res.json()) as SiteDefaults;
}

export async function publishSiteDefaults(layout: ProfileLayout): Promise<SiteDefaults> {
  const res = await fetch(
    apiUrl("/api/site/defaults"),
    send({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout }) }),
  );
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not publish");
  return (await res.json()) as SiteDefaults;
}

export async function clearSiteDefaults(): Promise<SiteDefaults> {
  const res = await fetch(apiUrl("/api/site/defaults"), send({ method: "DELETE" }));
  if (!res.ok) throw new Error("Could not clear the published layout");
  return (await res.json()) as SiteDefaults;
}
