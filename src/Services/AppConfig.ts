// Baked in by Vite at build time.
//
// API_BASE_URL is empty in development so Vite's /api proxy keeps the browser same-origin, which
// keeps CORS and the OAuth redirect allow-list free of dev entries. In production it names the API
// host, because the frontend and the API are separate Cloud Run services on separate domains — so
// every authenticated call must send credentials, and the API must allow this origin by name.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

/**
 * Where images and published markdown are served from. Always set by the build — the deploy
 * workflow passes it, and both compose stacks set it to the local emulator. The literal is only a
 * last resort for a build that supplies nothing, and is deliberately the one host that is a CDN
 * rather than an app origin, so a missing variable degrades to slow rather than to broken.
 */
export const ASSET_BASE_URL = (
  import.meta.env.VITE_ASSET_BASE_URL ?? "https://cdn.hisuiki.com/static"
).replace(/\/+$/, "");

/** Absolute URL for a Server API path, e.g. apiUrl("/api/pages?path=README.md"). */
export const apiUrl = (path: string): string =>
  `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/** CDN/blob URL for a static asset, e.g. assetUrl("pfp.jpg"). */
export const assetUrl = (path: string): string =>
  `${ASSET_BASE_URL}/${path.replace(/^\/+/, "")}`;
