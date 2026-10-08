"""Read raw trajectories and scene annotations."""

import hashlib
import json
from pathlib import Path

import numpy as np

from .geometry import polygon_membership


def paired(scene):
    if not scene.endswith(("_rec1", "_rec2")):
        raise ValueError("Expected a paired recording name")
    return scene[:-1] + ("2" if scene.endswith("1") else "1")


class Trajectory:
    def __init__(self, raw):
        rows = json.loads(raw)
        keys = sorted(rows, key=int)
        self.times = np.asarray([int(k) for k in keys], dtype=float) / 20.0
        self.positions = np.asarray([rows[k]["loc"] for k in keys], dtype=float)
        self.forwards = np.asarray([rows[k]["forward_vec"] for k in keys], dtype=float)
        norms = np.linalg.norm(self.forwards, axis=1, keepdims=True)
        if np.any(norms < 1e-12):
            raise ValueError("Zero forward vector in trajectory")
        self.forwards /= norms

    @property
    def duration(self):
        return float(self.times[-1])

    def positions_at(self, times, allow_boundary_sample=False):
        times = np.asarray(times, dtype=float)
        if not allow_boundary_sample and (times.min() < self.times[0] - 1e-9 or times.max() > self.times[-1] + 1e-9):
            raise ValueError("Requested time outside the trajectory")
        return np.stack([np.interp(times, self.times, self.positions[:, axis])
                         for axis in (0, 1)], axis=-1)

    def pose(self, time):
        position = self.positions_at([time])[0]
        index = int(np.argmin(np.abs(self.times - time)))
        return position, self.forwards[index].copy()

    def segment(self, start, end):
        self.positions_at([start, end])
        return self.positions[(self.times >= start) & (self.times <= end)]


class Assets:
    def __init__(self, data_root, metadata):
        self.root = Path(data_root)
        self.metadata = metadata
        self.cache = {}

    def trajectory(self, scene):
        if scene not in self.cache:
            path = self.root / "dense_traj" / "aea" / (scene + ".json")
            raw = path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != self.metadata["dense_sha256"][scene]:
                raise ValueError("Input trajectory checksum mismatch: " + scene)
            self.cache[scene] = Trajectory(raw)
        return self.cache[scene]

    def scene_name(self, record):
        return record["scene"].split("/")[-1]

    def offset(self, scene):
        return self.metadata["other_clock_offsets_s"][scene]

    def pose(self, record, subject):
        scene = self.scene_name(record)
        time = record["sample_time_s"]
        if subject == "other_person":
            time += self.offset(scene)
            scene = paired(scene)
        return self.trajectory(scene).pose(time)

    def regions(self, scene):
        return self.metadata["regions"][scene.split("_")[0]]

    def object_centers(self, record):
        return self.metadata["objects"][self.scene_name(record)]

    def interval_membership(self, record):
        scene = self.scene_name(record)
        wearer, other = self.trajectory(scene), self.trajectory(paired(scene))
        times = np.arange(0, min(wearer.duration, other.duration), 1.0)
        start = max(0, int(np.floor(record["interval_start_s"])))
        end = min(len(times), int(np.ceil(record["interval_end_s"])) + 1)
        times = times[start:end]
        if record["subject"] == "other_person":
            points = other.positions_at(times + self.offset(scene))
        else:
            # The 1-Hz authoring grid starts at zero; dense samples start at 0.05s.
            points = wearer.positions_at(times, allow_boundary_sample=True)
        return polygon_membership(points, self.regions(scene))
