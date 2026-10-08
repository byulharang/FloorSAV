"""Compute each person's smoothed path length over the selected interval."""

from ..data import paired
from ..geometry import path_length
from ..schema import item


def generate(records, assets):
    output = []
    for record in records:
        scene = assets.scene_name(record)
        start, end = record["interval_start_s"], record["interval_end_s"]
        offset = assets.offset(scene)
        wearer = assets.trajectory(scene).segment(start, end)
        other = assets.trajectory(paired(scene)).segment(start + offset, end + offset)
        answer = [f"{path_length(points):.2f}" for points in (wearer, other)]
        question = ("Imagine you are the camera wearer, consider the interval from when "
                    f"{record['start_event']} until when {record['end_event']}. During this "
                    "interval, approximately how many meters did you travel, and approximately "
                    "how many meters did the other person travel? Estimate each person's total "
                    "path length actually walked, including detours around furniture, not the "
                    "straight-line displacement. Answer with exactly two numeric values in this "
                    "order: you first, then the other person, in the form "
                    "{{your_distance, other_person_distance}}.")
        output.append(item(record, "Trajectory Distance", "Path Reasoning", question, answer, "NA_PAIR"))
    return output
