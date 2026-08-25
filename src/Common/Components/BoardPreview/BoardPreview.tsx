import { useEffect, useId, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { apiUrl } from "../../../Services/AppConfig";
import { titleAction } from "../../../Services/TitleWidgetUtils";
import { resolveWallpaperUrl } from "../../../Services/WallpaperUtils";
import type { BoardSummary, ProfileLayout, Widget } from "../../../Types/TypeRegistry";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const CONTENT_X = 18;
const CONTENT_WIDTH = PAGE_WIDTH - (CONTENT_X * 2);
const MAX_ITEMS = 6;
let bingWallpaperPromise: Promise<string> | null = null;

/** Site chrome is shared around a board; a discovery thumbnail previews only its page body. */
function isChrome(widget: Widget): boolean {
  const role = widget.props?.role;
  const anchor = widget.props?.anchor;
  return role === "header" || role === "footer" || anchor === "top" || anchor === "bottom";
}

function storedWidgets(layout: ProfileLayout): Widget[] {
  if (Array.isArray(layout.root?.children)) return layout.root.children.filter((widget) => !isChrome(widget));
  if (layout.anchors && typeof layout.anchors === "object") {
    return (["left", "center", "right"] as const)
      .flatMap((anchor) => layout.anchors?.[anchor] ?? [])
      .filter((widget) => !isChrome(widget));
  }
  return Array.isArray(layout.widgets) ? layout.widgets.filter((widget) => !isChrome(widget)) : [];
}

function leafWidgets(widgets: Widget[]): Widget[] {
  return widgets.flatMap((widget) => {
    if (widget.kind !== "container") return [widget];
    return leafWidgets((widget.children ?? []).filter((child) => !isChrome(child)));
  });
}

function wallpaperUrl(layout: ProfileLayout): string | null {
  const wallpaper = layout.page?.wallpaper;
  if ((wallpaper?.source !== "url" && wallpaper?.source !== "media") || !wallpaper.url?.trim()) {
    return null;
  }
  const url = wallpaper.url.trim();
  return url.startsWith("/") ? apiUrl(url) : url;
}

function resolveBoardWallpaper(layout: ProfileLayout): Promise<string> {
  const saved = wallpaperUrl(layout);
  if (saved) return Promise.resolve(saved);
  bingWallpaperPromise ??= resolveWallpaperUrl(layout.page?.wallpaper);
  return bingWallpaperPromise;
}

function wrapText(value: string, width: number, lines: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const result: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) {
      line = next;
      continue;
    }
    if (line) result.push(line);
    line = word.slice(0, width);
    if (result.length === lines) break;
  }
  if (line && result.length < lines) result.push(line);

  if (result.length === lines && words.join(" ").length > result.join(" ").length) {
    result[lines - 1] = `${result[lines - 1]?.slice(0, Math.max(1, width - 1))}…`;
  }
  return result;
}

function previewText(widget: Widget, t: TFunction): { heading: string; body: string } | null {
  if (widget.kind === "text") {
    const heading = String(widget.props?.heading ?? "").trim();
    const body = String(widget.props?.body ?? "").trim();
    return heading || body ? { heading, body } : null;
  }

  if (widget.kind === "title") {
    const label = String(widget.props?.label ?? "").trim();
    if (label) return { heading: label, body: "" };
    const action = titleAction(widget);
    if (action.kind === "route") return { heading: t(`routes.${action.route}`), body: "" };
    if (action.kind === "path") return action.path ? { heading: action.path, body: "" } : null;
    return action.href ? { heading: action.href, body: "" } : null;
  }

  if (widget.kind === "webamp") {
    const heading = String(widget.props?.title ?? "").trim();
    const body = String(widget.props?.artist ?? "").trim();
    return heading || body ? { heading, body } : null;
  }

  return null;
}

/**
 * A generated portrait image of the saved page data.
 *
 * Discovery has owner identity but not route-owned content, so identity is rendered from real data
 * and route-backed widgets keep an honest visual placeholder. The preview never invents posts.
 */
export default function BoardPreview({
  layout,
  owner,
}: {
  layout: ProfileLayout;
  owner: BoardSummary["owner"];
}) {
  const { t } = useTranslation();
  const definitionId = useId().replace(/:/g, "");
  const savedWallpaper = wallpaperUrl(layout);
  const [wallpaper, setWallpaper] = useState<string | null>(savedWallpaper);
  const [wallpaperResolved, setWallpaperResolved] = useState(savedWallpaper !== null);
  const items = leafWidgets(storedWidgets(layout))
    .filter((widget) => widget.kind !== "spacer")
    .slice(0, MAX_ITEMS);
  const hasPreview = wallpaper !== null || items.length > 0;
  const ink = wallpaper ? "#ffffff" : "#24201b";
  const mutedInk = wallpaper ? "rgba(255,255,255,.72)" : "#706a62";
  const pageClipId = `${definitionId}-page-clip`;
  const paperId = `${definitionId}-paper`;
  const scrimId = `${definitionId}-scrim`;

  let cursorY = 28;

  useEffect(() => {
    let active = true;
    setWallpaper(savedWallpaper);
    setWallpaperResolved(savedWallpaper !== null);

    if (!savedWallpaper) {
      void resolveBoardWallpaper(layout).then((resolved) => {
        if (!active) return;
        setWallpaper(resolved);
        setWallpaperResolved(true);
      });
    }

    return () => { active = false; };
  }, [layout.page?.wallpaper?.source, layout.page?.wallpaper?.url, savedWallpaper]);

  return (
    <span className="board-discovery-window">
      <svg
        className="board-preview-image"
        viewBox={`0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`}
        role="img"
        aria-label={hasPreview ? t("boardsPreview.label") : t("boardsPreview.empty")}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id={pageClipId}>
            <rect width={PAGE_WIDTH} height={PAGE_HEIGHT} />
          </clipPath>
          <linearGradient id={paperId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#faf8f2" />
            <stop offset="1" stopColor="#e9e4da" />
          </linearGradient>
          <linearGradient id={scrimId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgba(0,0,0,.12)" />
            <stop offset="1" stopColor="rgba(0,0,0,.52)" />
          </linearGradient>
        </defs>

        <g clipPath={`url(#${pageClipId})`}>
          <rect width={PAGE_WIDTH} height={PAGE_HEIGHT} fill={`url(#${paperId})`} />
          {wallpaper && (
            <>
              <image
                href={wallpaper}
                width={PAGE_WIDTH}
                height={PAGE_HEIGHT}
                preserveAspectRatio="xMidYMid slice"
              />
              <rect width={PAGE_WIDTH} height={PAGE_HEIGHT} fill={`url(#${scrimId})`} />
            </>
          )}

          {items.map((widget, index) => {
            const text = previewText(widget, t);
            const heading = wrapText(text?.heading ?? "", 28, 2);
            const body = wrapText(text?.body ?? "", 38, 3);
            const itemHeight = widget.kind === "content"
              ? 72
              : widget.kind === "identity"
                ? 50
                : Math.max(widget.size === "large" ? 48 : widget.size === "medium" ? 38 : 30,
                    15 + (heading.length * 11) + (body.length * 8));
            const y = cursorY;
            cursorY += itemHeight + (widget.size === "large" ? 16 : 10);
            if (y > PAGE_HEIGHT - 34) return null;

            if (widget.kind === "identity") {
              const handle = owner.profile?.handle;
              const name = owner.name.trim() || handle || "";
              const avatarClipId = `${definitionId}-avatar-${index}`;
              return (
                <g key={widget.id} transform={`translate(${CONTENT_X} ${y})`}>
                  <defs>
                    <clipPath id={avatarClipId}><circle cx="23" cy="25" r="18" /></clipPath>
                  </defs>
                  <rect width={CONTENT_WIDTH} height={itemHeight} fill={wallpaper ? "rgba(16,16,16,.48)" : "#e7e1d7"} />
                  {owner.image ? (
                    <image
                      href={owner.image}
                      x="5"
                      y="7"
                      width="36"
                      height="36"
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#${avatarClipId})`}
                    />
                  ) : (
                    <>
                      <circle cx="23" cy="25" r="18" fill={wallpaper ? "rgba(255,255,255,.18)" : "#c9c0b4"} />
                      <text x="23" y="30" fill={ink} fontSize="15" textAnchor="middle" fontFamily="Segoe UI, sans-serif">
                        {name.slice(0, 1).toUpperCase()}
                      </text>
                    </>
                  )}
                  <text x="50" y="23" fill={ink} fontSize="10" fontWeight="600" fontFamily="Segoe UI, sans-serif">
                    {wrapText(name, 20, 1)[0]}
                  </text>
                  {handle && (
                    <text x="50" y="35" fill={mutedInk} fontSize="7" fontFamily="Segoe UI, sans-serif">
                      @{handle}
                    </text>
                  )}
                </g>
              );
            }

            if (widget.kind === "content") {
              return (
                <g key={widget.id} transform={`translate(${CONTENT_X} ${y})`}>
                  <rect
                    width={CONTENT_WIDTH}
                    height={itemHeight}
                    fill={wallpaper ? "rgba(16,16,16,.42)" : "#e7e1d7"}
                    stroke={wallpaper ? "rgba(255,255,255,.34)" : "#b9b0a4"}
                    strokeDasharray="3 4"
                  />
                  <path
                    d="M67 45l17-18 13 13 10-10 18 19"
                    fill="none"
                    stroke={mutedInk}
                    strokeWidth="2"
                  />
                  <circle cx="112" cy="21" r="5" fill="none" stroke={mutedInk} strokeWidth="2" />
                  <text x={CONTENT_WIDTH / 2} y="63" fill={mutedInk} fontSize="6.5" textAnchor="middle" fontFamily="Segoe UI, sans-serif">
                    {t("widgets.content.label")}
                  </text>
                </g>
              );
            }

            if (widget.kind === "webamp") {
              return (
                <g key={widget.id} transform={`translate(${CONTENT_X} ${y})`}>
                  <rect width={CONTENT_WIDTH} height={Math.min(42, itemHeight)} fill="rgba(15,15,15,.82)" />
                  <rect x="8" y="9" width="4" height="20" fill="#6bbd46" />
                  <rect x="15" y="14" width="4" height="15" fill="#6bbd46" opacity=".75" />
                  <rect x="22" y="6" width="4" height="23" fill="#6bbd46" opacity=".9" />
                  <text x="35" y="18" fill="#fff" fontSize="8.5" fontFamily="Segoe UI, sans-serif">
                    {heading[0] ?? body[0]}
                  </text>
                  {(body[0] || heading[1]) && (
                    <text x="35" y="30" fill="rgba(255,255,255,.62)" fontSize="6.5" fontFamily="Segoe UI, sans-serif">
                      {body[0] ?? heading[1]}
                    </text>
                  )}
                </g>
              );
            }

            if (!text) {
              return (
                <g key={widget.id} transform={`translate(${CONTENT_X} ${y})`}>
                  <rect width={CONTENT_WIDTH} height={itemHeight} fill={wallpaper ? "rgba(16,16,16,.4)" : "#e7e1d7"} />
                  <rect x="9" y="9" width="4" height={Math.max(12, itemHeight - 18)} fill={wallpaper ? "rgba(255,255,255,.5)" : "#9d9488"} />
                  <text x="22" y={(itemHeight / 2) + 3} fill={ink} fontSize="8" fontFamily="Segoe UI, sans-serif">
                    {t(`widgets.${widget.kind}.label`)}
                  </text>
                </g>
              );
            }

            return (
              <g key={widget.id}>
                {heading.map((line, lineIndex) => (
                  <text
                    key={`heading-${lineIndex}`}
                    x={CONTENT_X}
                    y={y + 10 + (lineIndex * 11)}
                    fill={ink}
                    fontSize={widget.kind === "title" ? 11 : 12}
                    fontWeight={widget.kind === "title" ? 400 : 600}
                    fontFamily="Segoe UI, sans-serif"
                  >
                    {line}
                  </text>
                ))}
                {body.map((line, lineIndex) => (
                  <text
                    key={`body-${lineIndex}`}
                    x={CONTENT_X}
                    y={y + 15 + (heading.length * 11) + (lineIndex * 8)}
                    fill={mutedInk}
                    fontSize="6.8"
                    fontFamily="Segoe UI, sans-serif"
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}

          {!hasPreview && wallpaperResolved && (
            <g className="board-preview-placeholder">
              <rect x="56" y="101" width="98" height="74" fill="none" stroke="#b4ada3" strokeDasharray="3 4" />
              <path d="M86 151l17-18 13 13 9-9 17 17" fill="none" stroke="#8c857c" strokeWidth="2" />
              <circle cx="125" cy="122" r="5" fill="none" stroke="#8c857c" strokeWidth="2" />
              <text x="105" y="194" fill="#706a62" fontSize="7" textAnchor="middle" fontFamily="Segoe UI, sans-serif">
                {t("boardsPreview.empty")}
              </text>
            </g>
          )}
        </g>
      </svg>
    </span>
  );
}
