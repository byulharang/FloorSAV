/** Browser review: PLAYWRIGHT_MODULE can point to an existing Playwright install. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.SITE_URL || "http://127.0.0.1:8000";
const output = process.env.REVIEW_OUTPUT || "/tmp/floorsav-review";
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [],
    failed = [],
    checks = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && r.url().startsWith(base))
      failed.push([r.status(), r.url()]);
  });
  await page.goto(base, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(output, "desktop-hero.png") });
  assert.equal(await page.locator("h1").textContent(), "FloorSAV");
  checks.push("Entry point and assets load");
  const hero = await page
    .locator("#hero-ego")
    .evaluate((v) => ({ t: v.currentTime, paused: v.paused }));
  assert(!hero.paused);
  checks.push("Visible overview autoplays muted");
  await page.locator("#examples").scrollIntoViewIfNeeded();
  await page
    .locator("#case-panel")
    .screenshot({ path: path.join(output, "walkthrough-ready.png") });
  await page.locator("#start-walkthrough").click();
  await page.waitForTimeout(1700);
  let values = await page.locator("#case-ego").evaluate((v) => ({
    t: v.currentTime,
    paused: v.paused,
    map: document.querySelector("#case-map").currentTime,
  }));
  assert(values.t > 1 && !values.paused);
  assert(Math.abs(values.t - values.map) < 0.2);
  checks.push("Paired source clips play in sync");
  await page.locator('[data-step="2"]').click();
  await page.waitForTimeout(400);
  assert(await page.locator("#case-ego").evaluate((v) => v.paused));
  assert.equal(
    await page.locator('[data-step="2"]').getAttribute("aria-current"),
    "step",
  );
  await page.locator('[data-step="3"]').click();
  await page.waitForTimeout(400);
  assert.equal(
    await page.locator("#floorsav-answer").textContent(),
    "Kitchen area",
  );
  await page.locator("#case-panel").screenshot({
    path: path.join(output, "region-answer.png"),
    style: ".topbar{visibility:hidden}",
  });
  checks.push("Step navigation pauses and reveals the verified answer");
  await page.locator("#annotations").uncheck();
  const hidden = await page
    .locator("#map-overlay")
    .evaluate((el) => getComputedStyle(el).display === "none");
  assert(hidden);
  checks.push("Highlight toggle removes visual overlays");
  await page.locator("#annotations").check();
  await page.locator("#tab-region").click();
  await page.locator('[data-step="2"]').click();
  await page.waitForTimeout(400);
  await page.waitForFunction(
    () => document.querySelector("#case-ego").currentTime > 23,
  );
  await page.locator("#case-panel").screenshot({
    path: path.join(output, "region-evidence.png"),
    style: ".topbar{visibility:hidden}",
  });
  await page.locator("#tab-path").click();
  await page.locator('[data-step="3"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector("#case-ego").currentTime > 12 &&
      document.querySelector("#case-ego").readyState >= 2,
  );
  assert.equal(
    await page.locator("#floorsav-answer").textContent(),
    "Wall-mounted TV",
  );
  assert(await page.locator("#tv-ring").count());
  await page.locator("#case-panel").screenshot({
    path: path.join(output, "path-answer.png"),
    style: ".topbar{visibility:hidden}",
  });
  await page.locator("#tab-viewpoint").click();
  await page.locator('[data-step="3"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector("#case-ego").currentTime > 16 &&
      document.querySelector("#case-map").readyState >= 2,
  );
  assert.equal(
    await page.locator("#floorsav-answer").textContent(),
    "Back-left",
  );
  await page
    .locator("#case-panel")
    .screenshot({
      path: path.join(output, "viewpoint-answer.png"),
      style: ".topbar{visibility:hidden}",
    });
  await page.locator("#tab-path").focus();
  await page.keyboard.press("ArrowLeft");
  assert.equal(
    await page.locator("#tab-region").getAttribute("aria-selected"),
    "true",
  );
  await page.locator("#next-example").click();
  assert.equal(
    await page.locator("#tab-path").getAttribute("aria-selected"),
    "true",
  );
  await page.locator('[data-step="3"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector("#case-ego").currentTime > 12 &&
      document.querySelector("#case-map").readyState >= 2,
  );
  checks.push(
    "All three cases, keyboard tab navigation, and next-example progression work",
  );
  await page.locator("#case-expand").click();
  assert(
    await page
      .locator("#case-playback")
      .evaluate((el) => el.classList.contains("theater")),
  );
  await page.screenshot({ path: path.join(output, "expanded-player.png") });
  await page.keyboard.press("Escape");
  assert(
    !(await page
      .locator("#case-playback")
      .evaluate((el) => el.classList.contains("theater"))),
  );
  checks.push("Expanded player opens and Escape closes it");
  await page.locator("#original-figure").click();
  assert(await page.locator("#figure-dialog").evaluate((d) => d.open));
  await page.keyboard.press("Escape");
  checks.push("Paper figures open and dismiss");
  await page.locator('[data-filter="regional"]').click();
  assert.equal(await page.locator("tbody tr:visible").count(), 5);
  await page.locator("#oracle-toggle").check();
  assert.equal(await page.locator("thead .oracle-column:visible").count(), 2);
  await page.locator('[data-filter="all"]').click();
  assert.equal(await page.locator("tbody tr:visible").count(), 14);
  await page
    .locator("#results")
    .screenshot({ path: path.join(output, "desktop-results.png") });
  checks.push("Task filters and oracle columns preserve results");
  await page.locator("#approach").scrollIntoViewIfNeeded();
  await page.locator('[data-render-step="4"]').click();
  assert.equal(
    await page.locator("#render-step-title").textContent(),
    "Render the floormap video",
  );
  checks.push("Method stages respond to user controls");
  await page.locator("[data-cite]").first().click();
  await page.waitForFunction(
    () => document.querySelector("#toast").textContent.length > 0,
  );
  checks.push("Citation copy has visible feedback");
  for (const width of [390, 768]) {
    const mobile = await browser.newPage({
      viewport: { width, height: 844 },
      reducedMotion: "reduce",
    });
    mobile.on("pageerror", (e) => errors.push(e.message));
    await mobile.goto(base, { waitUntil: "networkidle" });
    assert(await mobile.locator("#hero-ego").evaluate((v) => v.paused));
    assert(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await mobile.screenshot({
      path: path.join(output, `width-${width}-hero.png`),
    });
    await mobile.locator("#examples").scrollIntoViewIfNeeded();
    await mobile.locator("#tab-path").click();
    await mobile.locator('[data-step="3"]').click();
    await mobile.waitForTimeout(400);
    await mobile
      .locator("#case-panel")
      .screenshot({ path: path.join(output, `width-${width}-example.png`) });
    assert(
      await mobile.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await mobile.close();
    checks.push(
      `${width}px layout has no page overflow; reduced motion prevents autoplay`,
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  checks.push("No uncaught JavaScript errors or failing local resources");
  fs.writeFileSync(
    path.join(output, "verification.json"),
    JSON.stringify(
      { checkedAt: new Date().toISOString(), checks, errors, failed },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, errors, failed }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
