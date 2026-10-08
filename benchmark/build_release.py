#!/usr/bin/env python3
"""Assemble or validate the benchmark and reported results."""

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path

BENCHMARK = "SAVED-Bench"
VERSION = "1.0"
MODEL = "Gemini-3.6-Flash"
COLUMNS = ["Baseline", "FloorSAV", "Partial GT map", "Full GT map"]
TASK_COUNTS = {
    "Location Awareness": 200, "Visit History": 392,
    "Line-Path Search (static)": 196, "Line-Path Search (dynamic)": 200,
    "Trajectory Distance": 200, "Ego-to-Exo Direction": 200,
    "Ego-to-Exo Distance": 200, "Exo-to-Ego Direction": 200,
    "Exo-to-Ego Distance": 200,
}
QA_FIELDS = {
    "scene", "start_time_s", "end_time_s", "category", "task", "subject",
    "variant", "tags", "question", "options", "groundtruth", "answer_type",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def number(value):
    require(type(value) in (int, float, str) and math.isfinite(float(value)), "Invalid numeric value")


def validate(qa, results, qa_bytes):
    require(set(qa) == {"benchmark", "version", "qa_count", "scene_count", "items"}, "Unexpected QA metadata")
    require(set(results) == {"benchmark", "version", "model", "qa_count", "unit", "precision", "columns", "rows", "qa_sha256"}, "Unexpected results metadata")
    for doc in (qa, results):
        require(doc["benchmark"] == BENCHMARK and doc["version"] == VERSION, "Wrong benchmark version")
        require(doc["qa_count"] == 1988, "Expected 1,988 questions")
    require(results["model"] == MODEL, "Unexpected model")
    require(results["unit"] == "percent" and results["precision"] == 1, "Unexpected score format")
    require(results["columns"] == COLUMNS, "Unexpected result columns")
    require(results["qa_sha256"] == hashlib.sha256(qa_bytes).hexdigest(), "QA checksum mismatch")
    require(len(qa["items"]) == 1988, "Question count mismatch")
    for q in qa["items"]:
        require(set(q) == QA_FIELDS, "Unexpected question fields")
        for key in ("scene", "category", "task", "subject", "variant", "question"):
            require(type(q[key]) is str and bool(q[key]), "Invalid question text")
        require(q["answer_type"] in ("MCA", "NA", "NA_PAIR"), "Unknown answer type")
        require(type(q["tags"]) is list and all(t in ("FoV_in", "FoV_out") for t in q["tags"]), "Unexpected question tag")
        for key in ("start_time_s", "end_time_s"):
            number(q[key])
        require(0 <= float(q["start_time_s"]) <= float(q["end_time_s"]), "Invalid time interval")
        if q["answer_type"] == "MCA":
            require(type(q["options"]) is list and len(q["options"]) == 4 and all(type(o) is str for o in q["options"]), "Invalid answer choices")
            require(q["groundtruth"] in ("A", "B", "C", "D"), "Invalid answer letter")
        else:
            require(q["options"] is None, "Unexpected numeric answer choices")
            if q["answer_type"] == "NA_PAIR":
                require(type(q["groundtruth"]) is list and len(q["groundtruth"]) == 2, "Expected two numeric answers")
                for value in q["groundtruth"]:
                    number(value)
            else:
                number(q["groundtruth"])
    require(Counter(q["task"] for q in qa["items"]) == TASK_COUNTS, "Benchmark task count mismatch")
    require(len({q["scene"] for q in qa["items"]}) == qa["scene_count"] == 55, "Scene count mismatch")
    categories = {q["category"] for q in qa["items"]}
    require(len(categories) == 3, "Expected three categories")
    require(len(results["rows"]) == 13, "Expected nine tasks, three category averages and one overall result")
    seen = set()
    category_means = set()
    overall = 0
    for row in results["rows"]:
        require(set(row) == {"category", "task", "qa_count", "scores"}, "Unexpected result row fields")
        require(type(row["scores"]) is list and len(row["scores"]) == 4, "Expected four reported scores")
        for value in row["scores"]:
            require(type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 100, "Invalid reported score")
            require(abs(value * 10 - round(value * 10)) < 1e-9, "Scores must use the paper's one-decimal precision")
        task = row["task"]
        if task in TASK_COUNTS:
            require(task not in seen, "Duplicate task row")
            seen.add(task)
            require(row["qa_count"] == TASK_COUNTS[task], "Wrong task count")
            require({q["category"] for q in qa["items"] if q["task"] == task} == {row["category"]}, "Wrong task category")
        elif task == "Task average":
            category = row["category"]
            require(category in categories and category not in category_means, "Duplicate or unknown category average")
            category_means.add(category)
            require(row["qa_count"] == sum(q["category"] == category for q in qa["items"]), "Wrong category count")
        else:
            require(task == "QA-weighted average" and row["category"] == "Overall" and row["qa_count"] == 1988, "Unexpected aggregate")
            overall += 1
    require(seen == set(TASK_COUNTS) and category_means == categories and overall == 1, "Incomplete reported table")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify the two released JSON files")
    parser.add_argument("--qa-input", type=Path, help="QA JSON using the documented schema")
    parser.add_argument("--results-input", type=Path, help="Reported table JSON using the documented schema")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    if args.check:
        if args.qa_input or args.results_input:
            parser.error("--check cannot be combined with input files")
        qa_bytes = (args.output / "qa.json").read_bytes()
        qa = json.loads(qa_bytes)
        results = json.loads((args.output / "results.json").read_bytes())
        validate(qa, results, qa_bytes)
    else:
        if args.qa_input is None or args.results_input is None:
            parser.error("use --check, or provide --qa-input and --results-input")
        qa = json.loads(args.qa_input.read_bytes())
        results = json.loads(args.results_input.read_bytes())
        qa_bytes = encode(qa)
        results["qa_sha256"] = hashlib.sha256(qa_bytes).hexdigest()
        validate(qa, results, qa_bytes)
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / "qa.json").write_bytes(qa_bytes)
        (args.output / "results.json").write_bytes(encode(results))
    print("Verified: 1,988 questions, 55 scenes, nine tasks and four reported result columns.")


if __name__ == "__main__":
    main()
