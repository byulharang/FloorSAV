"""Generate Ego-to-Exo Direction questions from the spatial parameters."""

from ._dynamic import generate as generate_dynamic


def generate(records, assets):
    return generate_dynamic(records, assets, task="Ego-to-Exo Direction",
                            ego_to_exo=True, direction=True)
