import { useCallback, useEffect, useRef, useState } from "react";
import { applyPaletteFrom } from "../../../Services/PaletteUtils";
import { resolveWallpaperUrl } from "../../../Services/WallpaperUtils";
import { usePageLayout } from "../../../Services/PageLayoutProvider";

/** Flat darkening applied to every wallpaper; the low-contrast text tiers need the headroom. */
const BASE_SCRIM = 0.2;

/** Ceiling for the two combined, so no photo is ever darkened to solid black. */
const MAX_SCRIM = 0.85;

/**
 * Today's wallpaper, fading in over the bundled fallback painted on html by app.scss. An <img>
 * rather than a CSS background because background-image cannot be transitioned.
 */
export default function Wallpaper() {
  const { page } = usePageLayout();
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [scrim, setScrim] = useState(BASE_SCRIM);
  // CORS mode so the pixels can be sampled for the palette, with a retry without it below:
  // showing the photo matters more than recoloring the chrome from it.
  const [cors, setCors] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let active = true;

    setLoaded(false);
    setCors(true);

    void resolveWallpaperUrl(page.wallpaper).then((next) => {
      if (active) setUrl(next);
    });

    return () => {
      active = false;
    };
  }, [page.wallpaper?.source, page.wallpaper?.url]);

  const reveal = useCallback((img: HTMLImageElement, sampleable: boolean) => {
    setLoaded(true);

    // Sample the element on screen, not the URL: a second request would be a separate cache
    // entry in a different CORS mode. After the reveal, so a failed sample costs nothing.
    if (!sampleable) return;

    void applyPaletteFrom(img).then((dynamicScrim) => {
      if (dynamicScrim !== null) setScrim(Math.min(dynamicScrim + BASE_SCRIM, MAX_SCRIM));
    });
  }, []);

  // A cached photo can decode before onLoad is attached, and that event then never fires.
  useEffect(() => {
    const img = imgRef.current;
    if (url !== null && img?.complete) reveal(img, cors);
  }, [url, cors, reveal]);

  return (
    <div className="wallpaper-layer" aria-hidden="true">
      {url !== null && (
        <img
          // Forces a remount on retry so the request is reissued in the other CORS mode.
          key={cors ? "cors" : "plain"}
          ref={imgRef}
          className={`wallpaper-image ${loaded ? "is-visible" : ""}`.trim()}
          src={url}
          alt=""
          decoding="async"
          crossOrigin={cors ? "anonymous" : undefined}
          onLoad={(event) => reveal(event.currentTarget, cors)}
          onError={() => {
            setLoaded(false);
            // One retry without CORS; the fallback on html is already behind this.
            if (cors) setCors(false);
          }}
        />
      )}
      <div className="wallpaper-scrim" style={{ backgroundColor: `rgba(0, 0, 0, ${scrim})` }} />
    </div>
  );
}
