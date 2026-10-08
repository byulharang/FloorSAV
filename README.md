# FloorSAV

Research project page for **FloorSAV: Elucidating Spatial Audio-Visual Context with 2D Floormap for AV-LLMs**.

## Preview

```bash
python scripts/serve.py
```

Open **http://127.0.0.1:8000**. The preview server supports HTTP byte ranges so video seeking works correctly. The website itself is static: `index.html` and `assets/` can be served by GitHub Pages or another static host without an npm build.

## Page and interactions

- Original 20 fps egocentric clips paired with maps at matching source times.
- Three reader-paced examples: off-screen speaker, imagined path, and viewpoint transformation. Context clips pause automatically; subsequent explanation steps can hold the exact same query frame.
- Numbered map callouts, an imagined route, and an explicitly labeled reconstruction of model-reported viewpoint coordinates. On phones, video/map tabs keep each view large enough to read.
- Shared playback/seek controls, sound, speed, expanded view, keyboard-accessible tabs, and reduced-motion support.
- SAVED-Bench comparison graphs by default, with a table switch, category filters, separate oracle conditions, and a CSV download. Graph values come directly from the verified table cells.
- Original manuscript figures and PDF, plus copyable BibTeX.

Base styles live in `assets/style.css`; reading and guided-example layouts in `assets/experience.css`. `assets/site.js` controls playback, `assets/stories.js` holds source-aligned editorial explanations, and `assets/results.js` builds graphs from the table. The locally served DM Sans font includes its SIL Open Font License in `assets/fonts/OFL.txt`. There are no analytics or required third-party runtime requests.

## Research sources

The supplied `floorsav.html` was converted into `index.html`; its embedded figures were extracted into `assets/figures/`. The current downloadable `assets/figures/paper.pdf` is the user-supplied main manuscript `FloorSAV.pdf` (October 2026). `kaist-logo.png` is the blue KAIST logo extracted directly from that PDF’s first page.

Copy follows the abstract, contributions, and conclusion: a task-agnostic, training-free framework that supplies a dynamic 2D floormap and egocentric video as synchronized streams, with interpretation guidance, for joint reasoning in a single AV-LLM inference **after scene preparation**. SAVED-Bench evaluates dynamic relativity, regional reasoning, and path reasoning; the paper also reports benefits on SAVVY-Bench.

Results use **saved1988_ego2exo_out_set3_v1_20260925**, from `neurips/saved_bench/reports/combined_scores_1988.csv`. `Map-task` is shown as FloorSAV; `Partial-task` and `Full-task` are separate oracle conditions. The 1,988-question release mixes existing responses with 100 replacement FoV-out responses. Category scores average tasks; the headline overall score is QA weighted. Precision and decreases are preserved.

Qualitative examples come from `neurips/ICLR/rendered_assets/qualitative_joint_20260923/selected/`:

| Case | QA | Scene | Source interval |
|---|---|---|---|
| Speaker location | expE_0034 | loc2_script3_seq4_rec1 | 96–128 s |
| Imagined path | expE_1224 | loc2_script3_seq31_rec1 | 118–134 s |
| Viewpoint | expE_1567 | loc3_script2_seq3_rec1 | 60–80 s |

RGB clips use original timestamped AEA frames, rotated as in the qualitative source renderer. They are **not interpolated from the sparse 128-frame model input**. Audio is trimmed from the corresponding model-input video. Maps reuse the native renderer's preprocessing and original camera/audio/object data, with presentation styling and 20 fps updates. They are not additional model runs. Green markers are estimated sound positions, not ground-truth people. The method animation is a separate schematic.

Guided query frames are held at 114.75 s (region), 123.60 s (path; nearest 20 fps frame to 123.62 s), and 65.50 s (viewpoint). These stops describe the source footage, not the timing of an internal model process. Explanations are concise editorial summaries of selected saved model outputs, not claims that every intermediate calculation is correct.

The viewpoint sketch uses the selected model output’s reported positions and heading, clearly separated from the sensor map. The path overlay illustrates estimated map positions at the query time. The cited TV/window distances (1.04 m / 2.70 m) come from the original `geometry_audit.json`, not from the overlay or the model's unverified geometric explanation.

[`assets/data/provenance.json`](assets/data/provenance.json) records source identifiers, clip intervals, frame counts, alignment errors and asset hashes. The three `*-timing.json` files retain local source references; `media-data.js` contains only the runtime coordinates.

## Rebuild the media

The local `savvy-bench` environment has the research renderer's Python dependencies. `ffmpeg` and `ffprobe` must be available. The default research root is the sibling `neurips` checkout in the original workspace; set `FLOORSAV_RESEARCH_ROOT` when using another location. The research renderer's own configuration must also point to the correct datasets.

```bash
# Use the Python environment that can import the original map renderer.
python scripts/build_media.py 0  # viewpoint
python scripts/build_media.py 1  # region
python scripts/build_media.py 2  # path
python scripts/verify_data.py
```

Output is 720 × 720 H.264, 20 fps, with fast-start metadata and a maximum two-second keyframe interval for seeking. `verify_data.py` compares the HTML table against the exported CSV, checks the original CSV when available, validates video frame counts/timestamps/keyframes, and regenerates the runtime media data and provenance manifest. It never modifies research inputs or runs a model.

## Review

With the preview server running and Playwright/Chromium available:

```bash
node scripts/verify_site.cjs
node scripts/verify_accessibility.cjs  # also requires axe-core
python scripts/verify_data.py
```

An existing tool installation can be supplied through `PLAYWRIGHT_MODULE` and `AXE_PATH`. `SITE_URL` overrides the preview URL; `REVIEW_OUTPUT` overrides `/tmp/floorsav-review`. Browser checks cover synchronized playback, automatic stops, holding a query frame across several explanation steps, manual exploration/resumption, all three cases, keyboard tabs, enlarged playback, figure dialogs, citation copying, graph/table equivalence, negative results, oracle filters, phone evidence tabs, mobile widths, and reduced motion. Accessibility checks cover desktop/mobile and expanded playback, plus seeking at 1.5 Mbps / 150 ms latency. Automated checks supplement visual review; they do not establish complete accessibility conformance.

Design references: [Nerfies](https://nerfies.github.io/) for concise research information and demonstration-led structure, and [Google DeepMind Genie](https://deepmind.google/models/genie/) for video presentation and spacing. Page code and copy were rewritten for FloorSAV; their site assets were not copied.
