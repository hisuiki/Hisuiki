/**
 * The markdown pipeline, shared by the live page route and the editor's Preview tab so the two
 * agree. GFM, with raw HTML passed through so the component sentinels below survive rendering.
 */
import { Marked } from "marked";
import { sanitizeUserHtml } from "./services/UserContentUtils.js";

export interface PageMeta {
  title: string;
  description: string;
  author: string;
  lastEdited: string;
}

const marked = new Marked({ gfm: true, breaks: false });

/** Block components: <Info title="…">body</Info> → a sentinel the React renderer swaps for a component. */
const COMPONENT_TAGS: Record<string, string> = {
  Info: "info",
  Warning: "warning",
  Tip: "tip",
  Danger: "danger",
};

/** Self-closing components with no body: <PostsIndex /> */
const SELF_CLOSING_TAGS: Record<string, string> = {
  PostsIndex: "posts-index",
};

const ALLOWED_COMPONENT_TYPES = new Set([
  ...Object.values(COMPONENT_TAGS),
  ...Object.values(SELF_CLOSING_TAGS),
]);

const COMPONENT_SENTINEL_RX = /<!--md-component:([\w-]+):([^>]*?)-->([\s\S]*?)<!--\/md-component-->/g;

/**
 * A plain `key: value` scan rather than a YAML parser: only title/description/author are consumed,
 * and a real parser would accept nested structures the renderer cannot display. `lastEdited` is
 * deliberately not read — callers take it from the object's own timestamp so it cannot be spoofed.
 */
export function parseFrontmatter(text: string): { meta: PageMeta; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) {
    return { meta: emptyMeta(), content: text };
  }

  const data = new Map<string, string>();
  for (const line of (match[1] ?? "").split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line
      .slice(colon + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    data.set(key, value);
  }

  return {
    meta: {
      title: data.get("title") ?? "",
      description: data.get("description") ?? "",
      author: data.get("author") ?? "",
      lastEdited: "",
    },
    content: text.slice(match[0].length),
  };
}

function emptyMeta(): PageMeta {
  return { title: "", description: "", author: "", lastEdited: "" };
}

/** A component title lives inside an HTML comment until React reads it as text. */
function sanitizeComponentTitle(title: string): string {
  return title
    .replace(/[<>]/g, "")
    .replace(/--+/g, "—")
    // These are intentionally literal C0/DEL ranges, removed before the title enters a sentinel.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 200);
}

function injectComponentSentinels(markdown: string): string {
  let result = markdown;

  for (const [tag, type] of Object.entries(SELF_CLOSING_TAGS)) {
    result = result.replace(
      new RegExp(`<${tag}\\s*/?>`, "gi"),
      `<!--md-component:${type}:--><!--/md-component-->`
    );
  }

  for (const [tag, type] of Object.entries(COMPONENT_TAGS)) {
    result = result.replace(
      new RegExp(`<${tag}(?:\\s+title="([^"]*)")?\\s*>([\\s\\S]*?)</${tag}>`, "gi"),
      (_match, title: string | undefined, body: string | undefined) => {
        const trimmed = (body ?? "").trim();
        const innerHtml = trimmed ? (marked.parse(trimmed) as string).trim() : "";
        return `<!--md-component:${type}:${sanitizeComponentTitle(title ?? "")}-->${innerHtml}<!--/md-component-->`;
      }
    );
  }

  return result;
}

/**
 * Rewrites asset paths in rendered HTML so they resolve straight to the CDN bucket:
 *   src="public/foo.jpg"   → src="<cdn>/foo.jpg"
 *   href="./posts/foo.mdx"  → href="/posts/foo"  (or "/posts/foo/ja")
 */
function rewriteAssetPaths(html: string, assetBase: string): string {
  let result = html.replace(/src="public\/([^"]+)"/g, (_m, rest: string) => `src="${assetBase}/${rest}"`);

  result = result.replace(/href="\.\/(blog\/[^"]+\.(?:mdx?))"/g, (_m, filePath: string) => {
    const isJa = /\.ja\.mdx?$/.test(filePath);
    const name = filePath
      .slice("posts/".length)
      .replace(/\.ja\.mdx?$/, "")
      .replace(/\.mdx?$/, "");
    return `href="${isJa ? `/posts/${name}/ja` : `/posts/${name}`}"`;
  });

  return result;
}

/**
 * Sanitizes normal HTML and component bodies independently, then restores only known sentinels.
 * sanitize-html intentionally removes comments, so sanitizing the complete document in one call
 * would also remove the inert markers used by the React renderer.
 */
function sanitizePageHtml(html: string): string {
  let safe = "";
  let lastIndex = 0;

  COMPONENT_SENTINEL_RX.lastIndex = 0;
  for (let match = COMPONENT_SENTINEL_RX.exec(html); match; match = COMPONENT_SENTINEL_RX.exec(html)) {
    safe += sanitizeUserHtml(html.slice(lastIndex, match.index));

    const type = match[1] ?? "";
    if (ALLOWED_COMPONENT_TYPES.has(type)) {
      const title = sanitizeComponentTitle(match[2] ?? "");
      const body = sanitizeUserHtml(match[3] ?? "");
      safe += `<!--md-component:${type}:${title}-->${body}<!--/md-component-->`;
    }

    lastIndex = match.index + match[0].length;
  }

  safe += sanitizeUserHtml(html.slice(lastIndex));
  return safe;
}

/** Full render of a raw file (frontmatter + body) to metadata and HTML. */
export function renderRawText(rawText: string, assetBase: string): { meta: PageMeta; html: string } {
  const { meta, content } = parseFrontmatter(rawText);
  const html = marked.parse(injectComponentSentinels(content)) as string;
  return { meta, html: sanitizePageHtml(rewriteAssetPaths(html, assetBase)) };
}

/** "Aug 17, 2026" — the display format the frontend expects for a page's last-edited date. */
export function formatLastEdited(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
