"""World-XY geometry and trajectory measurements used for QA authoring."""

import numpy as np


def normalize(vector):
    vector = np.asarray(vector, dtype=float)
    length = np.linalg.norm(vector)
    if length < 1e-12:
        raise ValueError("Cannot normalize a zero direction")
    return vector / length


def rotate_clockwise(vector, degrees):
    angle = np.radians(-float(degrees))
    rotation = np.array([[np.cos(angle), -np.sin(angle)],
                         [np.sin(angle), np.cos(angle)]])
    return rotation @ np.asarray(vector, dtype=float)


def hypothetical_forward(orientation, wearer, wearer_forward, other):
    if orientation == "towards_wearer":
        return normalize(wearer - other)
    angle = {"same_direction": 0, "clockwise_90": 90,
             "counterclockwise_90": -90}[orientation]
    return normalize(rotate_clockwise(wearer_forward, angle))


def quadrant(origin, forward, target):
    vector = np.asarray(target) - np.asarray(origin)
    if np.linalg.norm(vector) < 1e-12:
        raise ValueError("Target and reference origin coincide")
    front = float(np.asarray(forward) @ vector) > 0
    left = float(forward[0] * vector[1] - forward[1] * vector[0]) > 0
    return ("front" if front else "back") + "-" + ("left" if left else "right")


def point_segment_distance(point, start, end):
    point, start, end = (np.asarray(v, dtype=float) for v in (point, start, end))
    segment = end - start
    scale = float(segment @ segment)
    if scale < 1e-12:
        return float(np.linalg.norm(point - start))
    fraction = np.clip(float((point - start) @ segment) / scale, 0.0, 1.0)
    return float(np.linalg.norm(point - start - fraction * segment))


def polygon_membership(points, polygons):
    """Ray-crossing membership, including polygon boundaries."""
    points = np.asarray(points, dtype=float)
    found = [None] * len(points)
    x, y = points[:, 0], points[:, 1]
    for name, vertices in polygons.items():
        inside = np.zeros(len(points), dtype=bool)
        boundary = np.zeros(len(points), dtype=bool)
        for a, b in zip(vertices, vertices[1:] + vertices[:1]):
            x0, y0 = a
            x1, y1 = b
            crosses = (y0 > y) != (y1 > y)
            if y1 != y0:
                inside ^= crosses & (x < (x1 - x0) * (y - y0) / (y1 - y0) + x0)
            dx, dy = x1 - x0, y1 - y0
            fraction = np.clip(((x - x0) * dx + (y - y0) * dy) / max(dx * dx + dy * dy, 1e-12), 0, 1)
            boundary |= np.hypot(x - x0 - fraction * dx, y - y0 - fraction * dy) <= 1e-12
        for index in np.flatnonzero(inside | boundary):
            if found[index] is not None:
                raise ValueError("Overlapping region polygons")
            found[index] = name
    return found


def stable_visits(memberships, minimum_dwell):
    """Count 1-Hz samples; unassigned samples do not split equal-region runs."""
    runs = []
    for index, region in enumerate(memberships):
        if region is None:
            continue
        if runs and runs[-1][0] == region:
            runs[-1][2] = index
        else:
            runs.append([region, index, index])
    sequence = []
    for region, first, last in runs:
        if last - first + 1 >= minimum_dwell and (not sequence or sequence[-1] != region):
            sequence.append(region)
    return sequence


def simplify_path(points, epsilon=0.5):
    """Ramer-Douglas-Peucker with distance to the finite segment."""
    points = np.asarray(points, dtype=float)
    if len(points) < 3:
        return points
    keep = np.zeros(len(points), dtype=bool)
    keep[0] = keep[-1] = True
    pending = [(0, len(points) - 1)]
    while pending:
        first, last = pending.pop()
        if last <= first + 1:
            continue
        start, end = points[first], points[last]
        segment = end - start
        length = np.linalg.norm(segment)
        middle = points[first + 1:last]
        if length < 1e-9:
            distances = np.linalg.norm(middle - start, axis=1)
        else:
            direction = segment / length
            relative = middle - start
            projection = np.clip(relative @ direction, 0, length)
            distances = np.linalg.norm(relative - projection[:, None] * direction[None, :], axis=1)
        farthest = int(np.argmax(distances))
        if distances[farthest] > epsilon:
            split = first + 1 + farthest
            keep[split] = True
            pending.extend([(first, split), (split, last)])
    return points[keep]


def path_length(points):
    """20-Hz positions, 0.75-second valid moving average, 0.5-meter RDP."""
    points = np.asarray(points, dtype=float)
    if len(points) < 3:
        return 0.0
    window = 15
    if len(points) > window:
        kernel = np.ones(window) / window
        points = np.stack([np.convolve(points[:, axis], kernel, "valid")
                           for axis in (0, 1)], axis=1)
    points = simplify_path(points, epsilon=0.5)
    return float(np.sum(np.linalg.norm(np.diff(points, axis=0), axis=1)))
