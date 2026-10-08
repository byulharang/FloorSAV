const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const axePath = process.env.AXE_PATH || require.resolve("axe-core/axe.min.js");
const base =
  process.env.SITE_URL ||
  require("node:url").pathToFileURL(path.join(__dirname, "../index.html")).href;
const output = process.env.REVIEW_OUTPUT || "/tmp/floorsav-review";
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const results = [];
    for (const width of [1440, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      });
      await page.goto(base, { waitUntil: "networkidle" });
      await page.addScriptTag({ path: axePath });
      for (const state of ["initial", "path-answer", "expanded"]) {
        if (state === "path-answer") {
          await page.locator("#tab-path").click();
          await page.locator('[data-step="3"]').click();
          await page.locator("#start-walkthrough").click();
          await page.waitForFunction(
            () =>
              document.querySelector("#case-ego").currentTime >= 5.59 &&
              document.querySelector("#case-map").readyState >= 2,
          );
        }
        if (state === "expanded") await page.locator("#case-expand").click();
        const report = await page.evaluate(
          async () =>
            await axe.run(document, {
              runOnly: {
                type: "tag",
                values: ["wcag2a", "wcag2aa", "wcag21aa"],
              },
            }),
        );
        results.push({
          width,
          state,
          violations: report.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.map((n) => ({
              target: n.target,
              summary: n.failureSummary,
            })),
          })),
        });
        if (state === "expanded") {
          await page.keyboard.press("Tab");
          assert(
            await page.evaluate(() =>
              document
                .querySelector("#case-playback")
                .contains(document.activeElement),
            ),
          );
          await page.keyboard.press("Escape");
          assert.equal(
            await page.locator("#case-expand").getAttribute("aria-pressed"),
            "false",
          );
        }
      }
      await page.close();
    }
    let network = {
      skipped: "File preview: no HTTP server or network emulation.",
    };
    if (base.startsWith("http")) {
      const p = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce",
      });
      await p.goto(base, { waitUntil: "networkidle" });
      const cdp = await p.context().newCDPSession(p);
      await cdp.send("Network.enable");
      await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        downloadThroughput: 187500,
        uploadThroughput: 93750,
        latency: 150,
      });
      const started = Date.now();
      await p.locator("#tab-path").click();
      await p.locator('[data-step="3"]').click();
      await p.waitForFunction(
        () =>
          document.querySelector("#case-ego").currentTime >= 5.59 &&
          document.querySelector("#case-map").currentTime >= 5.59 &&
          document.querySelector("#case-ego").readyState >= 2 &&
          document.querySelector("#case-map").readyState >= 2,
        {},
        { timeout: 60000 },
      );
      network = {
        downloadMbps: 1.5,
        latencyMs: 150,
        seekMs: Date.now() - started,
        ...(await p.evaluate(() => ({
          egoTime: document.querySelector("#case-ego").currentTime,
          mapTime: document.querySelector("#case-map").currentTime,
          loading: document
            .querySelector("#case-playback")
            .getAttribute("aria-busy"),
        }))),
      };
      assert(Math.abs(network.egoTime - network.mapTime) < 0.1);
      await p.close();
    }
    const report = {
      checkedAt: new Date().toISOString(),
      results,
      network,
      note: "Automated checks supplement manual review; they do not establish full accessibility conformance.",
    };
    fs.writeFileSync(
      path.join(output, "accessibility-network.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    assert(results.every((r) => r.violations.length === 0));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
