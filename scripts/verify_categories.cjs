/** Exercise real animation timing and hover intent without a local server. */
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base =
  process.env.SITE_URL ||
  pathToFileURL(path.join(__dirname, "../index.html")).href;
(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 950 },
      reducedMotion: "no-preference",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base, { waitUntil: "load" });
    const first = page.locator(".benchmark-cards article").first();
    const dialog = page.locator("#category-dialog");
    await first.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await first.hover();
    await page.waitForTimeout(100);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(450);
    assert(
      await dialog.isHidden(),
      "A passing pointer must not open the dialog",
    );
    await first.hover();
    await dialog.waitFor({ state: "visible" });
    await page.waitForTimeout(400);
    const rect = await dialog.boundingBox();
    assert(rect.width > (await first.boundingBox()).width * 2);
    assert(Math.abs(rect.x + rect.width / 2 - 720) < 2);
    assert(Math.abs(rect.y + rect.height / 2 - 475) < 2);
    await page.waitForFunction(
      () => document.querySelector(".category-task").dataset.phase === "1",
    );
    await page.locator(".diagram-play").click();
    const frozen = await page.locator(".category-task-grid").innerHTML();
    await page.waitForTimeout(1200);
    assert.equal(
      await page.locator(".category-task-grid").innerHTML(),
      frozen,
      "Pause must freeze the phase, actors and routes",
    );
    await page.locator(".diagram-play").click();
    await page.waitForFunction(
      () => document.querySelector(".category-task").dataset.phase === "2",
    );
    assert(
      (await page.locator(".diagram-step-text").first().innerText()).includes(
        "front-right",
      ),
    );

    await page.locator('.category-switch [data-category="1"]').click();
    const person = page
      .locator(".category-task")
      .first()
      .locator('[data-moving="other"]');
    const before = await person.getAttribute("transform");
    await page.waitForTimeout(600);
    assert.notEqual(
      await person.getAttribute("transform"),
      before,
      "The person must move between rooms",
    );
    await page.waitForFunction(
      () => document.querySelector(".category-task").dataset.phase === "2",
    );
    assert(
      await page
        .locator('[data-room="kitchen"]')
        .evaluate((el) => el.classList.contains("visited")),
    );
    await page.waitForTimeout(2600);
    assert.equal(
      await page
        .locator(".category-task")
        .nth(1)
        .locator(".room.visited")
        .count(),
      3,
    );

    await page.locator('.category-switch [data-category="2"]').click();
    await page.waitForFunction(
      () => document.querySelector(".category-task").dataset.phase === "1",
    );
    const route = page
      .locator(".category-task")
      .last()
      .locator('[data-moving="0"]');
    const routeStart = await route.getAttribute("transform");
    await page.waitForTimeout(600);
    assert.notEqual(
      await route.getAttribute("transform"),
      routeStart,
      "Trajectory distance must follow the bent route",
    );
    await page.waitForFunction(
      () => document.querySelector(".category-task").dataset.phase === "2",
    );
    assert.equal(await route.getAttribute("transform"), "translate(174 53)");
    assert.equal(
      await page
        .locator(".category-task")
        .last()
        .locator('[data-moving="1"]')
        .getAttribute("transform"),
      "translate(352 53)",
    );

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(
      () =>
        document.querySelector(".diagram-play").textContent ===
        "Play animations",
    );
    const reducedFrame = await page.locator(".category-task-grid").innerHTML();
    await page.waitForTimeout(400);
    assert.equal(
      await page.locator(".category-task-grid").innerHTML(),
      reducedFrame,
    );
    await page.mouse.click(8, 8);
    await dialog.waitFor({ state: "hidden" });
    await page.waitForTimeout(650);
    assert(
      await dialog.isHidden(),
      "Closing must not immediately reopen the hovered source card",
    );
    assert.equal(
      await page.locator(".category-task-grid").innerHTML(),
      reducedFrame,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: hover intent, centered expansion, three animation phases, pause/resume, moving people, complete trajectories, reduced motion, backdrop dismissal and cleanup",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
