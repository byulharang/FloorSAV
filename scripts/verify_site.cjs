/** Interaction checks for guided media and the CSV-backed chart/table views. */
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
  try {
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
    const aligned = async (p, t) =>
      p.waitForFunction(
        (t) =>
          [
            document.querySelector("#case-ego"),
            document.querySelector("#case-map"),
          ].every(
            (v) =>
              v.readyState >= 2 &&
              !v.seeking &&
              v.paused &&
              Math.abs(v.currentTime - t) < 0.08,
          ),
        t,
      );
    const screenshot = async (p, selector, name) =>
      p
        .locator(selector)
        .screenshot({
          path: path.join(output, name + ".png"),
          style: ".topbar{visibility:hidden}",
        });
    await page.goto(base, { waitUntil: "networkidle" });
    assert.equal(await page.locator("h1").textContent(), "FloorSAV");
    assert(
      await page
        .locator(".kaist-logo")
        .evaluate((i) => i.complete && i.naturalWidth === 319),
    );
    await page.waitForFunction(
      () => !document.querySelector("#hero-ego").paused,
    );
    await page.screenshot({ path: path.join(output, "desktop-hero.png") });
    checks.push(
      "Entry point, supplied-paper logo and visible muted overview load",
    );
    await page.locator("#examples").scrollIntoViewIfNeeded();
    await aligned(page, 6);
    await screenshot(page, "#case-panel", "walkthrough-ready");
    await page.locator("#start-walkthrough").click();
    await page.waitForTimeout(700);
    let values = await page
      .locator("#case-ego")
      .evaluate((v) => ({
        t: v.currentTime,
        paused: v.paused,
        map: document.querySelector("#case-map").currentTime,
      }));
    assert(!values.paused && values.t > 2);
    assert(Math.abs(values.t - values.map) < 0.2);
    await aligned(page, 6);
    assert.equal(
      await page.locator('[data-step="0"]').getAttribute("aria-current"),
      "step",
    );
    await page.waitForTimeout(650);
    assert(await page.locator("#case-ego").evaluate((v) => v.paused));
    checks.push(
      "A guided scene plays both streams together, stops automatically, and waits for the reader",
    );
    await page.locator("#start-walkthrough").click();
    await aligned(page, 18.75);
    assert.equal(
      await page.locator('[data-step="1"]').getAttribute("aria-current"),
      "step",
    );
    await page.locator("#start-walkthrough").click();
    await aligned(page, 18.75);
    assert.equal(
      await page.locator('[data-step="2"]').getAttribute("aria-current"),
      "step",
    );
    await page.locator("#start-walkthrough").click();
    await aligned(page, 18.75);
    assert.equal(
      await page.locator("#floorsav-answer").textContent(),
      "Kitchen area",
    );
    assert(await page.locator(".answers").isVisible());
    await screenshot(page, "#case-panel", "region-answer");
    checks.push(
      "The question clip returns to the exact query frame; later explanations retain that frame",
    );
    await page.locator("#annotations").uncheck();
    assert(await page.locator("#map-overlay").isHidden());
    await page.locator("#annotations").check();
    for (const [name, time, answer] of [
      ["path", 5.6, "Wall-mounted TV"],
      ["viewpoint", 5.5, "Back-left"],
    ]) {
      await page.locator("#tab-" + name).click();
      for (let i = 0; i < 4; i++) {
        await page.locator(`[data-step="${i}"]`).click();
        await aligned(page, time);
      }
      assert.equal(
        await page.locator("#floorsav-answer").textContent(),
        answer,
      );
      await screenshot(page, "#case-panel", name + "-answer");
    }
    checks.push(
      "All three cases align narrative, answer and both paused streams; highlight toggle works",
    );
    await page.locator("#case-seek").evaluate((el) => {
      el.value = "9";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await aligned(page, 9);
    assert(await page.locator("#map-overlay").isHidden());
    assert.match(
      await page.locator("#case-insight").textContent(),
      /exploring/,
    );
    await page.locator("#start-walkthrough").click();
    await aligned(page, 5.5);
    checks.push(
      "Manual seeking hides guide-only annotations; resuming restores the matching question frame",
    );
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
    await aligned(page, 5.6);
    await page.locator("#case-expand").click();
    assert.equal(
      await page.locator("#case-playback").getAttribute("role"),
      "dialog",
    );
    await page.screenshot({ path: path.join(output, "expanded-player.png") });
    await page.keyboard.press("Escape");
    await page.locator("#original-figure").click();
    assert(await page.locator("#figure-dialog").evaluate((d) => d.open));
    await page.keyboard.press("Escape");
    checks.push(
      "Keyboard tabs, next example, expanded player and paper-figure dialog work",
    );
    assert(await page.locator("#results-chart").isVisible());
    assert(await page.locator("#results-table").isHidden());
    assert.equal(await page.locator(".bar-group").count(), 4);
    assert.equal(
      await page.locator(".bar-value").first().textContent(),
      "58.30",
    );
    await page.locator('[data-filter="dynamic"]').click();
    assert.equal(await page.locator(".bar-group").count(), 4);
    assert.match(await page.locator(".delta.negative").textContent(), /-1.75/);
    await page.locator("#oracle-toggle").check();
    assert.equal(await page.locator(".bar-row").count(), 16);
    await page.locator('[data-results-view="table"]').click();
    assert(await page.locator("#results-chart").isHidden());
    assert.equal(await page.locator("thead .oracle-column:visible").count(), 2);
    await page.locator('[data-filter="regional"]').click();
    assert.equal(await page.locator("tbody tr:visible").count(), 5);
    await page.locator('[data-filter="all"]').click();
    assert.equal(await page.locator("tbody tr:visible").count(), 14);
    await page.locator("#oracle-toggle").uncheck();
    await page.locator('[data-results-view="chart"]').click();
    await screenshot(page, "#results", "desktop-results");
    checks.push(
      "Graph is the default; category/oracle filters and table toggling preserve exact scores and negative results",
    );
    await page.locator('[data-render-step="4"]').click();
    assert.equal(
      await page.locator("#render-step-title").textContent(),
      "Render the floormap video",
    );
    await page.locator("[data-cite]").first().click();
    await page.waitForFunction(
      () => document.querySelector("#toast").textContent.length > 0,
    );
    checks.push("Method illustration and citation controls remain functional");
    for (const width of [390, 768, 1280]) {
      const p = await browser.newPage({
        viewport: { width, height: 844 },
        reducedMotion: "reduce",
      });
      p.on("pageerror", (e) => errors.push(e.message));
      await p.goto(base, { waitUntil: "networkidle" });
      assert(await p.locator("#hero-ego").evaluate((v) => v.paused));
      await p.locator("#tab-path").click();
      await p.locator('[data-step="3"]').click();
      await aligned(p, 5.6);
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390) {
        assert.equal(
          await p
            .locator('button[data-evidence-view="map"]')
            .getAttribute("aria-pressed"),
          "true",
        );
        assert(await p.locator("#case-ego").isHidden());
        assert(await p.locator("#case-map").isVisible());
        const size = await p.locator("#case-map").boundingBox();
        assert(size.width > 280);
        await p.locator('button[data-evidence-view="video"]').click();
        assert(await p.locator("#case-ego").isVisible());
        await p.locator('button[data-evidence-view="map"]').click();
      }
      await screenshot(p, "#case-panel", `width-${width}-example`);
      await screenshot(p, "#results", `width-${width}-results`);
      assert(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await p.close();
      checks.push(
        `${width}px layout has no horizontal overflow; reduced motion prevents autoplay`,
      );
    }
    await page.locator("#tab-region").click();
    await aligned(page, 6);
    await page.screenshot({
      path: path.join(output, "desktop-full.png"),
      fullPage: true,
      style: ".topbar{visibility:hidden}",
    });
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
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
