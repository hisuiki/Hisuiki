import { apiUrl, assetUrl } from "./AppConfig";
import type { BingWallpaper, WallpaperSetting } from "../Types/TypeRegistry";
import { setCssVars } from "./PaletteUtils";

/** Used when the API or Bing is unreachable. */
export const FALLBACK_WALLPAPER_URL = "/assets/default2.png";

/**
 * Today's Bing picture of the day, proxied through the API so the browser never hotlinks bing.com
 * and the image stays sampleable into a canvas for the palette.
 */
export async function resolveWallpaperUrl(wallpaper?: WallpaperSetting): Promise<string> {
  if ((wallpaper?.source === "url" || wallpaper?.source === "media") && wallpaper.url?.trim()) {
    const url = wallpaper.url.trim();
    return url.startsWith("/") ? apiUrl(url) : url;
  }
  try {
    const response = await fetch(apiUrl("/api/wallpaper/bing"));
    if (response.ok) {
      const dto = (await response.json()) as BingWallpaper;
      // A path from the API, resolved against the API's own origin — which in production is a
      // different host from the page.
      if (dto?.imageUrl?.trim()) return apiUrl(dto.imageUrl);
    }
  } catch {
    // Unreachable — fall through to the bundled wallpaper.
  }
  return FALLBACK_WALLPAPER_URL;
}

/** Points the asset custom properties at the CDN copies for app.scss to reference. */
export function injectAssetCssVariables(): void {
  setCssVars({ "--cardboard-url": `url("${assetUrl("cardboard.png")}")` });
}
