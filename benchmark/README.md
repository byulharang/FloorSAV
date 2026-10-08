# SAVED-Bench

The benchmark contains **1,988 questions from 55 scenes**, covering nine
tasks in three categories. Results are the values reported in **Table 1** of
the [accompanying paper](../assets/figures/paper.pdf) with Gemini-3.6-Flash.

| File | Contents |
|---|---|
| `qa.json` | Questions, choices, ground truths, scenes and time intervals |
| `results.json` | Reported Baseline, FloorSAV, Partial GT map and Full GT map scores |
| `build_release.py` | Public-format packaging and validation utility |
| `generation/` | Task-specific question construction, geometric answer computation and generation inputs |
| `README.md` | Data format and usage |

## Questions

`qa.json.items` contains the questions. `scene` identifies the source
recording; `start_time_s` and `end_time_s` are times in seconds. Questions are
ordered by category, task, scene, interval and question text.

- `MCA`: four choices and a letter ground truth.
- `NA`: one numeric ground truth in meters.
- `NA_PAIR`: two numeric ground truths in meters, camera wearer first and the
  other person second.

Numeric strings retain answer precision. Numeric questions have `options: null`.
`subject`, `variant` and `tags` describe the question's benchmark grouping.

## Reported results

`results.json.rows` contains nine task rows, three category task averages and
one QA-weighted overall row. The four columns are Baseline, FloorSAV, Partial
GT map and Full GT map. Scores are percentages at the paper's one-decimal
precision. Distance tasks use AbsMRA; other tasks use accuracy.

These are the reported table values, not a recomputation from individual model
outputs. Category averages and the overall value are preserved as reported;
they should not be recalculated from the rounded table entries. The checksum
links this table file to the bundled QA file; it does not verify a model run.

## Use

Python 3 and its standard library are sufficient:

```bash
python benchmark/build_release.py --check
```

To package inputs that follow the public JSON schema:

```bash
python benchmark/build_release.py --qa-input qa.json --results-input results.json --output release
```

The utility validates field names, question types, task and scene counts,
table completeness, numerical ranges, reported precision and the QA checksum.
It packages data and does not create questions from recordings.

## Generate questions

`generation/generate_all.py` runs all nine task generators. They construct the
question wording and compute answers from raw 20-Hz trajectories, synchronized
recording times, region polygons and object centers. The generated `qa.json`
must match the expected SHA-256 before it can be written.

Install the generation dependency and specify the SAVVY `data` directory:

```bash
python -m pip install -r benchmark/generation/requirements.txt
python benchmark/generation/generate_all.py --data-root /path/to/SAVVY/data
```

The default output is `benchmark/qa.json`. `results.json` is unchanged.
The source data directory must contain the 58 recording files listed in
`generation/scene_metadata.json`, under `dense_traj/aea/`. These recordings
include the camera-wearer scenes and their paired recordings. The raw
trajectory files are supplied separately; their hashes are checked on read.
`SAVVY_DATA_ROOT` can supply the data directory instead of `--data-root`.

Regenerate and verify without writing:

```bash
python benchmark/generation/generate_all.py --data-root /path/to/SAVVY/data --check
```

Generate one task:

```bash
python benchmark/generation/generate_all.py \
  --data-root /path/to/SAVVY/data \
  --task trajectory_distance --output /tmp/trajectory_distance.json
```

| Module in `generation/tasks/` | Questions | Answer computation |
|---|---:|---|
| `ego_to_exo_direction.py` | 200 | Imagined object in the wearer's frame, quadrant in the other person's assumed frame |
| `ego_to_exo_distance.py` | 200 | Distance from the other person to that object |
| `exo_to_ego_direction.py` | 200 | Imagined object in the other person's assumed frame, quadrant in the wearer's frame |
| `exo_to_ego_distance.py` | 200 | Distance from the wearer to that object |
| `location_awareness.py` | 200 | Subject position within annotated region polygons |
| `visit_history.py` | 392 | Stable visits from 1-Hz region membership and a five-sample dwell rule |
| `line_path_search_static.py` | 196 | Nearest offered object to the finite wearer-to-object segment |
| `line_path_search_dynamic.py` | 200 | Nearest offered object to the finite wearer-to-person segment |
| `trajectory_distance.py` | 200 | Each person's path length after a 0.75-second moving average and 0.5-meter RDP |

`generation/inputs.json` specifies the scene/time selections, speech anchors,
spatial parameters and option order for all 1,988 questions, along with output
checksums. The generators construct question text and compute answers using
these inputs and the raw trajectories. They do not read `qa.json`, `results.json`
or model outputs, and do not sample additional questions.
`generation/scene_metadata.json` contains the region polygons, object centers,
paired-clock offsets and trajectory checksums. Input and output checksums are
validated before writing.

Clock alignment uses `other_time = wearer_time + offset`. Positions use linear
interpolation and directions use the nearest normalized forward vector. Visit
history uses one-second sampling and the dwell rule described above, including
unassigned samples between equal-region visits. Generated questions use the
documented schema and ordering. The generation code runs locally without model
calls, uploads or rendering.
