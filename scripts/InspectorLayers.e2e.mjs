import { chromium } from "playwright";

const base = process.env.E2E_BASE ?? "http://localhost:5173";
const output = process.env.E2E_OUTPUT ?? "/tmp/hisuiki-inspector-layers.png";
const stamp = Date.now();
const email = `inspector-${stamp}@example.com`;
const password = "inspector-test-password";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const problems = [];
page.on("console", (message) => {
  const text = message.text();
  // The local asset bucket is intentionally sparse. Chromium reports each optional missing image
  // as this generic console error, which says nothing about the interaction being tested.
  if (message.type() === "error" && !text.startsWith("Failed to load resource")) {
    problems.push(`console: ${text}`);
  }
});
page.on("pageerror", (error) => problems.push(`pageerror: ${String(error)}`));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
  console.log(`PASS  ${message}`);
};

try {
  await page.goto(`${base}/signin`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Need an account?" }).click();
  await page.locator('.signin-form input[autocomplete="name"]').fill("Inspector test");
  await page.locator('.signin-form input[type="email"]').fill(email);
  await page.locator('.signin-form input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 15_000 });

  await page.goto(`${base}/boards`, { waitUntil: "networkidle" });
  const create = page.locator(".board-create");
  await create.locator("input").nth(0).fill("Inspector interaction test");
  await create.locator("input").nth(1).fill(`inspector-${String(stamp).slice(-8)}`);
  await create.getByRole("button", { name: "Create board" }).click();
  await page.locator(".board-manager-card").first().waitFor();
  await page.locator(".board-manager-card").first().getByRole("link", { name: "Edit layout" }).click();
  await page.locator(".page-root > .widget-board.is-editing").waitFor({ timeout: 15_000 });

  const appWidthBeforeSelection = await page.locator("#app").evaluate((element) => element.getBoundingClientRect().width);
  const canvasWidgets = page.locator(".page-root > .widget-board > .widget");
  assert(await canvasWidgets.count() >= 2, "editable board exposes draggable widgets");
  await canvasWidgets.nth(0).dragTo(canvasWidgets.nth(1));
  assert(await page.locator(".inspector").count() === 0, "canvas selection does not mount the Inspector mid-drag");
  const appWidthAfterSelection = await page.locator("#app").evaluate((element) => element.getBoundingClientRect().width);
  assert(appWidthAfterSelection === appWidthBeforeSelection, "canvas width stays stable through dragstart");

  await page.getByRole("button", { name: "Inspector" }).click();
  await page.locator(".inspector").waitFor();
  await page.getByRole("tab", { name: "Layers" }).click();

  const shadowOpacity = await page.locator(".page-root").evaluate((element) =>
    globalThis.getComputedStyle(element, "::before").opacity,
  );
  assert(shadowOpacity === "0", "decorative page shadow is hidden in edit mode");

  const rootLayers = page.locator(
    ".inspector-layer-list.is-root > .inspector-layer-item > .inspector-layer-list > .inspector-layer-item > .inspector-layer-row",
  );
  assert(await rootLayers.count() >= 2, "Layers exposes the root child order");
  const before = await rootLayers.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-layer-id")));
  const targetBox = await rootLayers.nth(1).boundingBox();
  if (!targetBox) throw new Error("Could not measure the second root layer");
  await rootLayers.nth(0).dragTo(rootLayers.nth(1), {
    targetPosition: { x: Math.max(8, targetBox.width / 2), y: Math.max(1, targetBox.height - 2) },
  });
  await page.waitForTimeout(250);
  const after = await rootLayers.evaluateAll((rows) => rows.map((row) => row.getAttribute("data-layer-id")));
  assert(after[0] === before[1] && after[1] === before[0], "dragging a layer adjusts sibling order");

  const countBeforeDuplicate = await page.locator(".inspector-layer-row[draggable=true]").count();
  await rootLayers.nth(0).click({ button: "right" });
  assert(await page.getByRole("menuitem", { name: "Duplicate" }).count() === 1, "right-click opens widget management actions");
  assert(await page.getByRole("menuitem", { name: /Move (up|down)/ }).count() >= 1, "context menu exposes order controls");
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await page.waitForTimeout(200);
  assert(
    await page.locator(".inspector-layer-row[draggable=true]").count() > countBeforeDuplicate,
    "duplicate action inserts a new layer",
  );

  await page.screenshot({ path: output, fullPage: true });
  assert(problems.length === 0, `browser console stays clean${problems.length ? `: ${problems.join("; ")}` : ""}`);
} finally {
  await browser.close();
}
