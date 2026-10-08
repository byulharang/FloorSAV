"""Shared question construction and reference-frame geometry."""

import numpy as np

from ..geometry import hypothetical_forward, quadrant, rotate_clockwise
from ..schema import answer_letter, item


ORIENTATIONS = {
    "towards_wearer": "facing DIRECTLY TOWARDS YOU",
    "same_direction": "facing IN THE SAME DIRECTION AS YOU",
    "clockwise_90": "facing 90 degrees CLOCKWISE relative to your facing direction",
    "counterclockwise_90": "facing 90 degrees COUNTER-CLOCKWISE relative to your facing direction",
}


def generate(records, assets, *, task, ego_to_exo, direction):
    output = []
    for record in records:
        wearer, wearer_forward = assets.pose(record, "camera_wearer")
        other, _ = assets.pose(record, "other_person")
        other_forward = hypothetical_forward(record["orientation"], wearer, wearer_forward, other)
        angle, radius = record["angle_clockwise_deg"], record["radius_m"]
        if ego_to_exo:
            marker = wearer + radius * rotate_clockwise(wearer_forward, angle)
            origin, forward = other, other_forward
            placement = (f"suppose an imaginary object is placed {angle:g} degrees clockwise from "
                         "your facing direction (0 degrees means straight ahead of you), at a "
                         f"horizontal distance of {radius:g} meters from you")
            query = ("Relative to the other person's facing direction, where is this object: "
                     "front-left, front-right, back-left, or back-right?" if direction else
                     "Approximately how many meters is this object from the other person?")
        else:
            marker = other + radius * rotate_clockwise(other_forward, angle)
            origin, forward = wearer, wearer_forward
            placement = (f"suppose an imaginary object is placed {angle:g} degrees clockwise from "
                         "the other person's facing direction, at a horizontal distance of "
                         f"{radius:g} meters from the other person")
            query = ("Relative to your facing direction, where is this object: front-left, "
                     "front-right, back-left, or back-right?" if direction else
                     "Approximately how many meters is this object from you?")
        ending = (" The directions refer to the quadrants of a Cartesian plane." if direction
                  else " Answer in numeric format.")
        question = (f"Imagine you are the camera wearer, when {record['event']}, {placement}. "
                    f"Suppose the other person is {ORIENTATIONS[record['orientation']]} at that "
                    f"same moment. {query}{ending}")
        groundtruth = (answer_letter(record, quadrant(origin, forward, marker)) if direction
                       else f"{float(np.linalg.norm(marker - origin)):.2f}")
        output.append(item(record, task, "Dynamic Relativity", question, groundtruth,
                           "MCA" if direction else "NA"))
    return output
