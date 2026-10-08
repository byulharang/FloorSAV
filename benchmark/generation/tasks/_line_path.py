"""Nearest offered object to the finite route segment."""

import numpy as np

from ..geometry import point_segment_distance
from ..schema import LETTERS, item


def generate(records, assets, *, dynamic):
    output = []
    for record in records:
        start, _ = assets.pose(record, "camera_wearer")
        objects = assets.object_centers(record)
        if dynamic:
            target, _ = assets.pose(record, "other_person")
            question = (f"Imagine you are the camera wearer. At the moment when {record['event']}, "
                        "the speaker is the other person. Suppose you walk in a straight line "
                        "from your current position to that person's position. ")
        else:
            target = objects[record["destination"]]
            question = (f"Imagine you are the camera wearer, when {record['event']}, suppose you "
                        f"walk in a straight line from your current position to the {record['destination']}. ")
        question += ("Among the following objects, which one would you pass by most closely? "
                     "Use each object's annotated center position and treat the route as a finite "
                     "segment; distances past either endpoint do not count.")
        distances = [point_segment_distance(objects[label], start, target) for label in record["object_labels"]]
        order = np.argsort(distances)
        if distances[order[1]] - distances[order[0]] <= 1e-8:
            raise ValueError("Nearest-object answer is tied")
        task = "Line-Path Search (dynamic)" if dynamic else "Line-Path Search (static)"
        output.append(item(record, task, "Path Reasoning", question, LETTERS[int(order[0])]))
    return output
