(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    $$ = (s) => Array.from(document.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const formatTime = (t) =>
    `${String(Math.floor(Math.max(0, t) / 60)).padStart(2, "0")}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, "0")}`;
  const dialog = $("#figure-dialog");
  const hasOpenDialog = () => Boolean($("dialog[open]"));
  let toastTimer;
  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
  }
  function showFigure(key, title) {
    $("#dialog-image").src = `assets/figures/${key}.png`;
    $("#dialog-image").alt = title;
    $("#dialog-title").textContent = title;
    dialog.showModal();
  }
  $$("[data-figure]").forEach((b) =>
    b.addEventListener("click", () =>
      showFigure(b.dataset.figure, b.dataset.title),
    ),
  );
  $("#dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        dialog.close();
    }
  });
  $$("[data-cite]").forEach((b) =>
    b.addEventListener("click", async () => {
      const text = $("#bibtex").textContent.trim();
      let copied = false;
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        const t = document.createElement("textarea");
        t.value = text;
        document.body.append(t);
        t.select();
        try {
          copied = document.execCommand("copy");
        } catch {}
        t.remove();
      }
      if (copied) toast("BibTeX copied");
      else {
        $("#citation").scrollIntoView();
        const range = document.createRange();
        range.selectNodeContents($("#bibtex"));
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        toast("Select and copy the highlighted citation");
      }
    }),
  );
  $$("[data-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      $$("[data-filter]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === button)),
      );
      $$("#results-table tbody tr").forEach(
        (row) =>
          (row.hidden =
            button.dataset.filter !== "all" &&
            row.dataset.category !== button.dataset.filter &&
            row.dataset.category !== "overall"),
      );
    }),
  );
  $("#oracle-toggle").addEventListener("change", (e) =>
    $$(".oracle-column").forEach((cell) => (cell.hidden = !e.target.checked)),
  );
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) {
          $$(".nav-links a").forEach((a) =>
            a.classList.toggle("active", a.hash === "#" + e.target.id),
          );
        }
    },
    { rootMargin: "-15% 0px -60% 0px" },
  );
  $$("main>section[id]").forEach((s) => sectionObserver.observe(s));

  // Each pair has one media clock. UI and overlays follow decoded video time.
  class VideoPair {
    constructor(
      prefix,
      {
        start = 0,
        duration = 20,
        loop = false,
        auto = false,
        onUpdate = () => {},
      } = {},
    ) {
      this.prefix = prefix;
      this.ego = $(`#${prefix}-ego`);
      this.map = $(`#${prefix}-map`);
      this.playButton = $(`#${prefix}-play`);
      this.seek = $(`#${prefix}-seek`);
      this.clock = $(`#${prefix}-clock`);
      this.sound = $(`#${prefix}-sound`);
      this.start = start;
      this.duration = duration;
      this.loop = loop;
      this.auto = auto;
      this.onUpdate = onUpdate;
      this.visible = false;
      this.userPaused = false;
      this.wantPlay = false;
      this.epoch = 0;
      this.playButton.addEventListener("click", () => {
        if (this.onPlayRequest) {
          this.onPlayRequest();
          return;
        }
        if (this.wantPlay && !this.ego.paused) {
          this.userPaused = true;
          this.pause();
        } else {
          this.userPaused = false;
          this.play(true);
        }
      });
      this.seek.addEventListener("input", () => {
        this.userPaused = true;
        this.pause();
        this.setTime(Number(this.seek.value));
      });
      this.sound.addEventListener("click", () => {
        this.ego.muted = !this.ego.muted;
        this.sound.textContent = this.ego.muted ? "Sound off" : "Sound on";
        this.sound.setAttribute("aria-pressed", String(!this.ego.muted));
        this.sound.setAttribute(
          "aria-label",
          (this.ego.muted ? "Unmute " : "Mute ") + prefix,
        );
        if (!this.ego.muted) {
          allPairs
            .filter((p) => p !== this)
            .forEach((p) => {
              p.ego.muted = true;
              p.sound.textContent = "Sound off";
              p.sound.setAttribute("aria-pressed", "false");
            });
        }
      });
      this.ego.addEventListener("ended", () => {
        if (this.loop && this.wantPlay) {
          this.setTime(0);
          this.play();
        } else {
          this.pause();
          this.userPaused = true;
          this.update();
        }
      });
      for (const v of [this.ego, this.map]) {
        v.addEventListener("loadedmetadata", () => {
          if (this.pendingSeek != null) v.currentTime = this.pendingSeek;
          this.update();
        });
        v.addEventListener("seeked", () => {
          if (
            this.pendingSeek != null &&
            [this.ego, this.map].every(
              (x) =>
                x.readyState >= 2 &&
                Math.abs(x.currentTime - this.pendingSeek) < 0.08,
            )
          )
            this.pendingSeek = null;
          this.update();
        });
      }
      this.ego.addEventListener("timeupdate", () => this.update());
      this.ego.addEventListener("pause", () => {
        this.button();
        this.update();
      });
      this.ego.addEventListener("play", () => this.button());
      this.ego.addEventListener("waiting", () => this.map.pause());
      this.ego.addEventListener("playing", () => {
        if (this.wantPlay) {
          if (Math.abs(this.map.currentTime - this.ego.currentTime) > 0.08)
            this.map.currentTime = this.ego.currentTime;
          this.map.play().catch(() => {});
        }
      });
      for (const v of [this.ego, this.map])
        v.addEventListener("error", () => {
          this.pause();
          $("#media-error").hidden = false;
          $("#media-error").textContent =
            "This video could not be loaded. Reload the page to retry, or open the paper example below.";
        });
      this.observer = new IntersectionObserver(
        (entries) => {
          this.visible = entries[0].isIntersecting;
          if (this.visible) {
            if (
              this.auto &&
              !this.userPaused &&
              !reduced.matches &&
              !document.hidden &&
              !hasOpenDialog()
            )
              this.play();
          } else this.pause();
          this.onVisibilityChange?.(this.visible);
        },
        { threshold: 0.15 },
      );
      this.observer.observe(this.ego.closest(".paired-views"));
    }
    button() {
      const playing = this.wantPlay && !this.ego.paused;
      this.playButton.textContent = playing ? "Ⅱ" : "▶";
      this.playButton.setAttribute(
        "aria-label",
        (playing ? "Pause " : "Play ") +
          (this.prefix === "hero" ? "overview" : "example"),
      );
    }
    async play(manual = false) {
      if (this.ego.ended || this.ego.currentTime >= this.duration - 0.03)
        this.setTime(0);
      if (manual) allPairs.filter((p) => p !== this).forEach((p) => p.pause());
      this.wantPlay = true;
      const epoch = ++this.epoch;
      try {
        await this.ego.play();
        if (epoch !== this.epoch) return;
        if (!this.wantPlay) {
          this.ego.pause();
          return;
        }
        if (Math.abs(this.map.currentTime - this.ego.currentTime) > 0.07)
          this.map.currentTime = this.ego.currentTime;
        await this.map.play();
      } catch (error) {
        if (epoch === this.epoch) {
          this.wantPlay = false;
          this.ego.pause();
          this.map.pause();
          this.onPlayError?.();
          if (manual && error.name !== "AbortError")
            toast("Press play again once the video has loaded.");
        }
      }
      this.button();
    }
    pause() {
      this.wantPlay = false;
      ++this.epoch;
      this.ego.pause();
      this.map.pause();
      this.button();
    }
    setTime(time) {
      const t = Math.max(0, Math.min(this.duration - 0.025, time));
      this.pendingSeek = t;
      for (const v of [this.ego, this.map])
        if (v.readyState >= 1) v.currentTime = t;
      this.update(t);
    }

    load(name, start, duration) {
      this.pause();
      this.pendingSeek = null;
      this.start = start;
      this.duration = duration;
      this.seek.max = duration;
      for (const [kind, v] of [
        ["ego", this.ego],
        ["map", this.map],
      ]) {
        v.poster = `assets/media/${name}${kind === "map" ? "-map" : ""}-poster.jpg`;
        v.src = `assets/media/${name}-${kind}.mp4`;
        v.load();
      }
      this.update(0);
    }
    update(t = this.pendingSeek ?? this.ego.currentTime) {
      const pending =
        this.pendingSeek != null &&
        ![this.ego, this.map].every(
          (v) =>
            v.readyState >= 2 &&
            Math.abs(v.currentTime - this.pendingSeek) < 0.08,
        );
      const container =
        this.prefix === "hero" ? $("#hero-player") : $("#case-playback");
      container.classList.toggle("is-seeking", pending);
      container.setAttribute("aria-busy", String(pending));
      if (!pending && this.pendingSeek != null) this.pendingSeek = null;
      this.seek.value = t;
      this.clock.textContent =
        this.prefix === "hero"
          ? `${formatTime(this.start + t)} / ${formatTime(this.start + this.duration)}`
          : `${formatTime(t)} / ${formatTime(this.duration)}`;
      this.seek.setAttribute(
        "aria-valuetext",
        `Source ${formatTime(this.start + t)}, ${formatTime(t)} of ${formatTime(this.duration)}`,
      );
      this.onUpdate(t);
    }
    tick() {
      if (this.wantPlay && !this.ego.paused) {
        if (
          this.map.readyState >= 2 &&
          !this.map.seeking &&
          Math.abs(this.map.currentTime - this.ego.currentTime) > 0.12
        )
          this.map.currentTime = this.ego.currentTime;
        this.update();
      }
    }
  }
  const allPairs = [];
  const hero = new VideoPair("hero", {
    start: 60,
    duration: 20,
    loop: true,
    auto: true,
  });
  allPairs.push(hero);
  const cases = window.FLOORSAV_STORIES;
  let caseIndex = 0,
    stepIndex = 0,
    annotations = true;
  let guided = true,
    hasStarted = false,
    tourActive = false,
    holding = false,
    holdRemaining = 0,
    nextStop = 0,
    tourFinished = false;
  const caseButtons = $$("[data-case]"),
    stepButtons = $$("[data-step]");
  const story = new VideoPair("case", { onUpdate: renderStory });
  allPairs.push(story);
  const exactTime = (t) =>
    `${formatTime(t)}.${String(Math.round((t % 1) * 100)).padStart(2, "0")}`;
  function evidenceView(view) {
    $("#case-panel").dataset.evidenceView = view;
    $$("button[data-evidence-view]").forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.evidenceView === view)),
    );
  }
  function focusEvidence() {
    const c = cases[caseIndex];
    evidenceView(
      stepIndex === 0 || (c.name === "region" && stepIndex === 1)
        ? "video"
        : "map",
    );
  }
  $$("button[data-evidence-view]").forEach((b) =>
    b.addEventListener("click", () => evidenceView(b.dataset.evidenceView)),
  );
  function selectCase(index) {
    caseIndex = index;
    stepIndex = 0;
    guided = true;
    tourActive = false;
    holding = false;
    holdRemaining = 0;
    nextStop = 0;
    tourFinished = false;
    hasStarted = false;
    const c = cases[index];
    focusEvidence();
    $("#case-category").textContent = c.category;
    $("#case-title").textContent = c.title;
    $("#case-question").innerHTML = c.question;
    $("#case-reference").textContent =
      `${c.qa} · ${c.scene} · Source ${formatTime(c.start)}–${formatTime(c.start + c.duration)} · Original 20 fps frames`;
    $("#case-caveat").textContent = c.caveat;
    $("#next-example").setAttribute(
      "aria-label",
      `Next example: ${cases[(index + 1) % cases.length].title}`,
    );
    $("#case-panel").setAttribute("aria-labelledby", `tab-${c.name}`);
    caseButtons.forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === index));
      b.tabIndex = i === index ? 0 : -1;
    });
    stepButtons.forEach((b, i) => {
      b.querySelector(".step-name").textContent = c.steps[i].name;
      b.querySelector(".step-time").textContent = exactTime(
        c.start + c.steps[i].at,
      );
      b.setAttribute("aria-label", `Step ${i + 1}: ${c.steps[i].name}`);
    });
    story.userPaused = true;
    story.load(c.name, c.start, c.duration);
    story.setTime(0);
    $("#media-error").hidden = true;
    renderStory(0);
  }
  // One forward timeline: travel → timed explanation → travel, through the clip's end.
  // Repeated timestamps let several explanations share exactly the same evidence frame.
  function playbackActive() {
    // A timed highlight pauses the videos, but the user's playback mode stays active.
    return guided ? tourActive : story.wantPlay;
  }
  function goStep(index, resume = playbackActive()) {
    guided = true;
    hasStarted = true;
    tourFinished = false;
    tourActive = resume;
    holding = true;
    holdRemaining = (cases[caseIndex].steps[index].holdSeconds ?? 6) * 1000;
    stepIndex = index;
    nextStop = index + 1;
    story.userPaused = !resume;
    story.pause();
    focusEvidence();
    story.setTime(cases[caseIndex].steps[index].at);
  }
  function startTour() {
    guided = true;
    hasStarted = true;
    tourFinished = false;
    tourActive = true;
    holding = false;
    nextStop = 0;
    stepIndex = 0;
    story.userPaused = false;
    evidenceView("video");
    story.setTime(0);
    story.play(true);
    renderStory(0);
  }
  function toggleTour() {
    if (!guided || !hasStarted || tourFinished) {
      startTour();
      return;
    }
    tourActive = !tourActive;
    story.userPaused = !tourActive;
    if (!tourActive) story.pause();
    else if (!holding) story.play(true);
    renderStory(story.ego.currentTime);
  }
  function updateTour(dt) {
    if (!guided || !tourActive || !story.visible) return;
    if (holding) {
      // Count only after both exact frames have loaded; never expire a hold in a hidden tab.
      if (
        story.pendingSeek != null ||
        [story.ego, story.map].some((v) => v.readyState < 2 || v.seeking)
      )
        return;
      holdRemaining -= dt;
      if (holdRemaining <= 0) {
        const steps = cases[caseIndex].steps;
        if (
          nextStop < steps.length &&
          steps[nextStop].at <= story.ego.currentTime + 0.08
        )
          goStep(nextStop);
        else {
          holding = false;
          story.play();
        }
      }
      renderStory(story.ego.currentTime);
    } else if (
      story.wantPlay &&
      !story.ego.paused &&
      story.pendingSeek == null
    ) {
      const step = cases[caseIndex].steps[nextStop];
      if (step && story.ego.currentTime >= step.at) goStep(nextStop);
    }
  }
  story.onVisibilityChange = (visible) => {
    if (
      visible &&
      tourActive &&
      !holding &&
      !document.hidden &&
      !hasOpenDialog()
    )
      story.play();
  };
  story.onPlayError = () => {
    tourActive = false;
    renderStory(story.ego.currentTime);
  };
  story.ego.addEventListener("ended", () => {
    tourActive = false;
    holding = false;
    tourFinished = true;
    renderStory(story.duration);
  });
  caseButtons.forEach((b, i) => {
    b.addEventListener("click", () => selectCase(i));
    b.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? 2
              : (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
        selectCase(next);
        caseButtons[next].focus();
      }
    });
  });
  stepButtons.forEach((b, i) => b.addEventListener("click", () => goStep(i)));
  $("#start-walkthrough").addEventListener("click", toggleTour);
  $("#next-step").addEventListener("click", () => {
    if (nextStop < cases[caseIndex].steps.length) goStep(nextStop);
    else {
      holding = false;
      if (tourActive) story.play(true);
      renderStory(story.ego.currentTime);
    }
  });
  $("#replay-step").addEventListener("click", startTour);
  story.onPlayRequest = () => {
    if (guided) toggleTour();
    else if (story.wantPlay) story.pause();
    else story.play(true);
  };
  $("#case-restart").addEventListener("click", startTour);
  $("#case-seek").addEventListener("input", () => {
    guided = false;
    tourActive = false;
    holding = false;
    tourFinished = false;
    renderStory(Number(story.seek.value));
  });
  $("#case-speed").addEventListener("click", () => {
    const rates = [1, 0.75, 0.5],
      rate = rates[(rates.indexOf(story.ego.playbackRate) + 1) % rates.length];
    story.ego.playbackRate = story.map.playbackRate = rate;
    $("#case-speed").textContent = `${rate}×`;
    $("#case-speed").setAttribute(
      "aria-label",
      `Playback speed, ${rate} times`,
    );
  });
  $("#annotations").addEventListener("change", (e) => {
    annotations = e.target.checked;
    renderStory(story.ego.currentTime);
  });
  $("#next-example").addEventListener("click", () => {
    selectCase((caseIndex + 1) % cases.length);
    $("#case-panel").scrollIntoView({
      behavior: reduced.matches ? "auto" : "smooth",
      block: "start",
    });
  });
  $("#original-figure").addEventListener("click", () =>
    showFigure(
      cases[caseIndex].figure,
      cases[caseIndex].title + " — paper example",
    ),
  );
  const pin = (id, point, number, label, dx = -14, dy = -11, tone = "") => {
    const [x, y] = point,
      text = `${number} · ${label}`;
    const width = Math.max(21, text.length * 1.95 + 7);
    const lx = Math.max(2, Math.min(98 - width, x + dx));
    const ly = Math.max(9, Math.min(89, y + dy));
    return `<g id="${id}" class="evidence-pin ${tone}"><path class="pin-leader" d="M${x},${y} L${lx + width / 2},${ly}"/><circle class="pin-target" cx="${x}" cy="${y}" r="3.2"/><rect class="pin-label" x="${lx}" y="${ly - 4.5}" width="${width}" height="9" rx="2"/><text class="pin-text" x="${lx + width / 2}" y="${ly}" text-anchor="middle" dominant-baseline="central">${text}</text></g>`;
  };
  const evidenceLine = (a, b, cls = "route-line") =>
    `<path class="${cls}" d="M${a[0]},${a[1]} L${b[0]},${b[1]}"/>`;
  function coordinateSketch(step) {
    // Coordinates quoted by the selected model output, not sensor/ground-truth locations.
    const xy = ([x, y]) => [20 + (x - 3.5) * 18, 90 - (y - 3) * 18];
    const you = xy([5.65, 6.25]),
      other = xy([4.8, 6.7]),
      object = xy([4.39, 3.73]);
    const theta = (118 * Math.PI) / 180;
    const fwd = [Math.cos(theta) * 18, -Math.sin(theta) * 18];
    const left = [-Math.sin(theta) * 18, -Math.cos(theta) * 18];
    const head = [you[0] + fwd[0] * 0.7, you[1] + fwd[1] * 0.7];
    let svg = `<defs><marker id="view-heading-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10Z" fill="#bd4a4a"/></marker></defs><rect width="100" height="100" class="sketch-bg"/><text class="sketch-heading" x="7" y="9">MODEL COORDINATE SKETCH</text><text class="sketch-sub" x="7" y="15">At the same question moment · estimates</text>`;
    if (step === 3) {
      const a = [you[0] - fwd[0] * 2.5, you[1] - fwd[1] * 2.5],
        b = [a[0] + left[0] * 2.7, a[1] + left[1] * 2.7],
        d = [you[0] + left[0] * 2.7, you[1] + left[1] * 2.7];
      svg += `<path class="quadrant-fill" d="M${you} L${a} L${b} L${d}Z"/>`;
      svg += evidenceLine(
        [you[0] - fwd[0] * 2.5, you[1] - fwd[1] * 2.5],
        [you[0] + fwd[0] * 1.2, you[1] + fwd[1] * 1.2],
        "sketch-axis",
      );
      svg += evidenceLine(
        [you[0] - left[0] * 1.2, you[1] - left[1] * 1.2],
        [you[0] + left[0] * 2.7, you[1] + left[1] * 2.7],
        "sketch-axis",
      );
      svg += `<text class="sketch-answer" x="8" y="89">BACK-LEFT</text>`;
    }
    svg +=
      evidenceLine(you, head, "heading-line") +
      `<text class="sketch-heading-label" x="65" y="22">Your view</text>`;
    svg +=
      pin("you-sketch", you, "1", "You", 5, -1) +
      pin("other-sketch", other, "2", "Other person", -43, 6);
    if (step >= 2) {
      svg +=
        evidenceLine(other, you, "sketch-axis") + evidenceLine(other, object);
      const angleStart = Math.atan2(you[1] - other[1], you[0] - other[0]);
      const angleEnd = Math.atan2(object[1] - other[1], object[0] - other[0]);
      const p = [
          other[0] + 8 * Math.cos(angleStart),
          other[1] + 8 * Math.sin(angleStart),
        ],
        q = [
          other[0] + 8 * Math.cos(angleEnd),
          other[1] + 8 * Math.sin(angleEnd),
        ];
      svg += `<path class="angle-arc" d="M${p} A8,8 0 0,1 ${q}"/><text class="sketch-label" x="${other[0] + 4}" y="${other[1] + 14}">70°</text><text class="sketch-label" x="${object[0] + 4}" y="${(other[1] + object[1]) / 2 + 7}">3 m</text>`;
      svg += pin(
        "object-sketch",
        object,
        "3",
        "Imagined object",
        5,
        0,
        "answer-pin",
      );
    }
    svg += `<text class="sketch-sub" x="7" y="96">Reconstructed from the model’s reported coordinates</text>`;
    return svg;
  }
  function buildOverlays(c, step, t) {
    const data = window.FLOORSAV_MEDIA[c.name],
      sample =
        data.samples[
          Math.min(data.samples.length - 1, Math.round(t * data.fps))
        ];
    let map = "",
      ego = "";
    if (c.name === "region") {
      map += pin("camera-ring", sample.camera, "1", "Camera", -18, 10);
      if (step >= 2) {
        const [[x0, y0], [x1, y1]] = data.regions.kitchen;
        map += `<rect class="region-focus" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="6"/>`;
        map += pin(
          "kitchen-ring",
          data.objects.counter,
          "2",
          "Kitchen",
          3,
          -23,
          "answer-pin",
        );
        for (const key of ["oven", "counter", "refrigerator"]) {
          const [x, y] = data.objects[key];
          map += `<circle class="landmark-dot" cx="${x}" cy="${y}" r="1.7"/>`;
        }
      }
    } else if (c.name === "path") {
      const sofa = data.objects.sofa,
        tv = data.objects.tv;
      if (step >= 2) map += evidenceLine(sample.camera, sofa);
      map += pin("camera-ring", sample.camera, "1", "Start", 6, 10);
      if (step >= 1) map += pin("sofa-ring", sofa, "2", "Couch", -12, 12);
      if (step === 3)
        map += pin("tv-ring", tv, "3", "TV", -10, -12, "answer-pin");
    } else {
      if (step === 0)
        map += pin("camera-ring", sample.camera, "1", "Camera", -2, 12);
      else map = coordinateSketch(step);
    }
    $("#map-overlay").innerHTML = map;
    $("#ego-overlay").innerHTML = ego;
  }
  let overlayKey = "";
  function renderStory(t) {
    const c = cases[caseIndex];
    if (!c) return;
    const s = c.steps[stepIndex];
    const moving = story.wantPlay && !story.ego.paused;
    const atEvidence = guided && holding && Math.abs(t - s.at) < 0.12;
    $("#case-source-time").textContent = `Source ${exactTime(c.start + t)}`;
    $("#playback-state").textContent = !guided
      ? "Exploring original footage"
      : tourFinished
        ? "Full clip complete"
        : !hasStarted
          ? "Ready · full clip with guided highlights"
          : holding && tourActive
            ? `Highlight ${stepIndex + 1} · continues in ${(Math.max(0, holdRemaining) / 1000).toFixed(1)}s`
            : !tourActive
              ? "Paused · resume whenever you’re ready"
              : "Playing · synchronized source footage";
    $("#playback-state").classList.toggle("playing", moving);
    $("#frozen-time").textContent = exactTime(c.start + t);
    $("#guide-progress").textContent = tourFinished
      ? "4 of 4 · complete"
      : `Step ${stepIndex + 1} of 4`;
    $("#insight-number").textContent = `0${stepIndex + 1}`;
    $("#insight-focus").textContent = !guided
      ? "Free exploration"
      : atEvidence
        ? s.focus
        : nextStop === 0
          ? "First highlight coming up"
          : `Explained at ${exactTime(c.start + s.at)}`;
    $("#insight-title").textContent = guided
      ? s.name
      : "Return to the evidence";
    const insight = guided
      ? s.insight
      : "You’re exploring the original footage. Choose a step to see its explanation at the matching moment, or replay the full guided example.";
    if ($("#case-insight").innerHTML !== insight)
      $("#case-insight").innerHTML = insight;
    stepButtons.forEach((b, i) => {
      if (i === stepIndex && guided) b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    $("#video-evidence").textContent = atEvidence
      ? s.video
      : "Original source footage · use the timeline to explore.";
    $("#map-evidence").textContent = atEvidence
      ? s.map
      : "Floormap at the matching source time.";
    const showingSketch =
      atEvidence && annotations && c.name === "viewpoint" && stepIndex >= 1;
    $("#map-view-label").textContent = showingSketch
      ? "Coordinate sketch"
      : "2D floormap";
    $("#map-time-label").textContent = showingSketch
      ? "Query-time reconstruction"
      : "Matched source time";
    if (atEvidence && !annotations && c.name === "viewpoint" && stepIndex >= 1)
      $("#map-evidence").textContent =
        "Source map. Enable highlights to see the coordinate reconstruction.";
    const eventNow = t >= c.event[0] && t <= c.event[1];
    $("#event-caption").textContent = eventNow ? `“${c.quote}”` : "";
    $("#start-walkthrough").textContent = !guided
      ? "Replay guided example ▶"
      : !hasStarted
        ? "Play full example ▶"
        : tourFinished
          ? "Replay example ↺"
          : tourActive
            ? "Pause"
            : "Resume ▶";
    $("#next-step").textContent =
      nextStop < c.steps.length ? "Next step →" : "Return to video →";
    $("#next-step").hidden =
      tourFinished || (nextStop >= c.steps.length && !holding);
    $("#replay-step").hidden = !hasStarted || tourFinished;
    $("#baseline-answer").textContent = c.baseline;
    $("#floorsav-answer").textContent = c.answer;
    $(".answers").hidden = !guided || stepIndex !== 3;
    $("#case-takeaway").hidden = !guided || stepIndex !== 3;
    $("#case-takeaway").textContent = c.takeaway;
    const visible = annotations && atEvidence && !moving;
    $("#map-overlay").toggleAttribute("hidden", !visible);
    $("#ego-overlay").toggleAttribute("hidden", !visible);
    $("#map-evidence-label").hidden = true;
    const key = `${c.name}-${stepIndex}-${t.toFixed(2)}`;
    if (visible && key !== overlayKey) {
      overlayKey = key;
      buildOverlays(c, stepIndex, t);
    }
    $("button[data-evidence-view=map]").textContent = showingSketch
      ? "Coordinate sketch"
      : "Floormap";
    $("#case-play").disabled = false;
    $("#case-play").textContent = (guided ? tourActive : moving) ? "Ⅱ" : "▶";
    $("#case-play").setAttribute(
      "aria-label",
      (guided ? tourActive : moving) ? "Pause example" : "Play example",
    );
  }
  selectCase(0);
  $("#mobile-layout").addEventListener("click", () => {
    const stacked = $("#case-panel").classList.toggle("stacked-views");
    $("#mobile-layout").textContent = stacked
      ? "Compare side by side"
      : "Enlarge views";
    $("#mobile-layout").setAttribute("aria-pressed", String(stacked));
  });
  const playback = $("#case-playback"),
    expand = $("#case-expand");
  let beforeTheaterFocus = null;
  const theaterBackground = $$(
    "body>header,main>section:not(#examples),#examples>.wrap>.section-heading,.case-tabs,.case-heading,.case-question,.story-sidebar,.case-footer,#examples>.wrap>.small-note,body>footer",
  );
  function exitTheater() {
    theaterBackground.forEach((el) => (el.inert = false));
    playback.removeAttribute("role");
    playback.removeAttribute("aria-modal");
    playback.removeAttribute("aria-label");
    playback.classList.remove("theater");
    document.body.classList.remove("theater-open");
    expand.setAttribute("aria-label", "Expand example player");
    expand.setAttribute("aria-pressed", "false");
    expand.textContent = "⛶";
    beforeTheaterFocus?.focus();
  }
  expand.addEventListener("click", () => {
    if (playback.classList.contains("theater")) exitTheater();
    else {
      beforeTheaterFocus = document.activeElement;
      theaterBackground.forEach((el) => (el.inert = true));
      playback.setAttribute("role", "dialog");
      playback.setAttribute("aria-modal", "true");
      playback.setAttribute(
        "aria-label",
        "Expanded synchronized example player",
      );
      playback.classList.add("theater");
      document.body.classList.add("theater-open");
      expand.setAttribute("aria-label", "Close expanded player");
      expand.setAttribute("aria-pressed", "true");
      expand.textContent = "×";
      expand.focus();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && playback.classList.contains("theater"))
      exitTheater();
    if (e.key === "Tab" && playback.classList.contains("theater")) {
      const controls = [...playback.querySelectorAll("button,input")].filter(
        (x) => x.getClientRects().length && !x.disabled,
      );
      const first = controls[0],
        last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  // Avoid background playback and honor reduced-motion at any point in the visit.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) allPairs.forEach((p) => p.pause());
    else {
      if (
        hero.visible &&
        !hero.userPaused &&
        !reduced.matches &&
        !hasOpenDialog()
      )
        hero.play();
      story.onVisibilityChange(story.visible);
    }
  });
  const modalObserver = new MutationObserver(() => {
    if (hasOpenDialog()) allPairs.forEach((p) => p.pause());
    else story.onVisibilityChange(story.visible);
  });
  $$("dialog").forEach((modal) =>
    modalObserver.observe(modal, {
      attributes: true,
      attributeFilter: ["open"],
    }),
  );
  reduced.addEventListener("change", () => {
    if (reduced.matches) {
      tourActive = false;
      allPairs.forEach((p) => p.pause());
      renderStory(story.ego.currentTime);
    }
  });

  // A deterministic schematic of the rendering stages, not a sensor-data replay.
  const mapCanvas = $("#render-canvas"),
    mapCtx = mapCanvas.getContext("2d"),
    signalCanvas = $("#sensor-canvas"),
    signalCtx = signalCanvas.getContext("2d");
  let renderMs = 0,
    renderPlaying = !reduced.matches,
    renderVisible = false,
    renderIndex = -1;
  const renderDuration = 20000,
    sourceIds = ["points", "pose", "audio", "labels"];
  const renderStages = [
    [
      "Project the 3D points",
      "Flatten the scene onto a top-down metric grid.",
      "3D Points",
      "Geometry provided by AEA",
    ],
    [
      "Add camera position and motion",
      "Draw the camera, viewing direction, field of view, and recent path.",
      "Camera + IMU",
      "Camera poses provided by AEA",
    ],
    [
      "Add the sound-source estimate",
      "Use the microphones to estimate direction and distance, then place the source on the map.",
      "Microphone Array",
      "Illustrative audio signal",
    ],
    [
      "Add object names",
      "Use RGB frames and a VLM to label objects on the map.",
      "RGB Frames + VLM",
      "Match objects to map coordinates",
    ],
    [
      "Render the floormap video",
      "Update the markers over time and pair the map video with the egocentric video.",
      "Synchronized Frames",
      "Floormap + egocentric video → AV-LLM",
    ],
  ];
  const cloud = [];
  function edge3(x1, y1, x2, y2, z, step = 0.13) {
    const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step);
    for (let i = 0; i <= n; i++) {
      let t = i / n;
      cloud.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z]);
    }
  }
  for (const z of [0, 0.7, 1.4, 2.1, 2.7]) {
    edge3(0, 0, 8, 0, z);
    edge3(8, 0, 8, 6, z);
    edge3(8, 6, 0, 6, z);
    edge3(0, 6, 0, 0, z);
    edge3(4.7, 6, 4.7, 3.8, z);
  }
  const furniture = [
    { x: 1, y: 4.65, w: 2.2, h: 0.65, z: 0.8, label: "sofa" },
    { x: 1.5, y: 2.8, w: 1.25, h: 0.85, z: 0.45, label: "table" },
    { x: 6.9, y: 3.25, w: 0.62, h: 2.05, z: 1, label: "counter" },
    { x: 5.65, y: 0.95, w: 1.45, h: 0.85, z: 0.78, label: "dining table" },
  ];
  for (const f of furniture) {
    for (let z = 0; z <= f.z + 0.01; z += f.z / 2) {
      edge3(f.x, f.y, f.x + f.w, f.y, z);
      edge3(f.x + f.w, f.y, f.x + f.w, f.y + f.h, z);
      edge3(f.x + f.w, f.y + f.h, f.x, f.y + f.h, z);
      edge3(f.x, f.y + f.h, f.x, f.y, z);
    }
  }
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)),
    ease = (t) => t * t * (3 - 2 * t);
  const xy = (x, y) => [124 + x * 49, 362 - y * 49];
  function projection(p, t) {
    const a = [300 + (p[0] - p[1]) * 31, 347 - (p[0] + p[1]) * 17 - p[2] * 44],
      b = xy(p[0], p[1]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  function line(ctx, pts, color, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.stroke();
  }
  function dot(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function label(ctx, text, x, y, color = "#425e80", size = 11) {
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px "DM Sans",system-ui,sans-serif`;
    ctx.fillText(text, x, y);
  }
  function box(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  function chip(ctx, text, x, y, color, size = 17) {
    ctx.save();
    ctx.font = `700 ${size}px "DM Sans",system-ui,sans-serif`;
    const width = ctx.measureText(text).width + 24,
      height = size + 18;
    box(ctx, x - width / 2, y - height / 2, width, height, 7, color, "#ffffff");
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 0.5);
    ctx.restore();
  }
  function cameraAt(t) {
    return [
      2.15 + 3.05 * t,
      1.15 + 2.0 * t + 0.35 * Math.sin(t * Math.PI),
      -0.38 + 0.15 * Math.sin(t * Math.PI),
    ];
  }
  function drawRendering() {
    const phase = Math.min(4, Math.floor(renderMs / 4000)),
      u = (renderMs % 4000) / 4000,
      flat = phase ? 1 : ease(clamp((u - 0.28) / 0.68));
    mapCtx.setTransform(2, 0, 0, 2, 0, 0);
    mapCtx.clearRect(0, 0, 640, 440);
    mapCtx.fillStyle = "#fff";
    mapCtx.fillRect(0, 0, 640, 440);
    const stageColors = ["#2456d6", "#b93842", "#087e63", "#7040b0", "#2456d6"];
    const stageNames = [
      "1  ·  3D geometry → 2D map",
      "2  ·  Add camera + movement",
      "3  ·  Add estimated sound",
      "4  ·  Ground objects on the map",
      "5  ·  Synchronize map + video",
    ];
    mapCtx.save();
    mapCtx.globalAlpha = flat;
    for (let x = 0; x <= 8; x++) {
      const a = xy(x, 0),
        b = xy(x, 6);
      line(mapCtx, [a, b], "#e1e8f0");
      label(mapCtx, String(x), a[0] - 3, a[1] + 19, "#8b9ab0", 9);
    }
    for (let y = 0; y <= 6; y++) {
      const a = xy(0, y),
        b = xy(8, y);
      line(mapCtx, [a, b], "#e1e8f0");
      label(mapCtx, String(y), a[0] - 17, a[1] + 3, "#8b9ab0", 9);
    }
    label(mapCtx, "x (m)", 503, 387, "#8b9ab0", 9);
    label(mapCtx, "y (m)", 91, 60, "#8b9ab0", 9);
    for (const f of furniture) {
      const a = xy(f.x, f.y + f.h);
      box(mapCtx, a[0], a[1], f.w * 49, f.h * 49, 4, "#e9eef5", null);
    }
    mapCtx.restore();
    const fraction = phase ? 1 : clamp(u * 5 + 0.15),
      count = Math.floor(cloud.length * fraction);
    for (let i = 0; i < count; i++) {
      const p = cloud[i],
        v = projection(p, flat);
      dot(
        mapCtx,
        v[0],
        v[1],
        flat < 0.9 ? 1.8 : 1.25,
        flat < 0.9 ? "#2456d6b0" : "#64748ba0",
      );
    }
    if (phase === 0 && flat < 0.96) {
      label(
        mapCtx,
        flat < 0.12 ? "3D scene structure" : "Project onto the XY plane",
        206,
        421,
        "#4674ad",
        12,
      );
    }
    if (phase >= 1) {
      const motion = phase === 1 ? ease(u) : phase === 4 ? 0.7 + 0.3 * u : 1,
        camera = cameraAt(motion),
        pos = xy(camera[0], camera[1]);
      const history = [];
      for (let i = 0; i <= 60 * motion; i++) {
        const p = cameraAt(i / 60);
        history.push(xy(p[0], p[1]));
      }
      line(mapCtx, history, "#2456d6", 4.5);
      const head = camera[2],
        fov = 0.86,
        mapAngle = head - 0.48;
      mapCtx.beginPath();
      mapCtx.moveTo(...pos);
      mapCtx.arc(pos[0], pos[1], 124, mapAngle - fov, mapAngle + fov);
      mapCtx.closePath();
      mapCtx.fillStyle = "#e9b82555";
      mapCtx.fill();
      const end = [
        pos[0] + 29 * Math.cos(mapAngle),
        pos[1] + 29 * Math.sin(mapAngle),
      ];
      line(mapCtx, [pos, end], "#b93842", 4);
      mapCtx.save();
      mapCtx.translate(...end);
      mapCtx.rotate(mapAngle);
      mapCtx.beginPath();
      mapCtx.moveTo(2, 0);
      mapCtx.lineTo(-7, -4);
      mapCtx.lineTo(-7, 4);
      mapCtx.closePath();
      mapCtx.fillStyle = "#db5956";
      mapCtx.fill();
      mapCtx.restore();
      dot(mapCtx, ...pos, 9, "#b93842");
      dot(mapCtx, ...pos, 2, "#fff");
      if (phase === 1) {
        chip(mapCtx, "Camera + heading", pos[0], pos[1] + 37, "#b93842");
        chip(mapCtx, "Motion history", 170, 338, "#2456d6", 16);
      }
    }
    if (phase >= 2) {
      const opacity = phase === 2 ? clamp(u * 3) : 1,
        p = xy(6.15, 4.45 + (phase === 4 ? 0.12 * Math.sin(u * 6) : 0));
      mapCtx.save();
      mapCtx.globalAlpha = opacity;
      const radius = 8 + ((renderMs % 1200) / 1200) * 25;
      mapCtx.strokeStyle = "#087e6399";
      mapCtx.lineWidth = 3;
      mapCtx.beginPath();
      mapCtx.arc(...p, radius, 0, Math.PI * 2);
      mapCtx.stroke();
      dot(mapCtx, ...p, 10, "#087e63");
      dot(mapCtx, ...p, 2, "white");
      if (phase === 2) {
        const c = cameraAt(1),
          cp = xy(c[0], c[1]);
        mapCtx.setLineDash([4, 5]);
        line(mapCtx, [cp, p], "#087e63", 2.8);
        mapCtx.setLineDash([]);
        chip(mapCtx, "Estimated sound", p[0] - 40, p[1] - 40, "#087e63");
        const mid = [(cp[0] + p[0]) / 2, (cp[1] + p[1]) / 2];
        line(mapCtx, [[376, mid[1]], mid], "#087e63", 2);
        chip(mapCtx, "Direction + distance", 285, mid[1], "#087e63", 16);
      }
      mapCtx.restore();
    }
    if (phase >= 3) {
      for (let i = 0; i < furniture.length; i++) {
        const f = furniture[i],
          show = phase === 3 ? clamp((u - i * 0.16) * 4) : 1,
          pt = xy(f.x + f.w / 2, f.y + f.h / 2);
        mapCtx.save();
        mapCtx.globalAlpha = show;
        const a = xy(f.x, f.y + f.h);
        box(
          mapCtx,
          a[0] - 4,
          a[1] - 4,
          f.w * 49 + 8,
          f.h * 49 + 8,
          6,
          "#7040b026",
          "#7040b0",
        );
        chip(mapCtx, f.label, pt[0], pt[1], "#7040b0", 17);
        mapCtx.restore();
      }
    }
    if (phase === 4) {
      const n = 5,
        thumbW = 64,
        thumbH = 35,
        start = 138;
      for (let k = 0; k < n; k++) {
        const x = start + k * 75,
          y = 397,
          isCurrent = k === Math.min(4, Math.floor(u * 5));
        box(
          mapCtx,
          x,
          y,
          thumbW,
          thumbH,
          4,
          isCurrent ? "#dbeafe" : "#f1f5f9",
          isCurrent ? "#2456d6" : "#b8c6d8",
        );
        line(
          mapCtx,
          [
            [x + 8, y + 6],
            [x + 55, y + 6],
            [x + 55, y + 29],
            [x + 8, y + 29],
            [x + 8, y + 6],
          ],
          "#aebed2",
        );
        dot(mapCtx, x + 15 + k * 6, y + 25 - k * 3, 2, "#d75d58");
        dot(mapCtx, x + 44, y + 12, 2, "#249772");
      }
      label(mapCtx, "Time →", 55, 420, "#2456d6", 15);
    }
    // Draw the opaque title last so projecting 3D points always pass behind it.
    chip(mapCtx, stageNames[phase], 320, 26, stageColors[phase], 18);
    if (phase !== renderIndex) {
      renderIndex = phase;
      $("#render-player").dataset.phase = phase;
      const s = renderStages[phase];
      $("#render-step-title").textContent = s[0];
      $("#render-step-description").textContent = s[1];
      mapCanvas.setAttribute(
        "aria-label",
        `Step ${phase + 1}: ${s[0]}. ${s[1]}`,
      );
      $("#render-step-number").textContent = phase + 1;
      $("#render-stage-count").textContent =
        String(phase + 1).padStart(2, "0") + " / 05";
      $("#sensor-live-label").textContent = s[2];
      $("#sensor-live-detail").textContent = s[3];
      sourceIds.forEach((id, i) => {
        const el = $("#input-" + id);
        el.classList.toggle("active", phase === i || phase === 4);
        el.classList.toggle("done", phase > i);
      });
      $$("[data-render-step]").forEach((el, i) => {
        if (i === phase) el.setAttribute("aria-current", "step");
        else el.removeAttribute("aria-current");
      });
    }
    $("#render-view-label").textContent =
      phase === 0
        ? flat < 0.5
          ? "3D POINT CLOUD"
          : "TOP-DOWN PROJECTION"
        : phase === 4
          ? "FLOORMAP VIDEO"
          : "2D FLOORMAP";
    $("#render-seek").value = renderMs;
    $("#render-time").textContent =
      "00:" + String(Math.floor(renderMs / 1000)).padStart(2, "0") + " / 00:20";
    signalCtx.setTransform(1, 0, 0, 1, 0, 0);
    signalCtx.clearRect(0, 0, 500, 110);
    const colors = ["#6389bd", "#457ddd", "#299976", "#8762ae"];
    if (phase === 0) {
      for (let i = 0; i < 55; i++)
        dot(
          signalCtx,
          10 + ((i * 43) % 480),
          20 + ((i * 17) % 70),
          2.2,
          colors[0] + "aa",
        );
    } else if (phase === 1 || phase === 2) {
      for (let k = 0; k < (phase === 1 ? 3 : 2); k++) {
        const pts = [];
        for (let x = 0; x < 500; x += 3) {
          const v =
            Math.sin(x * (phase === 1 ? 0.018 : 0.17) + renderMs / 270 + k) *
            Math.sin(x * 0.023 + k + renderMs / 470);
          pts.push([x, 27 + k * 28 + v * (phase === 1 ? 14 : 20)]);
        }
        line(signalCtx, pts, [colors[phase], "#9ab5df", "#a69ac2"][k], 2);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        chip(
          signalCtx,
          phase === 4
            ? `Frame ${i + 1}`
            : ["sofa", "table", "counter", "chair"][i],
          61 + i * 123,
          52,
          phase === 4 ? "#2456d6" : "#7040b0",
          17,
        );
      }
    }
  }
  function renderButton() {
    const b = $("#render-play");
    b.textContent = renderPlaying ? "Ⅱ" : "▶";
    b.setAttribute(
      "aria-label",
      (renderPlaying ? "Pause" : "Play") + " floormap rendering animation",
    );
  }
  $("#render-play").addEventListener("click", () => {
    renderPlaying = !renderPlaying;
    renderButton();
  });
  $("#render-restart").addEventListener("click", () => {
    renderMs = 0;
    renderIndex = -1;
    drawRendering();
  });
  $("#render-seek").addEventListener("input", (e) => {
    renderMs = Number(e.target.value);
    renderPlaying = false;
    renderButton();
    drawRendering();
  });
  $$("[data-render-step]").forEach((b) =>
    b.addEventListener("click", () => {
      renderMs = Number(b.dataset.renderStep) * 4000 + 3000;
      renderPlaying = false;
      renderButton();
      drawRendering();
    }),
  );
  new IntersectionObserver(
    (entries) => {
      renderVisible = entries[0].isIntersecting;
    },
    { threshold: 0.1 },
  ).observe($("#render-player"));
  reduced.addEventListener("change", () => {
    if (reduced.matches) {
      renderPlaying = false;
      renderButton();
    }
  });
  drawRendering();
  renderButton();

  let lastFrame = 0;
  function tick(now) {
    const dt = lastFrame ? Math.min(100, now - lastFrame) : 0;
    lastFrame = now;
    if (!document.hidden && !hasOpenDialog()) {
      allPairs.forEach((p) => p.tick());
      updateTour(dt);
      if (renderVisible && renderPlaying) {
        renderMs = (renderMs + dt) % renderDuration;
        drawRendering();
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
