import { createAuthClient } from "better-auth/react";
import { API_BASE_URL } from "./AppConfig";

/**
 * The better-auth browser client.
 *
 * In production the API is a different origin (api.hisuiki.com against hisuiki.com), so every
 * request has to carry credentials explicitly — without that the browser omits the session cookie
 * and the app looks permanently signed out. In development API_BASE_URL is empty and Vite's proxy
 * keeps everything same-origin, where the same setting is simply a no-op.
 */
export const authClient = createAuthClient({
  baseURL: API_BASE_URL || window.location.origin,
  fetchOptions: { credentials: "include" },
});
