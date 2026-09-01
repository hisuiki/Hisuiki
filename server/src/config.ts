/**
 * Runtime configuration, read once at startup. No storage credential: the API reaches GCS through
 * Application Default Credentials, so there is no key to leak.
 */

const env = (name: string, fallback = ""): string => process.env[name]?.trim() || fallback;

/** Object-name prefix every piece of content sits under, e.g. "static". */
const prefix = env("GCS_PREFIX", "static").replace(/^\/+|\/+$/g, "");

const cdnBaseUrl = env("CDN_BASE_URL").replace(/\/+$/, "");

/** Terraform creates placeholder secret versions so Cloud Run can start before OAuth setup. */
const oauthProvider = (clientIdName: string, clientSecretName: string) => {
  const clientId = env(clientIdName);
  const clientSecret = env(clientSecretName);
  return {
    clientId,
    clientSecret,
    configured:
      Boolean(clientId && clientSecret) &&
      !clientSecret.startsWith("placeholder-replace-with-real-"),
  } as const;
};

/**
 * Which half of the application this process serves. The frontend and the API run as separate Cloud
 * Run services on separate hostnames, from one image: "web" mounts the built React bundle, "api"
 * mounts the Express routes, and "combined" — the default — mounts both, which is what local
 * development and a single-origin deployment want.
 */
const role = env("APP_ROLE", "combined");

export const config = {
  port: Number(env("PORT", "8080")),

  role,
  servesApi: role === "api" || role === "combined",
  servesWeb: role === "web" || role === "combined",

  storage: {
    bucketName: env("GCS_BUCKET"),
    prefix,

    /**
     * Public base URL rendered markdown points its assets at. Falls back to storage.googleapis.com
     * when no CDN host is configured, so a local run still resolves images.
     */
    baseUrl: cdnBaseUrl
      ? `${cdnBaseUrl}/${prefix}`
      : `https://storage.googleapis.com/${env("GCS_BUCKET")}/${prefix}`,

    /** Maps a logical page path ("blog/welcome.md") to its full object name. */
    objectName: (path: string): string => {
      const clean = path.replace(/^\/+/, "");
      return prefix ? `${prefix}/${clean}` : clean;
    },

    /** Inverse of objectName: full object name back to a logical page path. */
    pagePath: (objectName: string): string =>
      prefix && objectName.startsWith(`${prefix}/`) ? objectName.slice(prefix.length + 1) : objectName,
  },

  database: {
    /** Postgres connection string. On Cloud Run this points at the Cloud SQL unix socket. */
    url: env("DATABASE_URL"),
  },

  auth: {
    appName: env("AUTH_APP_NAME", "Hisuiki"),

    /**
     * Public origin better-auth builds its callback URLs from. It must match what is registered
     * with GitHub and Google, so it is configured rather than reflected from the request host.
     */
    baseUrl: env("BETTER_AUTH_URL"),

    /** Signs session cookies. From Secret Manager in production; never a literal here. */
    secret: env("BETTER_AUTH_SECRET"),

    /**
     * Domain the session cookie is scoped to, e.g. ".hisuiki.com". Needed because the API is served
     * from api.hisuiki.com while the frontend sits on hisuiki.com: a cookie left on the API's own
     * host is never sent by the frontend. Empty in development, where both are localhost.
     */
    cookieDomain: env("AUTH_COOKIE_DOMAIN"),

    github: oauthProvider("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"),

    google: oauthProvider("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),

    /** Moderators, by email address, so the role is independent of which provider they signed in with. */
    ownerEmails: env("SITE_OWNER_EMAILS")
      .split(",")
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
  },

  photos: {
    /**
     * Anyone signed in with GitHub may post, so every write path is bounded rather than trusted.
     * The caps below are what stops one account from filling the shared assets bucket.
     */
    maxUploadBytes: Number(env("PHOTOS_MAX_UPLOAD_BYTES", String(8 * 1024 * 1024))),
    maxPostsPerHour: Number(env("PHOTOS_MAX_POSTS_PER_HOUR", "12")),
    maxCommentsPerHour: Number(env("PHOTOS_MAX_COMMENTS_PER_HOUR", "60")),

    /** Content types accepted for an upload, and the extension each is stored under. */
    allowedTypes: {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    } as Record<string, string>,

  },

  /** Both the CORS allow-list and the OAuth returnUrl allow-list, so login can't open-redirect. */
  allowedOrigins: env(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,https://blog.nuka.works"
  )
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean),
} as const;
