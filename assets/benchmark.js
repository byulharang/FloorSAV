(() => {
  "use strict";
  const modal = document.querySelector("#category-dialog");
  if (!modal) return;
  const $ = (selector) => modal.querySelector(selector);
  const cards = [...document.querySelectorAll(".benchmark-cards article")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const grid = $(".category-task-grid"),
    play = $(".diagram-play");
  const red = "#d43843",
    green = "#087e63",
    blue = "#285bd6";
  const phaseLength = 3200;
  let elapsed = 0,
    frame = 0,
    lastTime = 0,
    paused = reduced.matches;
  let animations = [],
    pending = 0,
    sourceButton,
    previousFocus,
    fromHover;
  let openedAt = 0,
    suppressHoverUntil = 0;

  const text = (x, y, label, cls = "") =>
    `<text x="${x}" y="${y}" class="${cls}">${label}</text>`;
  const line = (x1, y1, x2, y2, color = blue, extra = "") =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" ${extra}/>`;
  const badge = (x, y, width, label) =>
    `<g class="diagram-answer"><rect x="${x - width / 2}" y="${y - 13}" width="${width}" height="26" rx="7"/>${text(x, y, label, "diagram-small")}</g>`;
  const object = (x, y) =>
    `<g transform="translate(${x} ${y})"><rect x="-7" y="-7" width="14" height="14" rx="2" transform="rotate(45)" fill="${blue}" stroke="white" stroke-width="2"/></g>`;
  function actor(kind, x, y, angle = null, attr = "") {
    const color = kind === "camera" ? red : green;
    const icon =
      kind === "camera"
        ? '<rect x="-7" y="-4" width="14" height="10" rx="2" fill="none" stroke="white" stroke-width="1.6"/><circle cy="1" r="2.6" fill="none" stroke="white" stroke-width="1.4"/><path d="M-4-5v-2h5v2" fill="none" stroke="white" stroke-width="1.5"/>'
        : '<circle cy="-4" r="3.4" fill="white"/><path d="M-7 7v-2c0-6 14-6 14 0v2z" fill="white"/>';
    return `<g transform="translate(${x} ${y})" ${attr}>${angle === null ? "" : `<path d="M-5-21 0-29 5-21" fill="${color}" transform="rotate(${angle})"/>`}<circle r="13" fill="${color}" stroke="white" stroke-width="2.5"/>${icon}</g>`;
  }
  const stage = (phase, markup, only = false) =>
    `<g class="stage-reveal" data-${only ? "only" : "show"}="${phase}">${markup}</g>`;
  function axes(x, y, angle, color) {
    return `<g transform="translate(${x} ${y}) rotate(${angle})" stroke="${color}" fill="none"><circle r="32" opacity=".16" stroke-width="8"/><path d="M-45 0H45M0 25V-44M-4-39 0-45 4-39" stroke-width="1.5" stroke-dasharray="3 4" opacity=".65"/></g>`;
  }
  function viewpoint(reverse, distance) {
    const you = reverse ? [128, 95] : [128, 128],
      other = [290, 55],
      obj = reverse ? [266, 158] : [70, 55];
    const facing =
      (Math.atan2(you[0] - other[0], -(you[1] - other[1])) * 180) / Math.PI;
    const origin = reverse ? other : you,
      target = reverse ? you : other;
    const sourceColor = reverse ? green : red,
      targetColor = reverse ? red : green;
    const sourceName = reverse ? "their" : "your",
      targetName = reverse ? "your" : "their";
    const direction = reverse ? "back-right" : "front-right";
    const caption = distance
      ? `Read the distance from ${targetName} position.`
      : `Read ${direction} from ${targetName} viewpoint.`;
    const mid = [(target[0] + obj[0]) / 2, (target[1] + obj[1]) / 2];
    // The other person faces the wearer, matching the benchmark's assumed frame.
    const markup =
      `<path d="M24 27H376V172H24Z" fill="white" stroke="#e2e9f3" stroke-width="1.5"/>` +
      stage(0, axes(...origin, reverse ? facing : 0, sourceColor), true) +
      stage(1, line(...origin, ...obj, sourceColor, 'stroke-dasharray="4 5"')) +
      stage(2, axes(...target, reverse ? 0 : facing, targetColor)) +
      stage(2, line(...target, ...obj, targetColor)) +
      (distance ? stage(2, badge(mid[0], mid[1] - 15, 53, "d (m)")) : "") +
      actor("camera", ...you, 0) +
      text(you[0], you[1] + 30, "You", "diagram-label") +
      actor("person", ...other, facing) +
      text(290, 84, "Other", "diagram-label") +
      stage(
        1,
        object(...obj) +
          text(
            obj[0],
            obj[1] + (reverse ? 24 : -21),
            "Object",
            "diagram-label",
          ),
      ) +
      stage(
        2,
        badge(
          reverse ? 126 : 277,
          reverse ? 35 : 156,
          distance ? 170 : 175,
          distance
            ? `Distance from ${reverse ? "you" : "the other"}`
            : `${reverse ? "Your" : "Their"} view: ${direction}`,
        ),
      );
    return {
      label: `An imagined object placed in ${sourceName} frame is read from ${targetName} ${distance ? "position" : "viewpoint"}. The other person faces you.`,
      steps: [
        `Start from ${sourceName} viewpoint.`,
        `Place an imagined object in ${sourceName} frame.`,
        caption,
      ],
      markup,
    };
  }
  function location() {
    return {
      label:
        "The other person moves from the dining room to the kitchen. At the sound event, the answer is Kitchen. The camera wearer stays in the dining room.",
      steps: [
        "Follow the person across rooms.",
        "Locate them at the sound event.",
        "Read the region: Kitchen.",
      ],
      markup:
        `<rect class="room" data-room="kitchen" x="25" y="25" width="173" height="144" rx="9"/><rect class="room" x="202" y="25" width="173" height="144" rx="9"/>` +
        text(110, 49, "Kitchen", "diagram-label") +
        text(288, 49, "Dining", "diagram-label") +
        line(
          252,
          102,
          116,
          102,
          green,
          'stroke-dasharray="4 5" opacity=".35"',
        ) +
        actor("camera", 304, 116, 0) +
        text(304, 148, "You") +
        actor("person", 252, 102, null, 'data-moving="other"') +
        stage(
          1,
          `<path d="M137 90q12 12 0 24M144 82q20 20 0 40" fill="none" stroke="${green}" stroke-width="2.5" stroke-linecap="round"/>`,
        ) +
        stage(2, badge(110, 149, 85, "Kitchen")),
      update(svg, phase, t) {
        const progress = phase === 0 ? ease(t) : 1;
        svg
          .querySelector('[data-moving="other"]')
          .setAttribute("transform", `translate(${252 - 136 * progress} 102)`);
        svg
          .querySelector('[data-room="kitchen"]')
          .classList.toggle("visited", phase === 2);
      },
    };
  }
  function history() {
    return {
      label:
        "During a sound-event interval, the other person visits Kitchen, Dining, then Living, in that order. Study is not visited.",
      steps: [
        "Sound interval begins in Kitchen.",
        "Continue through Dining.",
        "Kitchen → Dining → Living; Study not visited.",
      ],
      markup:
        ["Kitchen", "Dining", "Living", "Study"]
          .map(
            (name, i) =>
              `<rect class="room" data-room="${i}" x="${18 + i * 96}" y="27" width="80" height="130" rx="8"/>${text(58 + i * 96, 47, name)}${i < 3 ? stage(i, badge(58 + i * 96, 139, 28, String(i + 1))) : ""}`,
          )
          .join("") +
        line(58, 100, 250, 100, green, 'stroke-dasharray="3 5" opacity=".4"') +
        actor("person", 58, 100, null, 'data-moving="other"') +
        stage(2, text(346, 99, "Not visited", "diagram-small")),
      update(svg, phase, t) {
        const progress = phase === 0 ? 0 : phase === 1 ? ease(t) : 1 + ease(t);
        svg
          .querySelector('[data-moving="other"]')
          .setAttribute("transform", `translate(${58 + 96 * progress} 100)`);
        svg
          .querySelectorAll("[data-room]")
          .forEach((room, i) =>
            room.classList.toggle(
              "visited",
              i < 3 && i <= Math.round(progress),
            ),
          );
      },
    };
  }
  function furniture(kind, x, y, highlighted = false) {
    let symbol;
    if (kind === "Couch")
      symbol =
        '<rect x="-17" y="-9" width="34" height="18" rx="4"/><path d="M-17 0h34M-10-9V0M10-9V0"/>';
    else if (kind === "TV")
      symbol =
        '<rect x="-13" y="-9" width="26" height="16" rx="2"/><path d="M0 7v5M-6 12H6"/>';
    else if (kind === "Chair")
      symbol =
        '<rect x="-9" y="-8" width="18" height="17" rx="3"/><path d="M-9-2H9M-9 9v4M9 9v4"/>';
    else
      symbol =
        '<rect x="-14" y="-6" width="28" height="13" rx="2"/><path d="M-11 7v7M11 7v7"/>';
    return `<g transform="translate(${x} ${y})" fill="white" stroke="#667e9c" stroke-width="1.8">${symbol}</g>${text(x, y - (highlighted ? 34 : 24), kind)}`;
  }
  function pathTask(dynamic) {
    const start = [55, 133],
      end = dynamic ? [329, 72] : [329, 61];
    const candidate = dynamic ? [210, 74] : [224, 70];
    const dx = end[0] - start[0],
      dy = end[1] - start[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((candidate[0] - start[0]) * dx + (candidate[1] - start[1]) * dy) /
          (dx * dx + dy * dy),
      ),
    );
    const projected = [start[0] + t * dx, start[1] + t * dy];
    const nearest = dynamic ? "Chair" : "TV";
    return {
      label: `A finite straight path joins the camera wearer and ${dynamic ? "the other person" : "the couch"}. Of the candidate objects, ${nearest} is closest to this segment.`,
      steps: [
        dynamic
          ? "Locate the other person at this moment."
          : "Locate the target object: Couch.",
        "Connect the two endpoints with a straight path.",
        `Compare object-to-path distances: ${nearest} is closest.`,
      ],
      markup:
        `<rect x="24" y="18" width="352" height="150" rx="9" fill="white" stroke="#e2e9f3"/>` +
        stage(
          1,
          `<path data-route="segment" d="M${start}L${end}" fill="none" stroke="${blue}" stroke-width="3.5" pathLength="1" stroke-linecap="round"/>`,
        ) +
        stage(
          2,
          `<circle cx="${candidate[0]}" cy="${candidate[1]}" r="23" fill="#e6efff" stroke="${blue}" stroke-width="1.5"/>` +
            line(...candidate, ...projected, blue, 'stroke-dasharray="3 3"'),
        ) +
        furniture("Desk", 132, 60) +
        furniture(nearest, ...candidate, true) +
        actor("camera", ...start, 0) +
        text(55, 158, "You", "diagram-label") +
        (dynamic
          ? actor("person", 329, 44, null, 'data-moving="other"') +
            text(329, 100, "Other", "diagram-label")
          : furniture("Couch", ...end)) +
        stage(2, badge(271, 147, 127, `Nearest: ${nearest}`)),
      update(svg, phase, t) {
        if (dynamic)
          svg
            .querySelector('[data-moving="other"]')
            .setAttribute(
              "transform",
              `translate(329 ${phase === 0 ? 44 + 28 * ease(t) : 72})`,
            );
        const path = svg.querySelector("[data-route]");
        path.style.strokeDasharray = "1";
        path.style.strokeDashoffset =
          phase === 0 ? 1 : phase === 1 ? 1 - ease(t) : 0;
      },
    };
  }
  const routes = [
    [
      [43, 135],
      [97, 135],
      [97, 53],
      [174, 53],
    ],
    [
      [231, 135],
      [290, 135],
      [290, 94],
      [352, 94],
      [352, 53],
    ],
  ];
  function onRoute(points, progress) {
    const lengths = points
      .slice(1)
      .map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
    let remaining = lengths.reduce((a, b) => a + b) * progress;
    for (let i = 0; i < lengths.length; i++) {
      if (remaining <= lengths[i]) {
        const t = remaining / lengths[i];
        return points[i].map((n, axis) => n + (points[i + 1][axis] - n) * t);
      }
      remaining -= lengths[i];
    }
    return points.at(-1);
  }
  function trajectory() {
    return {
      label:
        "The camera wearer and the other person each follow a route with turns. Estimate both traveled distances along those routes, not the straight lines between start and end.",
      steps: [
        "Start a separate track for each person.",
        "Follow both routes, including every turn.",
        "Measure each traveled route, not its shortcut.",
      ],
      markup:
        routes
          .map((points, i) => {
            const color = i ? green : red;
            return (
              stage(
                2,
                line(
                  ...points[0],
                  ...points.at(-1),
                  "#8898ac",
                  'stroke-dasharray="4 5" stroke-width="1.5"',
                ),
              ) +
              `<path d="M${points.join("L")}" fill="none" stroke="${color}" opacity=".14" stroke-width="6" stroke-linejoin="round"/>` +
              `<path data-route="${i}" d="M${points.join("L")}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linejoin="round" pathLength="1"/>` +
              `<circle cx="${points[0][0]}" cy="${points[0][1]}" r="4" fill="white" stroke="${color}" stroke-width="2"/>` +
              actor(
                i ? "person" : "camera",
                ...points[0],
                null,
                `data-moving="${i}"`,
              ) +
              text(
                i ? 290 : 99,
                25,
                i ? "Their route" : "Your route",
                "diagram-label",
              )
            );
          })
          .join("") +
        stage(2, badge(200, 169, 216, "Solid route ≠ dashed shortcut")),
      update(svg, phase, t) {
        const progress = phase === 0 ? 0 : phase === 1 ? ease(t) : 1;
        routes.forEach((points, i) => {
          const path = svg.querySelector(`[data-route="${i}"]`);
          path.style.strokeDasharray = "1";
          path.style.strokeDashoffset = 1 - progress;
          svg
            .querySelector(`[data-moving="${i}"]`)
            .setAttribute(
              "transform",
              `translate(${onRoute(points, progress).join(" ")})`,
            );
        });
      },
    };
  }
  const specs = [
    [
      viewpoint(false, false),
      viewpoint(false, true),
      viewpoint(true, false),
      viewpoint(true, true),
    ],
    [location(), history()],
    [pathTask(false), pathTask(true), trajectory()],
  ];
  function ease(t) {
    const v = Math.min(1, t * 1.3);
    return v * v * (3 - 2 * v);
  }

  function render(index) {
    const card = cards[index];
    $("#category-title").textContent = card.querySelector("h3").textContent;
    $("#category-count").textContent =
      card.querySelector(".eyebrow").textContent;
    $("#category-description").textContent = card
      .querySelector(":scope > p")
      .textContent.trim();
    $(".category-footnote").textContent =
      index === 0
        ? "Schematic examples. Blue diamond = imagined object. The other person is assumed to face you."
        : "Schematic examples to explain each task. Not recorded predictions.";
    modal
      .querySelectorAll(".category-switch [data-category]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Number(b.dataset.category) === index),
        ),
      );
    grid.replaceChildren();
    grid.dataset.category = index;
    animations = [...card.querySelectorAll(".task-details li")].map((li, i) => {
      const spec = specs[index][i],
        tile = document.createElement("article");
      tile.className = "category-task";
      const copy = document.createElement("div");
      const heading = document.createElement("h3"),
        description = document.createElement("p");
      heading.textContent = li.querySelector("strong").textContent;
      description.textContent = li.querySelector("p").textContent.trim();
      copy.append(heading, description);
      tile.append(copy);
      const visual = document.createElement("div");
      visual.className = "task-visual";
      visual.innerHTML = `<svg class="task-diagram" viewBox="0 0 400 190" role="img" aria-labelledby="task-diagram-${index}-${i}"><title id="task-diagram-${index}-${i}">${spec.label}</title>${spec.markup}</svg><div class="diagram-caption"><span class="diagram-step" aria-hidden="true"></span><span class="diagram-step-text"></span></div><div class="diagram-progress" aria-hidden="true"><i></i><i></i><i></i></div>`;
      tile.append(visual);
      grid.append(tile);
      return { spec, tile, svg: visual.querySelector("svg"), phase: -1 };
    });
    grid.scrollTop = 0;
    elapsed = paused ? phaseLength * 3 - 1 : 0;
    lastTime = 0;
    draw();
  }
  function draw() {
    const phase = Math.min(2, Math.floor(elapsed / phaseLength));
    const t = (elapsed % phaseLength) / phaseLength;
    animations.forEach((item) => {
      const { spec, tile, svg } = item;
      if (item.phase !== phase) {
        item.phase = phase;
        tile.dataset.phase = phase;
        tile.querySelector(".diagram-step").textContent = phase + 1;
        tile.querySelector(".diagram-step-text").textContent =
          spec.steps[phase];
        tile
          .querySelectorAll(".diagram-progress i")
          .forEach((dot, i) => dot.classList.toggle("passed", i <= phase));
        svg.querySelectorAll("[data-show], [data-only]").forEach((g) => {
          g.style.opacity = g.hasAttribute("data-only")
            ? Number(g.dataset.only) === phase
              ? 1
              : 0
            : Number(g.dataset.show) <= phase
              ? 1
              : 0;
        });
      }
      spec.update?.(svg, phase, t);
    });
  }
  function tick(now) {
    frame = 0;
    if (!modal.open || paused || document.hidden) {
      lastTime = 0;
      return;
    }
    elapsed =
      (elapsed + (lastTime ? Math.min(now - lastTime, 100) : 0)) %
      (phaseLength * 3);
    lastTime = now;
    draw();
    frame = requestAnimationFrame(tick);
  }
  function startClock() {
    cancelAnimationFrame(frame);
    lastTime = 0;
    play.textContent = paused ? "Play animations" : "Pause animations";
    if (modal.open && !paused && !document.hidden)
      frame = requestAnimationFrame(tick);
  }
  function cancelPending() {
    clearTimeout(pending);
    pending = 0;
  }
  function open(index, hover = false) {
    cancelPending();
    if (modal.open || document.querySelector("dialog[open]")) return;
    const card = cards[index],
      rect = card.getBoundingClientRect();
    sourceButton = card.querySelector(".task-expand");
    previousFocus = document.activeElement;
    fromHover = hover;
    paused = reduced.matches;
    render(index);
    sourceButton.setAttribute("aria-expanded", "true");
    modal.showModal();
    openedAt = performance.now();
    if (!reduced.matches) {
      const target = modal.getBoundingClientRect();
      modal.animate(
        [
          {
            opacity: 0.45,
            transform: `translate(${rect.x + rect.width / 2 - target.x - target.width / 2}px, ${rect.y + rect.height / 2 - target.y - target.height / 2}px) scale(${rect.width / target.width}, ${rect.height / target.height})`,
          },
          { opacity: 1, transform: "none" },
        ],
        { duration: 310, easing: "cubic-bezier(.2,.75,.25,1)" },
      );
    }
    startClock();
  }
  cards.forEach((card, index) => {
    const hover = (e) => {
      if (
        e.pointerType !== "mouse" ||
        modal.open ||
        performance.now() < suppressHoverUntil ||
        pending
      )
        return;
      cancelPending();
      pending = setTimeout(() => open(index, true), 350);
    };
    card.addEventListener("pointerenter", hover);
    card.addEventListener("pointermove", hover);
    card.addEventListener("pointerleave", cancelPending);
    card.addEventListener("click", () => open(index));
  });
  window.addEventListener("scroll", cancelPending, { passive: true });
  $(".category-close").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => {
    if (e.target !== modal || performance.now() - openedAt < 450) return;
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      modal.close();
  });
  modal.addEventListener("close", () => {
    cancelPending();
    cancelAnimationFrame(frame);
    lastTime = 0;
    suppressHoverUntil = performance.now() + 550;
    sourceButton?.setAttribute("aria-expanded", "false");
    const focus = fromHover ? previousFocus : sourceButton;
    if (focus instanceof HTMLElement) focus.focus({ preventScroll: true });
  });
  modal
    .querySelectorAll(".category-switch button")
    .forEach((button) =>
      button.addEventListener("click", () =>
        render(Number(button.dataset.category)),
      ),
    );
  play.addEventListener("click", () => {
    paused = !paused;
    if (!paused && elapsed >= phaseLength * 3 - 1) elapsed = 0;
    startClock();
  });
  document.addEventListener("visibilitychange", () => {
    cancelPending();
    startClock();
  });
  reduced.addEventListener("change", () => {
    if (reduced.matches) {
      paused = true;
      startClock();
    }
  });
})();
