import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://10.100.50.7:5173";
const SHOT = process.env.CLAUDE_JOB_DIR + "/tmp";
const stamp = Date.now();
const email = `dummy${stamp}@example.com`;
const password = "dummy-password-123";
const handle = `dummy${String(stamp).slice(-6)}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

const problems = [];
page.on("console", (m) => { if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 200)}`); });
page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 200)}`));
const log = (...a) => console.log(...a);

// Account, handle, customize.
await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /need an account/i }).click();
await page.waitForTimeout(300);
await page.locator("input").nth(0).fill(`Dummy ${stamp}`);
await page.locator('input[type="email"]').fill(email);
await page.locator('input[type="password"]').fill(password);
await page.locator('button[type="submit"]').first().click();
await page.waitForTimeout(2500);

await page.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.locator(".editor-commit-input").first().fill(handle);
await page.getByRole("button", { name: /save/i }).first().click();
await page.waitForTimeout(1500);

await page.goto(`${BASE}/customize`, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SHOT}/e2e-customize.png` });

log("— what is on the customize page —");
for (const sel of [".board-settings", ".widget-gallery", ".widget-gallery-toggle", ".widget-board", ".widget", ".widget-resize-handle", ".inspector"]) {
  log(`  ${sel.padEnd(26)} ${await page.locator(sel).count()}`);
}

// Open the board settings panel.
const gear = page.locator(".board-settings");
if (await gear.count()) {
  await gear.click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOT}/e2e-inspector.png` });

  const tabs = await page.locator(".inspector-tab").evaluateAll((ns) => ns.map((n) => n.textContent.trim()));
  log(`\ninspector open: ${await page.locator(".inspector").count()}  tabs: ${tabs.join(" | ")}`);
  const box = await page.locator(".inspector").first().boundingBox();
  log(`inspector box: ${box ? `${Math.round(box.width)}x${Math.round(box.height)} @${Math.round(box.x)},${Math.round(box.y)}` : "none"}`);

  // The widgets tab.
  const widgetsTab = page.locator(".inspector-tab", { hasText: /widgets/i });
  if (await widgetsTab.count()) {
    await widgetsTab.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOT}/e2e-widgets-tab.png` });
    const b2 = await page.locator(".inspector").first().boundingBox();
    log(`widgets tab: gallery=${await page.locator(".inspector .widget-gallery").count()} cards=${await page.locator(".inspector .widget-card").count()} toggleBar=${await page.locator(".inspector .widget-gallery-toggle").count()}`);
    log(`inspector box now: ${b2 ? `${Math.round(b2.width)}x${Math.round(b2.height)}` : "none"}`);
  } else {
    log("!! no widgets tab");
  }
} else {
  log("!! no board settings gear");
}

log(`\nconsole problems: ${problems.length ? "\n  " + problems.join("\n  ") : "none"}`);
await browser.close();
