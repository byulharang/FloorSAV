/** File-based checks: no preview server is required. SITE_URL optionally tests a deployment. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base =
  process.env.SITE_URL ||
  pathToFileURL(path.join(__dirname, "../index.html")).href;
const output = process.env.REVIEW_OUTPUT || "/tmp/floorsav-review";
fs.mkdirSync(output, { recursive: true });
const checks = [],
  errors = [];
(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox"],
  });
  const open = async (width = 1440, reducedMotion = "reduce") => {
    const p = await browser.newPage({
      viewport: { width, height: 1100 },
      hasTouch: width < 760,
      isMobile: width < 760,
      reducedMotion,
    });
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(base, { waitUntil: "load" });
    return p;
  };
  const aligned = (p, t) =>
    p.waitForFunction(
      (t) =>
        ["#case-ego", "#case-map"].every((s) => {
          const v = document.querySelector(s);
          return (
            v.readyState >= 2 &&
            !v.seeking &&
            v.paused &&
            Math.abs(v.currentTime - t) < 0.08
          );
        }),
      t,
    );
  const capture = (p, selector, name) =>
    p.locator(selector).screenshot({
      path: path.join(output, name + ".png"),
      style: ".topbar{visibility:hidden}",
    });
  try {
    const p = await open();
    assert.equal(await p.locator("h1").innerText(), "FloorSAV");
    assert(
      await p
        .locator(".kaist-logo")
        .evaluate((i) => i.complete && i.naturalWidth === 319),
    );
    const published = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../benchmark/results.json")),
    );
    const rendered = await p
      .locator("#results-table tbody tr")
      .evaluateAll((rows) =>
        rows.map((r) => [2, 3, 5, 6].map((i) => +r.cells[i].textContent)),
      );
    assert.deepEqual(
      rendered,
      published.rows.map((r) => r.scores),
    );
    assert.equal(await p.locator("[data-radar-series]").count(), 2);
    const axisMaxima = () =>
      p
        .locator("[data-axis-max]")
        .evaluateAll((labels) => labels.map((el) => +el.dataset.axisMax));
    assert.deepEqual(await axisMaxima(), [70, 65, 65, 55, 30, 85, 100, 100]);
    assert.equal(await p.locator(".radar-origin").textContent(), "0");
    await p.locator("#oracle-toggle").check();
    assert.deepEqual(await axisMaxima(), [70, 65, 65, 55, 30, 85, 100, 100]);
    // The low-valued Trajectory axis should now use most of its 0–30 radius,
    // while the tooltip keeps the reported score of 28.2.
    const trajectory = await p
      .locator('[data-radar-series="3"] circle[data-axis="4"]')
      .evaluate((el) => {
        const svg = el.closest("svg"),
          outer = [...svg.querySelectorAll(".radar-grid")]
            .at(-1)
            .points.getItem(4);
        const center = svg.viewBox.baseVal.height / 2;
        return {
          score: +el.dataset.score,
          radius: (el.cy.baseVal.value - center) / (outer.y - center),
        };
      });
    assert.equal(trajectory.score, 28.2);
    assert(Math.abs(trajectory.radius - 0.94) < 0.00001);
    assert.equal(await p.locator("[data-radar-series]").count(), 4);
    assert.equal(await p.locator(".bar-row").count(), 16);
    await p.locator('[data-results-view="table"]').click();
    assert(
      await p.locator("#results-table th.oracle-column").first().isVisible(),
    );
    await p.locator('[data-filter="dynamic"]').click();
    assert.equal(await p.locator("#results-table tbody tr:visible").count(), 6);
    // Filtering SAVED tasks must not filter the separate radar table.
    await p.locator(".radar-values summary").click();
    assert.equal(await p.locator(".radar-values tbody tr:visible").count(), 8);
    await p.locator(".radar-values summary").click();
    await p.locator('[data-results-view="chart"]').click();
    assert.equal(await p.locator(".bar-row").count(), 16);
    assert(
      (await p.locator("#chart-takeaway").innerText()).includes("decreases"),
    );
    await capture(p, ".radar-panel", "radar-gt");
    await p.locator("#oracle-toggle").uncheck();
    assert.equal(await p.locator("[data-radar-series]").count(), 2);
    assert.equal(await p.locator(".bar-row").count(), 8);
    await p.locator('[data-filter="all"]').click();
    await capture(p, "#results", "results");
    checks.push(
      "Released table scores, eight-axis radar, all GT series, graph/table and category switches",
    );
    for (const [i, count] of [
      [0, 4],
      [1, 2],
      [2, 3],
    ]) {
      const card = p.locator(".benchmark-cards article").nth(i),
        button = card.locator("button");
      await card.hover();
      assert.equal(await button.getAttribute("aria-expanded"), "true");
      assert.equal(await card.locator(".task-details li").count(), count);
      await button.focus();
      await p.keyboard.press("Escape");
      assert.equal(await button.getAttribute("aria-expanded"), "false");
      await p.keyboard.press("Enter");
      assert.equal(await button.getAttribute("aria-expanded"), "true");
    }
    await capture(p, ".benchmark-cards", "benchmark-expanded");
    checks.push(
      "All nine task explanations available with pointer and keyboard",
    );
    for (let i = 0; i < 5; i++) {
      await p.locator(`[data-render-step="${i}"]`).click();
      assert.equal(
        await p.locator("#render-player").getAttribute("data-phase"),
        String(i),
      );
      await capture(p, "#render-player", "method-" + i);
    }
    await p.locator("#tab-path").click();
    await p.locator('[data-step="1"]').click();
    await aligned(p, 5.6);
    await p.locator("#start-walkthrough").click(); // Explicit pause cancels the countdown.
    await p.waitForTimeout(2800);
    await aligned(p, 5.6);
    assert.equal(
      await p.locator("#start-walkthrough").innerText(),
      "Resume ▶",
    );
    await p.locator("#next-step").click();
    assert.equal(
      await p.locator('[data-step="2"]').getAttribute("aria-current"),
      "step",
    );
    await p.locator("#case-play").click(); // Resume the timed explanation from a step without a motion segment.
    await p.waitForFunction(
      () =>
        document
          .querySelector('[data-step="3"]')
          .getAttribute("aria-current") === "step",
    );
    await p.waitForFunction(
      () =>
        !document.querySelector("#case-ego").paused &&
        document.querySelector("#case-ego").currentTime > 6,
    );
    await p.locator("#case-play").click();
    await p.locator("#case-seek").evaluate((el) => {
      el.value = 12;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await aligned(p, 12);
    assert(await p.locator("#map-overlay").isHidden());
    await p.locator("#case-play").click();
    await p.waitForFunction(
      () => document.querySelector("#case-ego").currentTime > 12.2,
    );
    await p.locator("#case-play").click();
    await p.locator('[data-step="0"]').click();
    await p.locator("#tab-region").click();
    await p.waitForTimeout(2800);
    await aligned(p, 0);
    checks.push(
      "Manual pause survives the auto-hold; next, resume, seek, and case switching cancel stale playback",
    );
    await p.locator("#tab-viewpoint").click();
    await p.locator('[data-step="3"]').click();
    await p.locator("#start-walkthrough").click();
    await aligned(p, 5.5);
    await capture(p, "#case-panel", "viewpoint-explanation");
    await p.locator("#annotations").uncheck();
    assert.equal(await p.locator("#map-view-label").innerText(), "2D floormap");
    await p.locator("#annotations").check();
    assert.equal(
      await p.locator("#map-view-label").innerText(),
      "Coordinate sketch",
    );
    await p.locator("#case-expand").click();
    await p.keyboard.press("Tab");
    assert(
      await p.evaluate(() =>
        document
          .querySelector("#case-playback")
          .contains(document.activeElement),
      ),
    );
    await p.keyboard.press("Escape");
    checks.push(
      "Coordinate reconstruction labels, overlay visibility and expanded-player keyboard focus",
    );
    await p.close();

    // Real-time playback: every original clip reaches its end after four 2.5-second holds.
    await Promise.all(
      ["region", "path", "viewpoint"].map(async (name) => {
        const page = await open();
        await page.locator("#tab-" + name).click();
        await page.evaluate(() => {
          window.tourRecord = { holds: [], sync: [] };
          let current = null;
          window.tourSampler = setInterval(() => {
            const ego = document.querySelector("#case-ego"),
              map = document.querySelector("#case-map");
            const text = document.querySelector("#playback-state").textContent;
            const hold = /Highlight (\d)/.exec(text);
            if (hold && (!current || current.step !== +hold[1])) {
              if (current) current.end = performance.now();
              current = {
                step: +hold[1],
                time: ego.currentTime,
                start: performance.now(),
                end: null,
              };
              window.tourRecord.holds.push(current);
            } else if (!hold && current) {
              current.end = performance.now();
              current = null;
            }
            if (!ego.paused && !ego.seeking && !map.seeking)
              window.tourRecord.sync.push(
                Math.abs(ego.currentTime - map.currentTime),
              );
          }, 30);
        });
        await page.locator("#case-play").click();
        await page.waitForFunction(
          () =>
            document.querySelector("#playback-state").textContent ===
            "Full clip complete",
          null,
          { timeout: 60000 },
        );
        const data = await page.evaluate(() => ({
          ...window.tourRecord,
          time: document.querySelector("#case-ego").currentTime,
          duration: document.querySelector("#case-ego").duration,
          mapTime: document.querySelector("#case-map").currentTime,
        }));
        assert.deepEqual(
          data.holds.map((h) => h.step),
          [1, 2, 3, 4],
          name,
        );
        assert(
          data.holds.every(
            (h) => h.end - h.start >= 2300 && h.end - h.start < 3300,
          ),
          JSON.stringify(data.holds),
        );
        assert(
          Math.abs(data.time - data.duration) < 0.1,
          name + " must reach original end",
        );
        assert(
          Math.abs(data.time - data.mapTime) < 0.2,
          name + " map must reach original end",
        );
        assert(Math.max(...data.sync) < 0.3, name + " pair drift");
        assert(await page.locator("#map-overlay").isHidden());
        checks.push(
          `${name}: full ${data.duration}s clip, four timed pauses, synchronized playback and automatic completion`,
        );
        await page.close();
      }),
    );
    for (const width of [360, 390, 768]) {
      const mobile = await open(width);
      assert(
        (await mobile.evaluate(() => document.documentElement.scrollWidth)) <=
          width,
      );
      await mobile.locator("#oracle-toggle").check();
      await capture(mobile, ".radar-panel", "radar-" + width);
      if (width < 760) await mobile.locator(".task-expand").first().tap();
      else await mobile.locator(".benchmark-cards article").first().hover();
      assert.equal(
        await mobile
          .locator(".task-expand")
          .first()
          .getAttribute("aria-expanded"),
        "true",
      );
      if (width < 760) {
        await mobile.locator("#tab-viewpoint").click();
        await mobile.locator('[data-step="3"]').click();
        await mobile.locator("#start-walkthrough").click();
        await mobile.locator('button[data-evidence-view="map"]').click();
        await capture(mobile, "#case-panel", "mobile-evidence-" + width);
      }
      assert(
        (await mobile.evaluate(() => document.documentElement.scrollWidth)) <=
          width,
      );
      await mobile.close();
    }
    checks.push(
      "360, 390 and 768px layouts, touch disclosure and enlarged mobile map",
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, "checks.json"),
      JSON.stringify({ base, checks, errors }, null, 2),
    );
    console.log("PASS\n" + checks.join("\n"));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
