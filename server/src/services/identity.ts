/**
 * Who is calling, for every route that needs to know.
 *
 * One module, so the rest of the API never imports better-auth directly and a future change of
 * provider stays contained here. `Viewer` is deliberately the smallest shape the app uses: an
 * identity to attribute content to, not the auth library's full session object.
 */
import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { config } from "../config.js";
import { auth } from "./auth.js";

export interface Viewer {
  id: string;
  name: string;
  email: string;
  /** Avatar URL. Empty when the account has none — a local sign-up usually will not. */
  image: string;
}

/** Resolves the session cookie on the request, or undefined when there is no valid session. */
export async function getViewer(req: Request): Promise<Viewer | undefined> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) return undefined;

  const { id, name, email, image } = session.user;
  return { id, name: name ?? "", email: email ?? "", image: image ?? "" };
}

/**
 * Site moderators, by email address rather than by provider account: someone signing in with
 * Google and someone signing in with GitHub are the same person, and the address is what both
 * providers agree on.
 */
export function isSiteOwner(viewer: Viewer | undefined): boolean {
  return viewer !== undefined && isSiteOwnerEmail(viewer.email);
}

/** Same ownership check for stored users, where constructing a request Viewer would be misleading. */
export function isSiteOwnerEmail(email: string): boolean {
  return Boolean(email) && config.auth.ownerEmails.includes(email.toLowerCase());
}

/** The display name to attribute content to, falling back to the local part of their address. */
export const displayName = (viewer: Viewer): string =>
  viewer.name.trim() || viewer.email.split("@")[0] || "someone";
