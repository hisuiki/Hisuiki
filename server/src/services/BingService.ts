/**
 * Bing's picture of the day (the unofficial HPImageArchive.aspx endpoint, no key required). Fetched
 * here rather than hotlinked because bing.com sends no CORS headers, which would taint the canvas
 * the palette sampler reads.
 */

const MARKET = "en-US";
const CACHE_TTL_MS = 60 * 60 * 1000;
const USER_AGENT = "Hisuiki-Server/1.0";

export interface BingWallpaperEntry {
  imageBytes: Buffer;
  contentType: string;
  title: string;
  copyright: string;
  date: string;
}

interface BingArchiveResponse {
  images?: Array<{ url?: string; title?: string; copyright?: string; startdate?: string }>;
}

let cached: { entry: BingWallpaperEntry; expiresAt: number } | null = null;
/** Collapses concurrent misses onto one upstream fetch. */
let inFlight: Promise<BingWallpaperEntry | null> | null = null;

export async function getToday(): Promise<BingWallpaperEntry | null> {
  if (cached && cached.expiresAt > Date.now()) return cached.entry;

  inFlight ??= fetchToday().finally(() => {
    inFlight = null;
  });

  const entry = await inFlight;
  if (entry) cached = { entry, expiresAt: Date.now() + CACHE_TTL_MS };
  return entry;
}

async function fetchToday(): Promise<BingWallpaperEntry | null> {
  try {
    const archiveResponse = await fetch(
      `https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=${MARKET}`,
      { headers: { "User-Agent": USER_AGENT } }
    );
    if (!archiveResponse.ok) return null;

    const archive = (await archiveResponse.json()) as BingArchiveResponse;
    const image = archive.images?.[0];
    if (!image?.url) return null;

    const imageResponse = await fetch(`https://www.bing.com${image.url}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!imageResponse.ok) return null;

    return {
      imageBytes: Buffer.from(await imageResponse.arrayBuffer()),
      contentType: imageResponse.headers.get("content-type") ?? "image/jpeg",
      title: image.title ?? "",
      copyright: image.copyright ?? "",
      date: image.startdate ?? "",
    };
  } catch {
    // The caller falls back to the bundled wallpaper.
    return null;
  }
}
