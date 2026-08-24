import { Router } from "express";
import { getToday } from "../services/BingService.js";

export const wallpaperRouter = Router();

/**
 * `no-store`: these routes are also reachable by top-level navigation, which carries no Origin and
 * so gets no CORS headers — a cache entry from one would be replayed for later cross-origin
 * fetches without them. The Bing service's own 1h cache already covers freshness.
 */
const CACHE_CONTROL = "no-store";

/**
 * GET /api/wallpaper/bing — today's picture-of-the-day metadata. `imageUrl` points at the route
 * below, not bing.com, so the client can sample it into a canvas without tainting it.
 *
 * It is a path, not an absolute URL. Building one from the request's Host looked right until a
 * proxy sat in front: Vite rewrites Host to the container it forwards to, so the browser was handed
 * http://api:5066/... and could not resolve it. The client joins this onto its own API base, which
 * is correct behind a proxy, on a LAN address, and cross-origin in production alike.
 */
wallpaperRouter.get("/bing", async (_req, res, next) => {
  try {
    const entry = await getToday();
    if (!entry) {
      res.status(502).json({ error: "Could not fetch today's Bing wallpaper." });
      return;
    }

    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.json({
      imageUrl: "/api/wallpaper/bing/image",
      title: entry.title,
      copyright: entry.copyright,
      date: entry.date,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/wallpaper/bing/image — the actual bytes, from the same cached entry as above.
wallpaperRouter.get("/bing/image", async (_req, res, next) => {
  try {
    const entry = await getToday();
    if (!entry) {
      res.status(502).json({ error: "Could not fetch today's Bing wallpaper." });
      return;
    }

    res.setHeader("Cache-Control", CACHE_CONTROL);
    res.type(entry.contentType).send(entry.imageBytes);
  } catch (error) {
    next(error);
  }
});
