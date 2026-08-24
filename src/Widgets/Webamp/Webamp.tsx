import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WidgetProps } from "../../Types/TypeRegistry";

/** One classic window. Winamp's are a fixed 275 by 116 and nothing about them reflows. */
const WINDOW_WIDTH = 275;
const WINDOW_HEIGHT = 116;

/**
 * Winamp, by way of Webamp. Loaded on demand — it is about a megabyte, and a page without one
 * should not pay for it.
 *
 * Webamp centres its windows inside the element it is handed, so the host has to be exactly the size
 * of the stack before it mounts. A host measured at zero, or squeezed narrower than 275 by its
 * column, centres to a negative offset and the player ends up outside its own widget. So it waits
 * for a real width, and scales down rather than being cropped when there is less than 275 to work
 * with.
 */
export default function Webamp({ widget, editing, preview }: WidgetProps) {
  const { t } = useTranslation();
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [scale, setScale] = useState(0);
  // Bumped to rebuild the player after a resize, so its windows are placed against the new box.
  const [generation, setGeneration] = useState(0);

  const src = String(widget.props?.src ?? "").trim();
  const title = String(widget.props?.title ?? "").trim();
  const artist = String(widget.props?.artist ?? "").trim();

  const equalizer = widget.props?.equalizer === true;
  const playlist = widget.props?.playlist === true;
  const height = WINDOW_HEIGHT * (1 + (equalizer ? 1 : 0) + (playlist ? 1 : 0));

  // Still there while arranging, just not taking the pointer: two drag implementations over the
  // same pixels means neither works.
  const inert = editing || preview;
  // Read from the observer, which outlives the render that set it. Synced after render rather than
  // during it: a ref written while rendering is a mutation React cannot see.
  const inertRef = useRef(inert);
  useEffect(() => {
    inertRef.current = inert;
  }, [inert]);

  useEffect(() => {
    const node = frame.current;
    if (!node || typeof ResizeObserver === "undefined") {
      setScale(1);
      return;
    }

    const measure = () => {
      const width = node.clientWidth;
      if (width > 0) setScale(Math.min(1, width / WINDOW_WIDTH));
    };

    /**
     * Webamp places its windows once, when it is built, and centres them in the host as it was then.
     * Resizing the widget therefore leaves them where the old box was — outside it, or off to one
     * side. There is no public way to move them afterwards, so the player is rebuilt.
     *
     * Only while the page is being arranged, which is the only time the widget can be resized, and
     * the only time nobody is listening to it.
     */
    let settle: number | undefined;
    const scheduleRebuild = () => {
      if (!inertRef.current) return;
      window.clearTimeout(settle);
      settle = window.setTimeout(() => setGeneration((n) => n + 1), 250);
    };

    measure();
    const observer = new ResizeObserver(() => {
      measure();
      scheduleRebuild();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
      window.clearTimeout(settle);
    };
  }, []);

  useEffect(() => {
    // Nothing mounts until the host is the size Webamp will centre against.
    if (scale === 0) return;

    let disposed = false;
    let player: { dispose: () => void } | null = null;

    void (async () => {
      if (!host.current) return;

      try {
        const { default: WebampPlayer } = await import("webamp");
        if (disposed || !host.current) return;

        let track: { url: string; metaData: { title: string; artist: string } } | undefined;
        if (src) {
          try {
            const url = new URL(src, window.location.href);
            if (url.protocol === "https:" || url.protocol === "http:") {
              track = { url: url.toString(), metaData: { title: title || t("webamp.untitled"), artist } };
            }
          } catch {
            // Not a URL; the player opens with an empty playlist.
          }
        }

        const instance = new WebampPlayer({
          initialTracks: track ? [track] : undefined,
          // Its own windows sit at this + 1. Left at the default they paint over the widget's
          // resize corner and remove buttons, which is what made the widget impossible to resize.
          zIndex: 0,
          windowLayout: {
            main: { position: { top: 0, left: 0 } },
            ...(equalizer ? { equalizer: { position: { top: WINDOW_HEIGHT, left: 0 } } } : {}),
            ...(playlist
              ? { playlist: { position: { top: WINDOW_HEIGHT * (equalizer ? 2 : 1), left: 0 } } }
              : {}),
          },
        });

        // Refused rather than hidden: a closed window leaves an empty widget with no way back.
        instance.onWillClose((cancel) => cancel());

        player = instance;
        await instance.renderWhenReady(host.current);
        if (disposed) instance.dispose();
      } catch {
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      player?.dispose();
    };
    // Deliberately not keyed on `scale`: remounting on every resize would restart playback. The
    // first non-zero measurement is what it waits for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale > 0, generation, src, title, artist, equalizer, playlist, t]);

  if (failed) return <p className="webamp-widget is-failed">{t("webamp.failed")}</p>;

  return (
    <div className="webamp-frame" ref={frame} style={{ height: height * (scale || 1) }}>
      <div
        className={`webamp-widget ${inert ? "is-inert" : ""}`.trim()}
        ref={host}
        style={{
          width: WINDOW_WIDTH,
          height,
          transform: scale && scale < 1 ? `scale(${scale})` : undefined,
        }}
      />
    </div>
  );
}
