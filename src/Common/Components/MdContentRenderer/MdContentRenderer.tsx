import { Fragment, useEffect, useMemo, useRef } from "react";
// The "common" bundle: the full build registers ~190 languages and dwarfs the rest of the app.
import hljs from "highlight.js/lib/common";
import InfoBubble from "../InfoBubble/InfoBubble";
import PostsIndex from "../PostsIndex/PostsIndex";
import { useExternalLink } from "../../../Services/ExternalLinkProvider";
import { useRouter } from "../../../Services/AppRouter";

/**
 * Renders the HTML the API produces for a markdown page. Custom tags (`<Info>`, `<PostsIndex />`)
 * arrive as HTML comment sentinels:
 *
 *     <!--md-component:info:Some title-->…rendered body html…<!--/md-component-->
 *
 * which are split out and replaced with the real component, the plain HTML either side injected.
 */

// Type may contain hyphens (e.g. "posts-index"); title ends at -->
const SENTINEL_RX = /<!--md-component:([\w-]+):([^>]*?)-->([\s\S]*?)<!--\/md-component-->/g;

interface Segment {
  isHtml: boolean;
  content: string;
  type: string;
  title: string;
}

function parse(html: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  SENTINEL_RX.lastIndex = 0;
  for (let m = SENTINEL_RX.exec(html); m !== null; m = SENTINEL_RX.exec(html)) {
    if (m.index > lastIndex) {
      segments.push({ isHtml: true, content: html.slice(lastIndex, m.index), type: "", title: "" });
    }
    segments.push({ isHtml: false, content: m[3] ?? "", type: m[1] ?? "", title: m[2] ?? "" });
    lastIndex = m.index + m[0].length;
  }

  if (lastIndex < html.length) {
    segments.push({ isHtml: true, content: html.slice(lastIndex), type: "", title: "" });
  }

  return segments;
}

function renderComponent(segment: Segment, isJapanese: boolean) {
  const className = `md-component md-component-${segment.type}`;

  switch (segment.type) {
    case "info":
    case "warning":
    case "tip":
    case "danger":
      return <InfoBubble title={segment.title} className={className} html={segment.content} />;
    case "posts-index":
      return <PostsIndex isJapanese={isJapanese} />;
    default:
      // A component this build doesn't know yet — drop it rather than showing the markers.
      return null;
  }
}

export interface MdContentRendererProps {
  html: string;
  isJapanese?: boolean;
}

export default function MdContentRenderer({ html, isJapanese = false }: MdContentRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { request } = useExternalLink();
  const { navigate } = useRouter();

  const segments = useMemo(() => parse(html), [html]);

  // Article <a> tags are raw HTML with no React handler, so one delegated listener routes them
  // through the client-side router or the confirm-before-leaving dialog.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || !container.contains(anchor)) return;

      let url: URL;
      try {
        url = new URL(anchor.getAttribute("href")!, window.location.href);
      } catch {
        return;
      }

      if (url.origin === window.location.origin) {
        if (url.hash && url.pathname === window.location.pathname) return; // in-page anchor
        e.preventDefault();
        navigate(`${url.pathname}${url.search}${url.hash}`);
        return;
      }

      e.preventDefault();
      request(url.href, anchor.textContent?.trim() || url.hostname);
    };

    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [request, navigate]);

  // Code fences arrive as plain <pre><code class="language-x">; this adds the token spans.
  useEffect(() => {
    containerRef.current
      ?.querySelectorAll<HTMLElement>("pre code:not([data-highlighted])")
      .forEach((block) => hljs.highlightElement(block));
  }, [segments]);

  return (
    <div ref={containerRef}>
      {segments.map((segment, i) =>
        segment.isHtml ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: segment.content }} />
        ) : (
          <Fragment key={i}>{renderComponent(segment, isJapanese)}</Fragment>
        )
      )}
    </div>
  );
}
