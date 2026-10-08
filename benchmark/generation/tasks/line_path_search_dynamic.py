"""Generate Line-Path Search (dynamic) questions and geometric answers."""

from ._line_path import generate as generate_line_path


def generate(records, assets):
    return generate_line_path(records, assets, dynamic=True)
