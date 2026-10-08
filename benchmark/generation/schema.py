"""Construct benchmark questions in the public JSON format."""

LETTERS = "ABCD"


def options(record):
    return [f"{letter}: {text}" for letter, text in zip(LETTERS, record["option_texts"])]


def answer_letter(record, text):
    matches = [letter for letter, option in zip(LETTERS, record["option_texts"]) if option == text]
    if len(matches) != 1:
        raise ValueError("Computed answer does not uniquely match the four choices")
    return matches[0]


def item(record, task, category, question, groundtruth, answer_type="MCA"):
    return {
        "scene": record["scene"],
        "start_time_s": record["start_time_s"],
        "end_time_s": record["end_time_s"],
        "category": category,
        "task": task,
        "subject": record["subject"],
        "variant": record["variant"],
        "tags": record["tags"],
        "question": question,
        "options": options(record) if answer_type == "MCA" else None,
        "groundtruth": groundtruth,
        "answer_type": answer_type,
    }
