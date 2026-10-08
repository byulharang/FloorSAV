"""Generate Exo-to-Ego Distance questions from the spatial parameters."""

from ._dynamic import generate as generate_dynamic


def generate(records, assets):
    return generate_dynamic(records, assets, task="Exo-to-Ego Distance",
                            ego_to_exo=False, direction=False)
