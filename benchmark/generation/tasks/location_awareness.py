"""Generate a question and compute its answer by point-in-polygon membership."""

from ..geometry import polygon_membership
from ..schema import answer_letter, item


def generate(records, assets):
    output = []
    for record in records:
        point, _ = assets.pose(record, record["subject"])
        region = polygon_membership([point], assets.regions(assets.scene_name(record)))[0]
        answer = "the " + region if region is not None else "None of the above"
        subject = "camera wearer" if record["subject"] == "camera_wearer" else "other person"
        question = (f"Imagine you are the camera wearer, when {record['event']}, "
                    f"in which area of the home is the {subject} at that moment?")
        output.append(item(record, "Location Awareness", "Regional", question, answer_letter(record, answer)))
    return output
