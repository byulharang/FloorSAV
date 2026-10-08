"""Generate Exo-to-Ego Direction questions from the spatial parameters."""

from ._dynamic import generate as generate_dynamic


def generate(records, assets):
    return generate_dynamic(records, assets, task="Exo-to-Ego Direction",
                            ego_to_exo=False, direction=True)
