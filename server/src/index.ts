import express, { type NextFunction, type Request, type Response } from "express";
import path from "node:path";
import { config } from "./config.js";
import { applyMigrations } from "./services/migrate.js";
import { isAllowedOrigin } from "./services/origins.js";

const app = express();

// Cloud Run terminates TLS at the edge, so without this req.protocol reports "http" and the OAuth
// redirect_uri stops matching the callback registered with the providers.
app.set("trust proxy", 1);

/**
 * Hand-rolled CORS: a fixed origin allow-list. Requests without an Origin get no CORS headers at
 * all, which the wallpaper routes' no-store depends on.
 *
 * Credentials are allowed because the session is now a cookie: without this header the browser
 * drops it on any cross-origin call, and an allow-list of exact origins is what makes that safe —
 * "*" and credentials are mutually exclusive for good reason.
 */
app.use((req, res, next) => {
  const origin = req.header("origin");

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    // Per-origin allow-list, so caches must key on Origin.
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

// Cloud CDN uses origin headers for this backend. Dynamic and authenticated endpoints are private
// unless an individual public GET route opts into caching with a more specific response header.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

/**
 * better-auth owns every /api/auth route and parses its own bodies from the raw stream. It is
 * therefore mounted before express.json(), which would otherwise consume the request first and
 * leave the handler waiting on a stream that never emits.
 */
/**
 * Imported here rather than at the top of the file so that the "web" role never loads the API's
 * modules at all. This is not an optimisation: better-auth throws on construction when
 * BETTER_AUTH_SECRET is missing, and the frontend service deliberately has no secret, no database,
 * and no bucket — so a static import crash-loops it on boot.
 */
if (config.servesApi) {
  const [
    { toNodeHandler },
    { auth },
    { siteRouter },
    { photosRouter },
    { wallpaperRouter },
    { profileRouter },
    { postsRouter },
  ] =
    await Promise.all([
      import("better-auth/node"),
      import("./services/auth.js"),
      import("./routes/site.js"),
      import("./routes/photos.js"),
      import("./routes/wallpaper.js"),
      import("./routes/profile.js"),
      import("./routes/posts.js"),
    ]);

  app.all("/api/auth/*splat", toNodeHandler(auth));

  app.use(express.json({ limit: "1mb" }));

  // No cache override: like and comment counts change per request and must never be shared-cached.
  app.use("/api/site", siteRouter);
  app.use("/api/photos", photosRouter);
  app.use("/api/wallpaper", wallpaperRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/posts", postsRouter);
}

// Production images include the Vite build at WEB_ROOT. API routes are mounted first so an
// unknown /api request still returns JSON instead of falling through to the client-side app.
const webRoot = config.servesWeb ? process.env.WEB_ROOT?.trim() : undefined;
if (webRoot) {
  app.use(
    express.static(webRoot, {
      index: false,
      setHeaders: (res, filePath) => {
        const relativePath = path.relative(webRoot, filePath).replaceAll(path.sep, "/");

        if (relativePath.startsWith("assets/")) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (relativePath === "index.html" || relativePath === "version.json") {
          res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
        } else {
          res.setHeader("Cache-Control", "public, max-age=3600");
        }
      },
    })
  );

  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.setHeader("Cache-Control", "no-cache, max-age=0, must-revalidate");
    res.sendFile(path.join(webRoot, "index.html"), (error) => {
      if (error) next(error);
    });
  });
} else {
  /** Local API health response when no frontend build is mounted. */
  app.get("/", (_req, res) => {
    res.json({ status: "ok" });
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error." });
});

// Before the port opens, so no request is ever served against a schema this build did not expect.
// A failure here exits non-zero: Cloud Run keeps the previous revision serving.
await applyMigrations();

app.listen(config.port, () => {
  console.log(`Listening on port ${config.port} as "${config.role}"`);

  // Only the API half touches storage, the database, or sessions; warning about them on the web
  // service would be noise about configuration it deliberately does not have.
  if (!config.servesApi) return;

  if (!config.storage.bucketName) {
    console.warn("GCS_BUCKET is not set — every page read will fail until it is.");
  }
  if (!config.database.url) {
    console.warn("DATABASE_URL is not set — every sign-in will fail until it is.");
  }
  if (!config.auth.secret) {
    console.warn("BETTER_AUTH_SECRET is not set — sessions cannot be signed.");
  }
});
