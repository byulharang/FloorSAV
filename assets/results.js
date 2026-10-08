/* Charts read the same verified table cells, so the two views cannot diverge. */
(() => {
  const $ = (s) => document.querySelector(s);
  const rows = [...document.querySelectorAll("#results-table tbody tr")].map(
    (row) => ({
      category: row.dataset.category,
      summary: row.classList.contains("summary-row"),
      title: row.cells[0].textContent.trim(),
      values: [2, 3, 5, 6].map((i) => Number(row.cells[i].textContent.trim())),
      delta: Number(row.cells[4].textContent.trim()),
    }),
  );
  let view = "chart",
    filter = "all";
  const labels = ["Video only", "FloorSAV", "Partial oracle", "Full oracle"];
  const shortTitles = {
    "Overall · QA-weighted average": "Overall",
    "Dynamic Relativity Overall": "Viewpoints",
    "Regional Overall": "Regions",
    "Path reasoning Overall": "Paths",
  };
  function render() {
    $("#results-chart").hidden = view !== "chart";
    $("#results-table").hidden = view !== "table";
    document
      .querySelectorAll("[data-results-view]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.resultsView === view)),
      );
    $('[data-filter="all"]').textContent =
      view === "chart" ? "Overview" : "All tasks";
    const showOracle = $("#oracle-toggle").checked;
    const selected =
      filter === "all"
        ? [
            rows.find((r) => r.title === "Overall · QA-weighted average"),
            ...rows.filter((r) => r.summary && r.category !== "overall"),
          ]
        : rows.filter((r) => r.category === filter && !r.summary);
    $("#results-chart").innerHTML = `<div class="chart-legend">${labels
      .slice(0, showOracle ? 4 : 2)
      .map((label, i) => `<span><i class="series-${i}"></i>${label}</span>`)
      .join(
        "",
      )}</div><div class="chart-scale" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div><div class="bar-groups">${selected
      .map(
        (r) =>
          `<article class="bar-group"><div class="bar-heading"><h3>${shortTitles[r.title] || r.title}</h3><span class="delta ${r.delta < 0 ? "negative" : ""}">${r.delta > 0 ? "+" : ""}${r.delta.toFixed(2)} pts</span></div><div class="bar-series">${r.values
            .slice(0, showOracle ? 4 : 2)
            .map(
              (value, i) =>
                `<div class="bar-row"><span class="sr-only">${labels[i]}: ${value.toFixed(2)}</span><div class="bar-track" aria-hidden="true"><span class="bar-fill series-${i}" style="width:${value}%"></span><span class="bar-value" style="left:${value}%">${value.toFixed(2)}</span></div></div>`,
            )
            .join("")}</div></article>`,
      )
      .join("")}</div>`;
    $("#chart-takeaway").textContent =
      filter === "dynamic"
        ? "Direction gains are substantial; Exo-to-Ego Distance decreases by 1.75 points."
        : filter === "regional"
          ? "Movement history and object landmarks support reasoning about places."
          : filter === "path"
            ? "The largest path gain is on static line-path search: +16.84 points."
            : "All category averages improve. Results vary by task—explore each category for the full picture.";
  }
  document.querySelectorAll("[data-results-view]").forEach((b) =>
    b.addEventListener("click", () => {
      view = b.dataset.resultsView;
      render();
    }),
  );
  document.querySelectorAll("[data-filter]").forEach((b) =>
    b.addEventListener("click", () => {
      filter = b.dataset.filter;
      render();
    }),
  );
  $("#oracle-toggle").addEventListener("change", render);
  render();
})();
