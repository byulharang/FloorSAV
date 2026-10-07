(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    $$ = (s) => Array.from(document.querySelectorAll(s));
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const formatTime = (t) =>
    `${String(Math.floor(Math.max(0, t) / 60)).padStart(2, "0")}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, "0")}`;
  const dialog = $("#figure-dialog");
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
      $$("tbody tr").forEach(
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
      this.ego.addEventListener("pause", () => this.button());
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
              !dialog.open
            )
              this.play();
          } else this.pause();
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
        if (epoch !== this.epoch || !this.wantPlay) {
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
  const cases = [
    {
      name: "viewpoint",
      category: "Dynamic relativity",
      title: "Where is the imaginary object?",
      start: 60,
      duration: 20,
      event: [5, 6.5],
      quote: "We have this thing.",
      qa: "expE_1567",
      scene: "loc3_script2_seq3_rec1",
      figure: "cross-agent",
      question:
        "At <mark>“We have this thing,”</mark> imagine an object 3 m from the other person, 70° clockwise from their hypothetical heading toward you. Where is it relative to your view?",
      baseline: "Front-left",
      answer: "Back-left",
      steps: [
        {
          at: 0,
          name: "Locate the event",
          insight:
            "First, connect the question to <mark>the speech event at 01:05</mark>. Watch how the camera turns away from the other person as the event approaches.",
        },
        {
          at: 5,
          name: "Notice the blind spot",
          insight:
            "The baseline assumes the other person is directly ahead. The floormap provides <mark>camera orientation and estimated sound location</mark> in a shared frame.",
        },
        {
          at: 12,
          name: "Look across views",
          insight:
            "A nearby frame brings the person into view. Read this visual context together with <mark>the mapped kitchen landmarks</mark>, rather than assuming the off-screen person is straight ahead.",
        },
        {
          at: 16,
          name: "Resolve the viewpoint",
          insight:
            "FloorSAV answers <mark>back-left</mark>, matching the ground truth. The task requires reasoning across two viewpoints, not just recognizing the visible kitchen.",
        },
      ],
    },
    {
      name: "region",
      category: "Regional reasoning",
      title: "Where is the off-screen speaker?",
      start: 96,
      duration: 32,
      event: [18.5, 21.5],
      quote: "I mean, I like beef rare.",
      qa: "expE_0034",
      scene: "loc2_script3_seq4_rec1",
      figure: "regional",
      question:
        "When <mark>“I mean, I like beef rare”</mark> is spoken, which area of the home is the other person in?",
      baseline: "Dining area",
      answer: "Kitchen area",
      steps: [
        {
          at: 0,
          name: "Watch them leave",
          insight:
            "The other person gets up from the dining table. <mark>Their location changes</mark> while the camera wearer remains at the table.",
        },
        {
          at: 17.5,
          name: "Hear the speaker",
          insight:
            "At the question’s speech event, the camera faces the meal. <mark>Where the camera is does not tell us where the speaker is.</mark>",
        },
        {
          at: 23,
          name: "Read the landmarks",
          insight:
            "The floormap distinguishes the table from the <mark>counter, oven, and refrigerator</mark>. These landmarks locate the kitchen without supplying annotated region boundaries to the model.",
        },
        {
          at: 28,
          name: "Identify the area",
          insight:
            "FloorSAV combines movement history with the mapped objects and answers <mark>kitchen area</mark>. The egocentric baseline instead answers dining area.",
        },
      ],
    },
    {
      name: "path",
      category: "Path reasoning",
      title: "What would you pass on the way?",
      start: 118,
      duration: 16,
      event: [4.5, 6.8],
      quote: "Let’s … we got the kebabs so.",
      qa: "expE_1224",
      scene: "loc2_script3_seq31_rec1",
      figure: "path",
      question:
        "At <mark>“Let’s … we got the kebabs so,”</mark> imagine walking in a straight line to the couch. Which candidate object would you pass most closely?",
      baseline: "Pool window",
      answer: "Wall-mounted TV",
      steps: [
        {
          at: 0,
          name: "Find your position",
          insight:
            "Locate the camera at the speech event. The task asks about <mark>an imagined straight path</mark>, not a walk actually taken in the clip.",
        },
        {
          at: 4.5,
          name: "Find the destination",
          insight:
            "The map places the <mark>couch and candidate objects</mark> in one frame, including objects outside the current camera view.",
        },
        {
          at: 8,
          name: "Connect the route",
          insight:
            "The cyan segment connects the <mark>query-time camera position to the couch</mark>. Compare objects to this finite segment, including its endpoints.",
        },
        {
          at: 12,
          name: "Compare the objects",
          insight:
            "FloorSAV selects the <mark>wall-mounted TV</mark>. An independent ground-truth check confirms the TV at 1.04 m from the route, versus 2.70 m for the pool window. The overlay is illustrative.",
        },
      ],
    },
  ];
  cases.sort(
    (a, b) =>
      ["region", "path", "viewpoint"].indexOf(a.name) -
      ["region", "path", "viewpoint"].indexOf(b.name),
  );
  let caseIndex = 0,
    stepIndex = -1,
    annotations = true;
  const caseButtons = $$("[data-case]"),
    stepButtons = $$("[data-step]");
  const story = new VideoPair("case", { onUpdate: renderStory });
  allPairs.push(story);
  function selectCase(index) {
    caseIndex = index;
    stepIndex = -1;
    const c = cases[index];
    $("#case-category").textContent = c.category;
    $("#case-title").textContent = c.title;
    $("#case-question").innerHTML = c.question;
    $("#case-reference").textContent =
      `${c.qa} · ${c.scene} · Source ${formatTime(c.start)}–${formatTime(c.start + c.duration)} · 20 fps`;
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
      b.querySelector(".step-time").textContent = formatTime(
        c.start + c.steps[i].at,
      );
    });
    story.userPaused = true;
    story.load(c.name, c.start, c.duration);
    $("#media-error").hidden = true;
    $("#playback-intro").hidden = false;
    $("#walkthrough-duration").textContent =
      `${c.duration} seconds · Highlights guide the way`;
  }
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
  stepButtons.forEach((b, i) =>
    b.addEventListener("click", () => {
      $("#playback-intro").hidden = true;
      story.userPaused = true;
      story.pause();
      story.setTime(cases[caseIndex].steps[i].at + 0.04);
    }),
  );
  $("#case-restart").addEventListener("click", () => {
    story.pause();
    story.setTime(0);
    story.userPaused = true;
  });
  $("#case-speed").addEventListener("click", () => {
    const rates = [1, 0.75, 0.5];
    const rate =
      rates[(rates.indexOf(story.ego.playbackRate) + 1) % rates.length];
    story.ego.playbackRate = story.map.playbackRate = rate;
    $("#case-speed").textContent = `${rate}×`;
    $("#case-speed").setAttribute(
      "aria-label",
      `Playback speed, ${rate} times`,
    );
  });
  $("#annotations").addEventListener("change", (e) => {
    annotations = e.target.checked;
    $("#ego-overlay").toggleAttribute("hidden", !annotations);
    $("#map-overlay").toggleAttribute("hidden", !annotations);
    $("#map-evidence-label").hidden = !annotations;
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
  const ring = (id, x, y, rx = 6, ry = 6, cls = "") =>
    `<ellipse id="${id}" class="highlight ring draw ${cls}" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`;
  const underline = (x, y, w) =>
    `<path class="highlight draw" d="M ${x - w / 2} ${y + 2} Q ${x} ${y + 3.2} ${x + w / 2} ${y + 2}"/>`;
  const svgText = (x, y, text) => `<text x="${x}" y="${y}">${text}</text>`;
  function renderStory(t) {
    const c = cases[caseIndex];
    if (!c) return;
    const data = window.FLOORSAV_MEDIA?.[c.name];
    const step = c.steps.reduce((v, s, i) => (t >= s.at ? i : v), 0);
    $("#case-source-time").textContent = `Source ${formatTime(c.start + t)}`;
    const eventNow = t >= c.event[0] && t <= c.event[1];
    $("#event-caption").innerHTML = eventNow
      ? `<mark>“${c.quote}”</mark>`
      : step === 0
        ? c.name === "region"
          ? "Before the speech event"
          : `Listen for the event at ${formatTime(c.start + c.event[0])}`
        : "";
    if (step !== stepIndex) {
      stepIndex = step;
      stepButtons.forEach((b, i) => {
        if (i === step) b.setAttribute("aria-current", "step");
        else b.removeAttribute("aria-current");
      });
      $("#insight-number").textContent = `0${step + 1}`;
      $("#case-insight").innerHTML = c.steps[step].insight;
      $("#baseline-answer").textContent =
        step >= 1 ? c.baseline : "Observe the scene";
      $("#floorsav-answer").textContent =
        step === 3 ? c.answer : "Follow the evidence…";
      $(".answer-ours").classList.toggle("pending", step !== 3);
      buildOverlays(c, step, data);
    }
    if (!data) return;
    const sample =
      data.samples[Math.min(data.samples.length - 1, Math.round(t * data.fps))];
    for (const [id, point] of [
      ["camera-ring", sample.camera],
      ["sound-ring", sample.sound],
    ]) {
      const el = $("#" + id);
      if (el) {
        el.style.display =
          point && point.every((v) => v >= 4 && v <= 96) ? "" : "none";
        if (point) {
          el.setAttribute("cx", point[0]);
          el.setAttribute("cy", point[1]);
        }
      }
    }
    const leaving = $("#leaving-ring");
    if (leaving) leaving.style.display = t < 4 ? "" : "none";
    // A tracked visual highlight is shown only during the verified nearby frames.
    const person = $("#person-ring");
    if (person) {
      const visible = c.name === "viewpoint" && t >= 13 && t <= 18;
      person.style.display = visible ? "" : "none";
      if (visible) {
        const p = personTrack(t);
        person.setAttribute("cx", p[0]);
        person.setAttribute("cy", p[1]);
        person.setAttribute("rx", p[2]);
        person.setAttribute("ry", p[3]);
      }
    }
  }
  function personTrack(t) {
    const track = [
      [13, 6, 52, 9, 28],
      [14, 9, 57, 10, 27],
      [15, 27, 56, 12, 27],
      [16, 35, 59, 13, 26],
      [17, 45, 66, 12, 26],
      [18, 56, 64, 13, 28],
    ];
    let k = 0;
    while (k < track.length - 2 && t > track[k + 1][0]) k++;
    const a = track[k],
      b = track[k + 1],
      u = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
    return a.slice(1).map((v, i) => v + (b[i + 1] - v) * u);
  }
  function buildOverlays(c, step, data) {
    let map = "",
      ego = "",
      label = "";
    if (data) {
      const d =
        data.samples[
          Math.min(
            data.samples.length - 1,
            Math.round(c.steps[step].at * data.fps),
          )
        ];
      if (step >= 0) map += ring("camera-ring", ...d.camera, 3, 3);
      if (c.name === "viewpoint") {
        if (step >= 1) {
          map += ring("sound-ring", ...(d.sound || [50, 50]), 4.3, 4.3);
          label = "Camera pose + sound estimate";
        }
        if (step >= 2) {
          ego += ring("person-ring", 5, 50, 10, 26);
          const p = data.objects["counter"];
          map += underline(p[0], p[1] - 2, 15);
          label = "Connect nearby visual context with the map";
        }
        if (step === 3) label = "Two viewpoints → back-left";
      } else if (c.name === "region") {
        if (step === 0) ego += ring("leaving-ring", 39, 45, 25, 38);
        if (step === 1) {
          const p = data.objects.table;
          map += ring("table-ring", ...p, 9, 6);
          label = "The camera remains at the dining table";
        }
        if (step >= 2) {
          const p = data.objects.counter,
            q = data.objects.oven,
            r = data.objects.refrigerator;
          map +=
            ring(
              "kitchen-ring",
              (p[0] + q[0] + r[0]) / 3,
              (p[1] + q[1] + r[1]) / 3,
              17,
              26,
            ) +
            underline(p[0], p[1] - 2, 14) +
            underline(r[0], r[1] - 2, 18);
          label =
            step === 3
              ? "Mapped landmarks → kitchen area"
              : "Kitchen landmarks";
        }
      } else {
        const sofa = data.objects.sofa,
          tv = data.objects.tv;
        if (step >= 1) {
          map += ring("sofa-ring", ...sofa, 7, 4.5);
          label = "Find the couch";
        }
        if (step >= 2) {
          const query =
            data.samples[Math.round((123.6 - c.start) * data.fps)].camera;
          map +=
            `<path class="highlight path draw" d="M ${query[0]} ${query[1]} L ${sofa[0]} ${sofa[1]}"/><circle class="dot" cx="${query[0]}" cy="${query[1]}" r="1.1"/>` +
            svgText(query[0] + 2, query[1] + 4, "Query position");
          label = "Query-time route · 02:03.6";
        }
        if (step === 3)
          map += ring("tv-ring", ...tv, 5, 5) + underline(tv[0], tv[1] - 2, 7);
      }
    }
    $("#map-overlay").innerHTML = map;
    $("#ego-overlay").innerHTML = ego;
    $("#map-evidence-label").textContent = label;
  }
  selectCase(0);
  $("#start-walkthrough").addEventListener("click", () => {
    $("#playback-intro").hidden = true;
    story.userPaused = false;
    story.play(true);
  });
  $("#case-play").addEventListener("click", () => {
    $("#playback-intro").hidden = true;
  });
  $("#case-seek").addEventListener("input", () => {
    $("#playback-intro").hidden = true;
  });
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
    "body>header,main>section:not(#examples),#examples>.wrap>.section-heading,.case-tabs,.case-heading,.case-question,.evidence-steps,.insight,.answers,.case-footer,#examples>.wrap>.small-note,body>footer",
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
    else if (hero.visible && !hero.userPaused && !reduced.matches) hero.play();
  });
  new MutationObserver(() => {
    if (dialog.open) allPairs.forEach((p) => p.pause());
  }).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  reduced.addEventListener("change", () => {
    if (reduced.matches) allPairs.forEach((p) => p.pause());
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
    ctx.font = `500 ${size}px Inter,system-ui,sans-serif`;
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
        flat < 0.9 ? 1.25 : 0.85,
        flat < 0.9 ? "#6e8aad88" : "#74869c75",
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
      line(mapCtx, history, "#4385dd", 2.6);
      const head = camera[2],
        fov = 0.86,
        mapAngle = head - 0.48;
      mapCtx.beginPath();
      mapCtx.moveTo(...pos);
      mapCtx.arc(pos[0], pos[1], 124, mapAngle - fov, mapAngle + fov);
      mapCtx.closePath();
      mapCtx.fillStyle = "#f4d35739";
      mapCtx.fill();
      const end = [
        pos[0] + 29 * Math.cos(mapAngle),
        pos[1] + 29 * Math.sin(mapAngle),
      ];
      line(mapCtx, [pos, end], "#db5956", 3);
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
      dot(mapCtx, ...pos, 6, "#db5956");
      dot(mapCtx, ...pos, 2, "#fff");
      if (phase === 1) {
        label(mapCtx, "Camera", pos[0] - 21, pos[1] + 24, "#af4d4d", 11);
        label(mapCtx, "Recent path", 175, 325, "#3974bb", 10);
      }
    }
    if (phase >= 2) {
      const opacity = phase === 2 ? clamp(u * 3) : 1,
        p = xy(6.15, 4.45 + (phase === 4 ? 0.12 * Math.sin(u * 6) : 0));
      mapCtx.save();
      mapCtx.globalAlpha = opacity;
      const radius = 8 + ((renderMs % 1200) / 1200) * 25;
      mapCtx.strokeStyle = "#28987755";
      mapCtx.lineWidth = 1.5;
      mapCtx.beginPath();
      mapCtx.arc(...p, radius, 0, Math.PI * 2);
      mapCtx.stroke();
      dot(mapCtx, ...p, 6, "#249772");
      dot(mapCtx, ...p, 2, "white");
      if (phase === 2) {
        const c = cameraAt(1),
          cp = xy(c[0], c[1]);
        mapCtx.setLineDash([4, 5]);
        line(mapCtx, [cp, p], "#2b997480", 1.6);
        mapCtx.setLineDash([]);
        label(
          mapCtx,
          "Estimated sound position",
          p[0] - 124,
          p[1] - 23,
          "#1e8060",
          11,
        );
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
        const text = f.label,
          mapWidth = mapCtx.measureText(text).width + 16;
        box(
          mapCtx,
          pt[0] - mapWidth / 2,
          pt[1] - 10,
          mapWidth,
          20,
          5,
          "#fff",
          "#bdcfe5",
        );
        mapCtx.textAlign = "center";
        label(mapCtx, text, pt[0], pt[1] + 4, "#36577f", 10);
        mapCtx.textAlign = "left";
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
          isCurrent ? "#edf4ff" : "#fafbfd",
          isCurrent ? "#5790df" : "#d4dfed",
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
      label(mapCtx, "Frames", 82, 420, "#738ba8", 9);
    }
    if (phase !== renderIndex) {
      renderIndex = phase;
      const s = renderStages[phase];
      $("#render-step-title").textContent = s[0];
      $("#render-step-description").textContent = s[1];
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
        box(
          signalCtx,
          5 + i * 123,
          24,
          110,
          48,
          8,
          phase === 4 ? "#edf4ff" : "#f3edf9",
          "#cfdae9",
        );
        label(
          signalCtx,
          phase === 4
            ? String(i + 1).padStart(2, "0")
            : ["sofa", "table", "counter", "chair"][i],
          25 + i * 123,
          53,
          "#57729b",
          15,
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
      renderMs = Number(b.dataset.renderStep) * 4000 + 1800;
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
    if (!document.hidden && !dialog.open) {
      allPairs.forEach((p) => p.tick());
      if (renderVisible && renderPlaying) {
        renderMs = (renderMs + dt) % renderDuration;
        drawRendering();
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
