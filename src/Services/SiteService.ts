import { apiUrl } from "./AppConfig";
import type { ProfileLayout } from "../Types/TypeRegistry";

const send = (init: RequestInit = {}): RequestInit => ({ credentials: "include", ...init });

export interface SiteInfo {
  socialProviders: string[];
  isOwner: boolean;
}

export interface SiteDefaults {
  layout: ProfileLayout | null;
  publishedAt: string | null;
}

export type SitePageName = "home" | "explore" | "about";

export interface SitePageLayout {
  board: { id: string; title: string; updatedAt: string } | null;
  layout: ProfileLayout | null;
  source: "override" | "system" | "fallback";
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

export async function fetchSitePage(page: SitePageName): Promise<SitePageLayout> {
  const res = await fetch(apiUrl(`/api/site/pages/${page}`), send());
  if (!res.ok) throw new Error(`Could not read the ${page} board`);
  return (await res.json()) as SitePageLayout;
}
