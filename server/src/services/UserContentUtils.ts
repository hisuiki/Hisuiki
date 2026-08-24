/**
 * Rendering and sanitising everything a user writes: post bodies, profile pages, and the custom CSS
 * a profile carries.
 *
 * Two separate problems live here, and both are security boundaries rather than formatting niceties:
 *
 *   HTML — posts are markdown but may contain a small amount of hand-written HTML, which means the
 *   rendered output is untrusted by definition. It goes through an allow-list, not a block-list:
 *   anything not named below is removed, so a tag or attribute invented after this was written is
 *   dropped rather than passed through.
 *
 *   CSS — a stylesheet is not inert. Selectors can be used to exfiltrate page content one attribute
 *   at a time by triggering background requests, a fixed-position element can cover the real UI to
 *   harvest clicks, and @import pulls in a stylesheet this code never sees. So user CSS is parsed,
 *   filtered, and rewritten with every selector confined to the author's own container.
 */
import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";
import postcss, { type Rule, type AtRule, type Declaration } from "postcss";

const marked = new Marked({ gfm: true, breaks: false });

/** One post's container. Unique per post, so a stylesheet in a feed cannot restyle its neighbours. */
export const postScope = (postId: string): string => `[data-post="${postId}"]`;

/** Tags a post may use. Deliberately small: prose, structure, and images. */
const ALLOWED_TAGS = [
  "p", "br", "hr", "span", "div", "section", "article",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "del", "ins", "mark", "small", "sub", "sup",
  "blockquote", "pre", "code", "kbd", "samp",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  "a", "img", "figure", "figcaption",
  "details", "summary",
];

/**
 * Schemes an href or src may use. Notably absent: javascript:, and data: — the latter because a
 * data: URL can carry an SVG, and an SVG carries script.
 */
const ALLOWED_SCHEMES = ["http", "https", "mailto"];

/** Declarations that let a stylesheet escape its box or phone home. */
const FORBIDDEN_PROPERTIES = new Set([
  "position",        // handled below: fixed and sticky are refused, the rest allowed
  "pointer-events",  // an invisible overlay that swallows clicks
  "behavior",        // legacy IE script injection
  "-moz-binding",    // legacy XBL script injection
]);

/** At-rules that pull in or run something this code cannot inspect. */
const FORBIDDEN_AT_RULES = new Set(["import", "charset", "namespace", "document"]);

const EXTERNAL_URL = /url\(\s*['"]?\s*(?:https?:)?\/\//i;

export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false }) as string;
}

/** Renders a user's markdown and strips everything the allow-list does not name. */
export function renderUserHtml(source: string): string {
  return sanitizeHtml(renderMarkdown(source), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      // rel and target are listed because the transform below adds them: sanitize-html applies the
      // allow-list after transforms, so an attribute it does not know about is stripped straight
      // back off — which silently undid the noopener hardening until a test caught it.
      a: ["href", "title", "name", "rel", "target"],
      img: ["src", "alt", "title", "width", "height", "loading"],
      // A class is how a post's own scoped stylesheet reaches its own markup.
      "*": ["class", "id"],
    },
    allowedSchemes: ALLOWED_SCHEMES,
    // Relative URLs would resolve against whichever host is serving, which for a profile subdomain
    // is not necessarily where the asset lives.
    allowProtocolRelative: false,
    transformTags: {
      // Anything a user links to is someone else's site: do not hand it window.opener, and tell
      // search engines this is not an endorsement.
      a: sanitizeHtml.simpleTransform("a", { rel: "nofollow ugc noopener noreferrer", target: "_blank" }),
      img: sanitizeHtml.simpleTransform("img", { loading: "lazy" }),
    },
  });
}

export interface ScopedCssResult {
  css: string;
  /** What was refused, so the settings UI can tell the author instead of silently discarding it. */
  removed: string[];
}

/**
 * Rewrites a stylesheet so every rule applies only inside `scopeSelector`, dropping what cannot be
 * made safe. `.foo { … }` becomes `<scope> .foo { … }`, and a bare `body` selector becomes the scope
 * itself rather than the real document body.
 */
export function scopeCss(source: string, scopeSelector: string): ScopedCssResult {
  const removed: string[] = [];

  if (!source.trim()) return { css: "", removed };

  let root;
  try {
    root = postcss.parse(source);
  } catch (error) {
    // A stylesheet that will not parse is not a stylesheet. Report rather than ship fragments.
    return { css: "", removed: [`could not parse: ${error instanceof Error ? error.message : "invalid CSS"}`] };
  }

  root.walkAtRules((rule: AtRule) => {
    if (FORBIDDEN_AT_RULES.has(rule.name.toLowerCase())) {
      removed.push(`@${rule.name}`);
      rule.remove();
    }
  });

  root.walkDecls((decl: Declaration) => {
    const prop = decl.prop.toLowerCase();
    const value = decl.value.toLowerCase();

    if (prop === "position" && (value.includes("fixed") || value.includes("sticky"))) {
      removed.push(`position: ${decl.value}`);
      decl.remove();
      return;
    }

    if (prop !== "position" && FORBIDDEN_PROPERTIES.has(prop)) {
      removed.push(prop);
      decl.remove();
      return;
    }

    // An external url() fires a request from every visitor's browser, which is both a privacy leak
    // and the mechanism behind CSS-selector data exfiltration.
    if (EXTERNAL_URL.test(decl.value)) {
      removed.push(`external url() in ${decl.prop}`);
      decl.remove();
    }
  });

  root.walkRules((rule: Rule) => {
    // Selectors inside @keyframes are frame positions ("from", "50%"), not element selectors.
    if (rule.parent?.type === "atrule" && (rule.parent as AtRule).name.toLowerCase() === "keyframes") {
      return;
    }

    rule.selectors = rule.selectors.map((selector) => {
      const trimmed = selector.trim();
      if (/^(html|body|:root)$/i.test(trimmed)) return scopeSelector;
      return `${scopeSelector} ${trimmed}`;
    });
  });

  return { css: root.toString(), removed };
}

export interface RenderedUserContent {
  html: string;
  css: string;
  removed: string[];
}

/**
 * A post or page, rendered ready to embed: sanitised HTML plus its own stylesheet, scoped so it
 * cannot reach beyond the container the caller gives it.
 */
export function renderUserContent(
  source: string,
  options: { scopeSelector: string; css?: string }
): RenderedUserContent {
  const { css, removed } = scopeCss(options.css ?? "", options.scopeSelector);
  return { html: renderUserHtml(source), css, removed };
}
