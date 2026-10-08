"""Generate Ego-to-Exo Distance questions from the spatial parameters."""

from ._dynamic import generate as generate_dynamic


def generate(records, assets):
    return generate_dynamic(records, assets, task="Ego-to-Exo Distance",
                            ego_to_exo=True, direction=False)
