/**
 * Security checks for everything users can write. There is no test runner in this repository, so
 * this is a plain script: `pnpm --filter hisuiki-server test:security`, exit code 0 or 1.
 *
 * These are not formatting tests. Each one is an attack that worked, or would have: script tags,
 * event handlers, javascript: and data: URLs, iframes, and the CSS constructs that let a stylesheet
 * exfiltrate content or cover the real UI. The rel/noopener case is here because it silently
 * regressed once already — sanitize-html applies its allow-list after transforms, so an attribute
 * added by a transform is stripped again unless the allow-list names it.
 */
import { renderUserHtml, scopeCss } from "../src/services/UserContentUtils.js";
import { scopeLayoutCss } from "../src/services/LayoutCssUtils.js";
import { synchronizeSiteLayout } from "../src/services/SiteLayoutUtils.js";
import { renderRawText } from "../src/MarkdownUtils.js";

const checks: [string, boolean][] = [];
const check = (name: string, pass: boolean) => checks.push([name, pass]);

// --- HTML ---
const script = renderUserHtml('Hello <script>alert(1)</script> world');
check("strips <script>", !script.includes("<script") && !script.includes("alert(1)"));

const onerror = renderUserHtml('<img src="x" onerror="alert(1)">');
check("strips event handlers", !onerror.includes("onerror"));

const literalOnerror = renderUserHtml("<img src=x onerror=alert(1)>");
check(
  "strips an unquoted img onerror payload",
  !literalOnerror.includes("onerror") && !literalOnerror.includes("alert(1)"),
);

const jsHref = renderUserHtml('<a href="javascript:alert(1)">x</a>');
check("strips javascript: href", !jsHref.includes("javascript:"));

const dataSvg = renderUserHtml('<img src="data:image/svg+xml,<svg onload=alert(1)>">');
check("strips data: URLs", !dataSvg.includes("data:"));

const iframe = renderUserHtml('<iframe src="https://evil.test"></iframe>');
check("strips <iframe>", !iframe.includes("<iframe"));

const link = renderUserHtml('[x](https://example.com)');
check("external links get rel/noopener", link.includes("noopener") && link.includes("nofollow"));

const styleAttr = renderUserHtml('<p style="position:fixed">x</p>');
check("strips inline style attribute", !styleAttr.includes("style="));

const keeps = renderUserHtml('# Title\n\n**bold** and `code`');
check("keeps ordinary markdown", keeps.includes("<h1") && keeps.includes("<strong"));

// The repository/CMS renderer is a second Markdown entry point. Its component comment markers
// remain inert, while both ordinary page HTML and the HTML inside a component use the same policy.
const rawPage = renderRawText(
  '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<a href="javascript:alert(2)">x</a>',
  "https://assets.example.com",
).html;
check(
  "sanitizes raw HTML in repository pages",
  !rawPage.includes("<script") &&
    !rawPage.includes("onerror") &&
    !rawPage.includes("javascript:") &&
    !rawPage.includes("alert("),
);

const componentPage = renderRawText(
  '<Info title="Notice">safe **body** <img src=x onerror=alert(1)></Info>',
  "https://assets.example.com",
).html;
check(
  "sanitizes custom component bodies and preserves their sentinel",
  componentPage.includes("<!--md-component:info:Notice-->") &&
    componentPage.includes("<strong>body</strong>") &&
    !componentPage.includes("onerror") &&
    !componentPage.includes("alert(1)"),
);

const rewrittenImage = renderRawText(
  '<img src="public/photo.jpg" alt="photo">',
  "https://assets.example.com",
).html;
check(
  "rewrites page images without injecting an inline error handler",
  rewrittenImage.includes('src="https://assets.example.com/photo.jpg"') && !rewrittenImage.includes("onerror"),
);

// --- CSS ---
const scoped = scopeCss("p { color: red }", ".scope-abc");
check("scopes selectors", scoped.css.includes(".scope-abc p"));

const bodyRule = scopeCss("body { background: black }", ".scope-abc");
check("rewrites body to the scope", bodyRule.css.includes(".scope-abc") && !/(^|\s)body\s*\{/.test(bodyRule.css));

const fixed = scopeCss(".x { position: fixed; top: 0 }", ".scope-abc");
check("drops position:fixed", !fixed.css.includes("fixed") && fixed.removed.length > 0);

const ext = scopeCss(".x { background: url(https://evil.test/pixel.png) }", ".scope-abc");
check("drops external url()", !ext.css.includes("evil.test") && ext.removed.length > 0);

const imp = scopeCss('@import "https://evil.test/x.css"; .a { color: red }', ".scope-abc");
check("drops @import", !imp.css.includes("@import"));

const pe = scopeCss(".x { pointer-events: none }", ".scope-abc");
check("drops pointer-events", !pe.css.includes("pointer-events"));

const frames = scopeCss("@keyframes spin { from { opacity: 0 } to { opacity: 1 } }", ".scope-abc");
check("leaves keyframe stops alone", !frames.css.includes(".scope-abc from"));

const layout = scopeLayoutCss({
  root: {
    id: "root",
    kind: "container",
    style: { css: ".x { color: red; position: fixed }", scopedCss: "body { display: none }" },
    children: [{ id: "child", kind: "text", style: { css: "p { color: blue }" } }],
  },
}) as { root: { style: { scopedCss: string }; children: { style: { scopedCss: string } }[] } };
check(
  "scopes current root layouts and replaces forged scoped CSS",
  layout.root.style.scopedCss.includes('[data-widget-id="root"] .x') &&
    !layout.root.style.scopedCss.includes("position: fixed") &&
    !layout.root.style.scopedCss.includes("body") &&
    layout.root.children[0]!.style.scopedCss.includes('[data-widget-id="child"] p'),
);

const sharedSource = {
  root: {
    id: "root-home",
    kind: "container",
    children: [
      {
        id: "header",
        kind: "container",
        props: { anchor: "top", role: "header", inheritance: "site" },
        style: { opacity: 0.5 },
        children: [
          { id: "home", kind: "title", props: { label: "Home" } },
          { id: "local", kind: "title", props: { label: "Home-only", inheritance: "page" } },
        ],
      },
      {
        id: "content-slot",
        kind: "container",
        props: { anchor: "center" },
        children: [{ id: "shared-callout", kind: "text", props: { inheritance: "site", text: "New" } }],
      },
    ],
  },
};
const sharedTarget = {
  root: {
    id: "root-about",
    kind: "container",
    children: [
      {
        id: "header",
        kind: "container",
        props: { anchor: "top", role: "header", inheritance: "site" },
        style: { opacity: 0.1 },
        children: [
          { id: "home", kind: "title", props: { label: "Old" } },
          { id: "local", kind: "title", props: { label: "About-only", inheritance: "page" } },
        ],
      },
      {
        id: "content-slot",
        kind: "container",
        props: { anchor: "center" },
        children: [{ id: "shared-callout", kind: "text", props: { inheritance: "site", text: "Old" } }],
      },
    ],
  },
};
const synchronized = synchronizeSiteLayout(sharedSource, sharedTarget) as typeof sharedTarget;
const synchronizedHeader = synchronized.root.children[0]!;
check("synchronizes shared website chrome", synchronizedHeader.style?.opacity === 0.5);
check(
  "preserves page-only children inside shared chrome",
  synchronizedHeader.children?.some((child) => child.props?.label === "About-only") === true,
);
check(
  "preserves page content while synchronizing chrome",
  synchronized.root.children.some((child) => child.id === "content-slot"),
);
check(
  "synchronizes site-wide widgets inside page-local containers",
  synchronized.root.children[1]?.children?.[0]?.props?.text === "New",
);

const overriddenTarget = structuredClone(sharedTarget);
overriddenTarget.root.children[0]!.props!.inheritance = "page";
const keptOverride = synchronizeSiteLayout(sharedSource, overriddenTarget) as typeof sharedTarget;
check("does not replace a page-level header override", keptOverride.root.children[0]!.style?.opacity === 0.1);

let failed = 0;
for (const [name, pass] of checks) {
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
}
console.log(failed === 0 ? `\nAll ${checks.length} checks passed` : `\n${failed} of ${checks.length} FAILED`);
process.exit(failed === 0 ? 0 : 1);
