/* SAVED values read the released Table 1 cells; SAVVY values are Table 4 in paper.pdf. */
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
  const labels = ["Baseline", "FloorSAV", "Partial GT map", "Full GT map"];
  const colors = ["#64748b", "#2456d6", "#a16207", "#087e71"];
  const shortTitles = {
    "Overall · QA-weighted average": "Overall",
    "Dynamic Relativity Overall": "Viewpoints",
    "Regional Overall": "Regions",
    "Path Reasoning Overall": "Paths",
  };
  const average = (...values) =>
    values[0].map(
      (_, i) => values.reduce((sum, v) => sum + v[i], 0) / values.length,
    );
  const task = (name) => rows.find((r) => r.title.startsWith(name)).values;
  const axes = [
    {
      label: "Ego",
      source: "SAVVY",
      detail: "Direction + distance",
      values: average([75.2, 75.8, 70.2, 68.3], [59.6, 55.4, 59.0, 61.0]),
    },
    {
      label: "Exo",
      source: "SAVVY",
      detail: "Direction + distance",
      values: average([31.7, 52.8, 52.3, 69.9], [37.0, 34.9, 37.9, 52.2]),
    },
    {
      label: "Ego → Exo",
      source: "SAVED",
      detail: "Direction + distance",
      values: average(
        task("Ego-to-Exo Direction"),
        task("Ego-to-Exo Distance"),
      ),
    },
    {
      label: "Exo → Ego",
      source: "SAVED",
      detail: "Direction + distance",
      values: average(
        task("Exo-to-Ego Direction"),
        task("Exo-to-Ego Distance"),
      ),
    },
    {
      label: "Trajectory",
      source: "SAVED",
      detail: "Trajectory Distance",
      values: task("Trajectory Distance"),
    },
    {
      label: "Line-path",
      source: "SAVED",
      detail: "Static + dynamic search",
      values: average(
        task("Line-Path Search (static)"),
        task("Line-Path Search (dynamic)"),
      ),
    },
    {
      label: "Location",
      source: "SAVED",
      detail: "Location Awareness",
      values: task("Location Awareness"),
    },
    {
      label: "Visit history",
      source: "SAVED",
      detail: "Visit History",
      values: task("Visit History"),
    },
  ];
  // Include every condition when choosing each linear scale; toggling GT never rescales.
  axes.forEach((axis) => {
    axis.maximum = Math.ceil(Math.max(...axis.values) / 5) * 5;
  });
  let view = "chart",
    filter = "all";
  const legend = (n) =>
    labels
      .slice(0, n)
      .map((label, i) => `<span><i class="series-${i}"></i>${label}</span>`)
      .join("");
  function renderRadar() {
    const n = $("#oracle-toggle").checked ? 4 : 2;
    const width = Math.max(300, Math.min(920, $("#results-radar").clientWidth));
    const small = width < 560,
      height = small ? 440 : 650;
    const cx = width / 2,
      cy = height / 2;
    const radius = small ? width * 0.29 : Math.min(205, width * 0.29);
    const radial = (i, fraction, r = radius) => {
      const angle = (i * Math.PI) / 4 - Math.PI / 2;
      return [
        cx + Math.cos(angle) * r * fraction,
        cy + Math.sin(angle) * r * fraction,
      ];
    };
    const point = (i, value) => radial(i, value / axes[i].maximum);
    const polygon = (values) =>
      values.map((v, i) => point(i, v).join(",")).join(" ");
    const grid = [0.25, 0.5, 0.75, 1]
      .map(
        (fraction) =>
          `<polygon points="${axes.map((_, i) => radial(i, fraction).join(",")).join(" ")}" class="radar-grid"/>`,
      )
      .join("");
    const spokes = axes
      .map((axis, i) => {
        const [x, y] = radial(i, 1),
          [lx, ly] = radial(i, 1, radius + (small ? 44 : 60));
        const labelX = small && i === 2 ? width - 2 : small && i === 6 ? 2 : lx;
        const anchor =
          small && i === 2 ? "end" : small && i === 6 ? "start" : "middle";
        const title =
          small && i === 2
            ? `Ego →<tspan x="${labelX}" dy="15">Exo</tspan>`
            : axis.label;
        const labelY = ly - (small && i === 2 ? 25 : 13);
        return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="radar-spoke"/><text x="${labelX}" y="${labelY}" text-anchor="${anchor}" class="radar-axis">${title}<tspan x="${labelX}" dy="17" class="radar-source">${axis.source}</tspan><tspan x="${labelX}" dy="16" class="radar-maximum" data-axis-max="${axis.maximum}">max ${axis.maximum}</tspan></text>`;
      })
      .join("");
    // Draw translucent GT outlines first so the main comparison stays readable.
    const order = n === 4 ? [3, 2, 0, 1] : [0, 1];
    const series = order
      .map(
        (k) =>
          `<g data-radar-series="${k}"><polygon points="${polygon(axes.map((a) => a.values[k]))}" fill="${colors[k]}" fill-opacity="${k === 1 ? 0.11 : 0.035}" stroke="${colors[k]}" stroke-width="${k === 1 ? 3.5 : 2}" ${k !== 1 ? `stroke-dasharray="${k === 0 ? "6 3" : k === 2 ? "7 5" : "2 5"}"` : ""}/>${axes
            .map((a, i) => {
              const [x, y] = point(i, a.values[k]);
              return `<circle data-score="${a.values[k]}" data-axis="${i}" cx="${x}" cy="${y}" r="${small ? 3 : 4}" fill="${colors[k]}" stroke="white" stroke-width="1"><title>${a.label} (${a.source}), ${labels[k]}: ${a.values[k].toFixed(1)}</title></circle>`;
            })
            .join("")}</g>`,
      )
      .join("");
    $("#results-radar").innerHTML =
      `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="radar-title radar-desc"><title id="radar-title">Spatial skills: ${labels.slice(0, n).join(", ")}</title><desc id="radar-desc">Eight linear axes, each starting at zero with its own labeled maximum. Larger is better. The expandable table lists original scores and axis limits.</desc>${grid}${spokes}${series}<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="radar-origin">0</text></svg><details class="radar-values"><summary>Axis values &amp; task groups</summary><div class="table-scroll" tabindex="0" role="region" aria-label="Radar axis values, horizontally scrollable"><table><caption>Original scores. Each axis maximum is the highest score across all four conditions rounded up to a multiple of 5. Axis minima are always 0.</caption><thead><tr><th scope="col">Skill group</th><th scope="col">Axis max</th>${labels
        .slice(0, n)
        .map((l) => `<th scope="col">${l}</th>`)
        .join("")}</tr></thead><tbody>${axes
        .map(
          (a) =>
            `<tr><th scope="row">${a.label} · ${a.source}<small>${a.detail}</small></th><td>${a.maximum}</td>${a.values
              .slice(0, n)
              .map((v) => `<td>${v.toFixed(1)}</td>`)
              .join("")}</tr>`,
        )
        .join("")}</tbody></table></div></details>`;
    $("#radar-legend").innerHTML = legend(n);
    $("#gt-explanation").hidden = n !== 4;
  }
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
    const n = $("#oracle-toggle").checked ? 4 : 2;
    const selected =
      filter === "all"
        ? [
            rows.find((r) => r.title === "Overall · QA-weighted average"),
            ...rows.filter((r) => r.summary && r.category !== "overall"),
          ]
        : rows.filter((r) => r.category === filter && !r.summary);
    $("#results-chart").innerHTML =
      `<div class="chart-legend">${legend(n)}</div><div class="chart-scale" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div><div class="bar-groups">${selected
        .map(
          (r) =>
            `<article class="bar-group"><div class="bar-heading"><h3>${shortTitles[r.title] || r.title}</h3><span class="delta ${r.delta < 0 ? "negative" : ""}">${r.delta > 0 ? "+" : ""}${r.delta.toFixed(1)} pts</span></div><div class="bar-series">${r.values
              .slice(0, n)
              .map(
                (value, i) =>
                  `<div class="bar-row"><span class="sr-only">${labels[i]}: ${value.toFixed(1)}</span><div class="bar-track" aria-hidden="true"><span class="bar-fill series-${i}" style="width:${value}%"></span><span class="bar-value" style="left:${value}%">${value.toFixed(1)}</span></div></div>`,
              )
              .join("")}</div></article>`,
        )
        .join("")}</div>`;
    $("#chart-takeaway").textContent =
      filter === "dynamic"
        ? "Direction gains are substantial; Exo-to-Ego Distance decreases by 1.7 points."
        : filter === "regional"
          ? "Movement history and object landmarks support reasoning about places."
          : filter === "path"
            ? "The largest path gain is on static line-path search: +16.8 points."
            : "All category averages improve. Explore each category to see where performance varies.";
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
  $("#oracle-toggle").addEventListener("change", () => {
    render();
    renderRadar();
  });
  let lastWidth = 0;
  new ResizeObserver((entries) => {
    const width = Math.round(entries[0].contentRect.width);
    if (width !== lastWidth) {
      lastWidth = width;
      renderRadar();
    }
  }).observe($("#results-radar"));
  render();
  renderRadar();
})();
