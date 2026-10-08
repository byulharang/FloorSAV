#!/usr/bin/env python3
"""Generate benchmark QA from supplied parameters and raw trajectories."""

import argparse
import hashlib
import importlib
import json
import os
from pathlib import Path
import sys

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from generation.data import Assets  # noqa: E402


TASKS = (
    "ego_to_exo_direction", "ego_to_exo_distance",
    "exo_to_ego_direction", "exo_to_ego_distance",
    "location_awareness", "visit_history",
    "line_path_search_static", "line_path_search_dynamic", "trajectory_distance",
)


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def generate(data_root, selected=TASKS):
    manifest = json.loads((HERE / "inputs.json").read_bytes())
    metadata_bytes = (HERE / "scene_metadata.json").read_bytes()
    if hashlib.sha256(metadata_bytes).hexdigest() != manifest["scene_metadata_sha256"]:
        raise ValueError("Scene annotation checksum mismatch")
    assets = Assets(data_root, json.loads(metadata_bytes))
    output = []
    for task in selected:
        module = importlib.import_module("generation.tasks." + task)
        records = manifest["tasks"][task]
        rows = module.generate(records, assets)
        if len(rows) != len(records):
            raise ValueError("Generated question count mismatch for " + task)
        output.extend(rows)
        print(f"{task}: {len(rows)} questions generated", flush=True)
    output.sort(key=lambda q: (q["category"], q["task"], q["scene"],
                              q["start_time_s"], q["end_time_s"], q["question"]))
    document = dict(benchmark="SAVED-Bench", version="1.0", qa_count=len(output),
                    scene_count=len({q["scene"] for q in output}), items=output)
    raw = encode(document)
    expected = (manifest["qa_sha256"] if tuple(selected) == TASKS
                else manifest["task_sha256"][selected[0]])
    if hashlib.sha256(raw).hexdigest() != expected:
        raise ValueError("Generated QA checksum mismatch; output was not written")
    return raw


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-root", type=Path, default=os.environ.get("SAVVY_DATA_ROOT"),
                        help="SAVVY data directory containing dense_traj/aea (or set SAVVY_DATA_ROOT)")
    parser.add_argument("--task", choices=TASKS, help="Generate just one task")
    parser.add_argument("--output", type=Path, help="Output JSON (default: benchmark/qa.json for all tasks)")
    parser.add_argument("--check", action="store_true", help="Regenerate and verify without writing a file")
    args = parser.parse_args()
    if args.data_root is None:
        parser.error("provide --data-root or set SAVVY_DATA_ROOT")
    if args.check and args.output:
        parser.error("--check does not write --output")
    if args.task and not args.check and args.output is None:
        parser.error("provide --output when generating a single task")
    raw = generate(args.data_root, (args.task,) if args.task else TASKS)
    if args.check:
        print("Generated QA checksum verified.")
        return
    destination = args.output or HERE.parent / "qa.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_bytes(raw)
    temporary.replace(destination)
    print(f"Wrote {destination}")


if __name__ == "__main__":
    main()
