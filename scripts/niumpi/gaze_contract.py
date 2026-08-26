"""Shared, dimensionally-correct gaze contract for Gate A and Gate B.

The rig gate measures evaluated pupil motion relative to the head.  The render
gate measures root-aligned optical flow inside the rendered pupil bounds.  The
two sources use different coordinate systems, but both reduce to the same
contract: before the first bite, each pupil must travel far enough relative to
its own rendered diameter and must travel toward the approaching food.
"""

from __future__ import annotations

import math
from typing import Any, Iterable


MIN_PUPIL_GAZE_RATIO = 0.06
MIN_GAZE_DIRECTION_COSINE = 0.70


def equivalent_diameter(width: float, height: float) -> float:
    """Return the equal-area scale proxy for a rectangular landmark bbox."""

    if width <= 0 or height <= 0:
        return 0.0
    return math.sqrt(width * height)


def evaluate_pupil_gaze_tracks(
    tracks: dict[str, Iterable[tuple[int, float, float]]],
    diameters_px: dict[str, float],
    *,
    first_bite_frame: int,
    expected_direction: tuple[float, float],
    direction_tracks: dict[str, Iterable[tuple[int, float, float]]] | None = None,
    minimum_ratio: float = MIN_PUPIL_GAZE_RATIO,
    minimum_direction_cosine: float = MIN_GAZE_DIRECTION_COSINE,
) -> dict[str, Any]:
    """Evaluate bilateral pre-bite pupil travel in pixel-equivalent units.

    Track vectors are displacements from the neutral first frame, not
    frame-to-frame velocity.  Filtering to frames before ``first_bite_frame``
    makes post-bite or recovery-only motion fail instead of masquerading as
    food anticipation.
    """

    expected_length = math.hypot(*expected_direction)
    if expected_length <= 1e-9:
        raise AssertionError("expected gaze direction must be non-zero")
    expected = (
        expected_direction[0] / expected_length,
        expected_direction[1] / expected_length,
    )
    reasons: list[str] = []
    per_eye: dict[str, Any] = {}
    for eye in ("pupil.L", "pupil.R"):
        diameter = float(diameters_px.get(eye, 0.0))
        if diameter <= 0:
            reasons.append(f"{eye} rendered diameter is missing or zero")
            per_eye[eye] = {
                "renderedDiameterPx": round(diameter, 4),
                "preBitePeakDisplacementPx": 0.0,
                "displacementPerDiameter": 0.0,
                "directionCosine": -1.0,
                "peakFrame": None,
            }
            continue
        eligible = [
            (int(frame), float(dx), float(dy))
            for frame, dx, dy in tracks.get(eye, ())
            if int(frame) < first_bite_frame
        ]
        peak = max(eligible, key=lambda value: math.hypot(value[1], value[2]), default=None)
        if peak is None:
            displacement = 0.0
            ratio = 0.0
            cosine = -1.0
            frame = None
            vector = (0.0, 0.0)
            direction_vector = vector
        else:
            frame, dx, dy = peak
            vector = (dx, dy)
            displacement = math.hypot(dx, dy)
            ratio = displacement / diameter
            direction_vector = vector
            if direction_tracks is not None:
                authored = {
                    int(point_frame): (float(point_dx), float(point_dy))
                    for point_frame, point_dx, point_dy in direction_tracks.get(eye, ())
                }
                direction_vector = authored.get(frame, (0.0, 0.0))
            direction_length = math.hypot(*direction_vector)
            cosine = (
                (direction_vector[0] * expected[0] + direction_vector[1] * expected[1])
                / direction_length
                if direction_length > 1e-9 else -1.0
            )
        per_eye[eye] = {
            "renderedDiameterPx": round(diameter, 4),
            "preBitePeakDisplacementPx": round(displacement, 4),
            "displacementPerDiameter": round(ratio, 6),
            "directionCosine": round(cosine, 6),
            "peakFrame": frame,
            "vectorPx": [round(vector[0], 4), round(vector[1], 4)],
            "directionVectorPx": [round(direction_vector[0], 4), round(direction_vector[1], 4)],
        }
        if ratio < minimum_ratio:
            reasons.append(
                f"{eye} pre-bite gaze {ratio:.4f} eye diameters < {minimum_ratio:.2f}"
            )
        if cosine < minimum_direction_cosine:
            reasons.append(
                f"{eye} pre-bite direction cosine {cosine:.3f} < {minimum_direction_cosine:.2f}"
            )
    return {
        "unit": "pupil displacement / rendered semantic diameter",
        "firstBiteFrameExclusive": int(first_bite_frame),
        "expectedDirection": [round(expected[0], 6), round(expected[1], 6)],
        "minimumDisplacementPerDiameter": float(minimum_ratio),
        "minimumDirectionCosine": float(minimum_direction_cosine),
        "perEye": per_eye,
        "result": "PASS" if not reasons else "FAIL",
        "reasons": reasons,
    }
