"""Generate stable visit-order and unvisited-region questions."""

from ..geometry import stable_visits
from ..schema import LETTERS, answer_letter, item


def generate(records, assets):
    output = []
    for record in records:
        dwell = record["minimum_dwell_s"]
        sequence = stable_visits(assets.interval_membership(record), dwell)
        wearer = record["subject"] == "camera_wearer"
        context = ("Imagine you are the camera wearer, consider" if wearer else "Consider")
        context += (f" the interval from when {record['start_event']} until when "
                    f"{record['end_event']}. During this interval, ")
        if record["variant"] == "visit_order":
            subject = "you" if wearer else "the other person"
            pronoun = "you" if wearer else "they"
            question = (context + f"in which order did {subject} make stable visits to areas of the home? "
                        f"Keep an area again if {pronoun} left it and later returned; "
                        f"ignore visits shorter than {dwell} seconds.")
            answer = answer_letter(record, " -> ".join("the " + name for name in sequence))
        elif record["variant"] == "unvisited":
            subject = "you" if wearer else "the other person"
            staying = "staying" if wearer else "they stayed"
            question = (context + f"which area of the home did {subject} not visit? "
                        f"Count an area as visited only after {staying} for at least {dwell} seconds.")
            matches = [letter for letter, text in zip(LETTERS, record["option_texts"])
                       if text.startswith("the ") and text[4:] not in sequence]
            if not matches:
                matches = [letter for letter, text in zip(LETTERS, record["option_texts"])
                           if text.lower() == "none of the above"]
            if len(matches) != 1:
                raise ValueError("Unvisited region does not uniquely match the choices")
            answer = matches[0]
        else:
            raise ValueError("Unsupported visit-history variant")
        output.append(item(record, "Visit History", "Regional", question, answer))
    return output
