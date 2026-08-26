#!/usr/bin/env python3
"""Verify genuine local Niumpi deformation from Blender source to atlas.

Different filenames and a moving bounding box are not animation proof. This
gate removes the best-fit whole-character affine transform, measures residual
motion in semantic regions, validates Blender rig evidence, and decodes the
actual WebP atlases that production will draw.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from variant_clip_contract import (  # noqa: E402
    ROUTE_FORM_VARIANTS,
    SEMANTIC_REQUIRED_CLIPS,
    required_clips_for_variant,
    semantic_contract,
    semantic_displacement_for_variant,
    validate_semantic_clip_metadata,
    validate_semantic_fingerprints,
)
from gaze_contract import (  # noqa: E402
    MIN_GAZE_DIRECTION_COSINE,
    MIN_PUPIL_GAZE_RATIO,
    equivalent_diameter,
    evaluate_pupil_gaze_tracks,
)


REPO = Path(__file__).resolve().parents[2]
SOURCE_ROOT = REPO / "art/niumpi/rendered-source"
PUBLIC_ROOT = REPO / "public/assets/niumpi/v2"
REPORT_PATH = REPO / "art/niumpi/motion-proof/motion-report.json"
PROOF_ROOT = REPO / "artifacts/niumpi-animation-proof"
LANDMARKS_PATH = REPO / "art/niumpi/variant-landmarks.json"
LEGACY_VARIANT_ALIASES = {"baby": "stage-1"}
CONTACT_SHEETS = ("idle", "blink", "tap_reaction", "happy", "eat", "hatch_complete")
ATLAS_ALPHA_MAE = 0.0
ATLAS_FOREGROUND_RGB_MAE_MAX = 2.5
ATLAS_FOREGROUND_RGB_PSNR_MIN = 38.0

# A technically non-identical sequence can still look frozen once the 512 px
# source is drawn at roughly half size in the game.  These one-shot gates are
# calibrated from the original baby source and scaled by detected character
# height; semantic-region MAE still rejects texture shifts and global nudges.
CINEMATIC_ROOT_DISPLACEMENT = {
    "tap_reaction": 24.0,
    "happy": 28.0,
    "hatch_complete": 18.0,
}
CINEMATIC_LOCAL_DIFFERENCE = {
    "tap_reaction": 3.5,
    "happy": 4.5,
    "eat": 4.0,
    "hatch_complete": 4.5,
}
CINEMATIC_REGION_PEAKS = {
    "tap_reaction": {"body": 4.0, "arm.L": 5.0, "arm.R": 5.0, "leaf": 8.0},
    "happy": {"head": 8.0, "body": 5.0, "arm.L": 5.0, "arm.R": 5.0, "feet": 6.0, "leaf": 10.0},
    # These are photometric MAE probes (0..255), not pixel displacement.
    # Gaze has a separate geometric, eye-size-normalised contract below.
    "eat": {"body": 4.0, "arm.L": 4.0, "arm.R": 4.0, "feet": 4.0},
    "hatch_complete": {"body": 5.0, "arm.L": 5.0, "arm.R": 5.0, "eyes": 5.0, "feet": 5.0, "leaf": 10.0},
}


def arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", default=None)
    parser.add_argument("--all", action="store_true", help="verify all ten landmark variant IDs")
    parser.add_argument("--source", type=Path, default=SOURCE_ROOT)
    parser.add_argument("--public", type=Path, default=PUBLIC_ROOT)
    parser.add_argument("--proof", type=Path, default=PROOF_ROOT)
    parser.add_argument("--report", type=Path, default=REPORT_PATH)
    parser.add_argument(
        "--require-semantic",
        action="store_true",
        help="final gate: require and validate the nine semantic clips in addition to core",
    )
    return parser.parse_args()


def load_landmarks(path: Path = LANDMARKS_PATH) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    variants = payload.get("variants")
    if not isinstance(variants, dict) or not variants:
        raise AssertionError(f"No variants in landmark file: {path}")
    return payload


def landmark_variant_id(variant: str, manifest: dict[str, Any]) -> str:
    """Resolve approved art independently from the atlas directory name."""

    explicit = manifest.get("approvedVariantId") or manifest.get("variantId")
    return str(explicit or LEGACY_VARIANT_ALIASES.get(variant, variant))


def normalized_bbox(region: dict[str, Any]) -> tuple[float, float, float, float]:
    bbox = region["bboxNormalized"]
    x, y = float(bbox["x"]), float(bbox["y"])
    return (x, y, x + float(bbox["width"]), y + float(bbox["height"]))


def union_bounds(*bounds: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    return (
        min(value[0] for value in bounds),
        min(value[1] for value in bounds),
        max(value[2] for value in bounds),
        max(value[3] for value in bounds),
    )


def legacy_side_regions(variant: dict[str, Any]) -> dict[str, tuple[float, float, float, float]]:
    """Derive the legacy baby's side-control probes from semantic geometry.

    Approved stage-1 correctly has no visible arm region.  The established
    baby Blender rig nevertheless animates two side controls and Gate B has
    always required them.  These probes are derived from the detected alpha,
    head and body boxes; there are no canvas-specific coordinates.
    """

    alpha = variant["alpha"]["bboxNormalized"]
    alpha_x0 = float(alpha["x"])
    alpha_y0 = float(alpha["y"])
    alpha_x1 = alpha_x0 + float(alpha["width"])
    alpha_y1 = alpha_y0 + float(alpha["height"])
    head = normalized_bbox(variant["regions"]["head"])
    body = normalized_bbox(variant["regions"]["body"])
    y0 = max(alpha_y0, head[1] + (head[3] - head[1]) * 0.32)
    y1 = min(alpha_y1, body[3])
    left_inner = body[0] + (body[2] - body[0]) * 0.38
    right_inner = body[0] + (body[2] - body[0]) * 0.62
    return {
        "arm.L": (alpha_x0, y0, left_inner, y1),
        "arm.R": (right_inner, y0, alpha_x1, y1),
    }


def regions_for_variant(
    variant: dict[str, Any],
    *,
    preserve_legacy_baby: bool,
    variant_id: str | None = None,
    reference: np.ndarray | None = None,
) -> dict[str, tuple[float, float, float, float]]:
    semantic = variant["regions"]
    regions: dict[str, tuple[float, float, float, float]] = {}
    for name in ("head", "body", "tail", "arm.L", "arm.R"):
        if name in semantic:
            regions[name] = normalized_bbox(semantic[name])
    regions["eyes"] = union_bounds(normalized_bbox(semantic["eye.L"]), normalized_bbox(semantic["eye.R"]))
    regions["pupils"] = union_bounds(normalized_bbox(semantic["pupil.L"]), normalized_bbox(semantic["pupil.R"]))
    regions["mouth"] = normalized_bbox(semantic["mouth"])
    regions["cheeks"] = union_bounds(normalized_bbox(semantic["cheek.L"]), normalized_bbox(semantic["cheek.R"]))
    regions["feet"] = union_bounds(normalized_bbox(semantic["foot.L"]), normalized_bbox(semantic["foot.R"]))
    regions["leaf"] = normalized_bbox(semantic["leaves"])
    alpha = variant["alpha"]["bboxNormalized"]
    alpha_x0, alpha_y0 = float(alpha["x"]), float(alpha["y"])
    alpha_x1 = alpha_x0 + float(alpha["width"])
    alpha_y1 = alpha_y0 + float(alpha["height"])
    # Shadow is a separate render component just below the approved hull. The
    # rig proof must also contain a real shadow channel, so feet alone cannot
    # satisfy the final semantic gate.
    regions["shadow"] = (alpha_x0, max(0.0, alpha_y1 - 0.10), alpha_x1, min(1.0, alpha_y1 + 0.08))
    if variant_id in ROUTE_FORM_VARIANTS:
        # Accessory F-curves are independently mandatory in Gate A. This broad
        # visual probe only confirms that their approved hull actually changes;
        # it cannot by itself promote body motion to accessory motion.
        regions["accessory"] = (alpha_x0, alpha_y0, alpha_x1, alpha_y1)
    if preserve_legacy_baby and "arm.L" not in regions:
        regions.update(legacy_side_regions(variant))
    if reference is not None:
        regions = {
            name: retarget_approved_bounds(reference, variant, bounds)
            for name, bounds in regions.items()
        }
    return regions


def largest_character_bbox(image: np.ndarray, threshold: int = 96) -> tuple[int, int, int, int]:
    """Return the main connected alpha component as x, y, width, height."""

    binary = (image[..., 3] > threshold).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary)
    if count <= 1:
        raise AssertionError("Rendered pose has no opaque character")
    component = max(range(1, count), key=lambda index: int(stats[index, cv2.CC_STAT_AREA]))
    x, y, width, height, _ = stats[component]
    return int(x), int(y), int(width), int(height)


def retarget_approved_bounds(
    reference: np.ndarray,
    variant: dict[str, Any],
    bounds: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    """Map approved-canvas bounds through the approved-to-render alpha hull.

    Landmark boxes are normalised to the source artwork's real canvas, not to
    the 512 px sprite canvas.  Treating those values as render coordinates can
    miss a feature by tens of pixels.  This is the generic form of
    :func:`rendered_semantic_region`; it also handles unions, the legacy baby
    side probes, the shadow band and route accessory bounds.
    """

    rendered_x, rendered_y, rendered_width, rendered_height = largest_character_bbox(reference)
    approved_alpha = variant["alpha"]["bboxPx"]
    alpha_x = float(approved_alpha["x"])
    alpha_y = float(approved_alpha["y"])
    alpha_width = float(approved_alpha["width"])
    alpha_height = float(approved_alpha["height"])
    if alpha_width <= 0 or alpha_height <= 0:
        raise AssertionError("Approved alpha bbox is empty")
    canvas = variant["canvas"]
    canvas_width = float(canvas["width"])
    canvas_height = float(canvas["height"])
    x0, y0, x1, y1 = bounds
    approved_x0, approved_x1 = x0 * canvas_width, x1 * canvas_width
    approved_y0, approved_y1 = y0 * canvas_height, y1 * canvas_height
    scale_x = rendered_width / alpha_width
    scale_y = rendered_height / alpha_height
    image_height, image_width = reference.shape[:2]
    render_x0 = rendered_x + (approved_x0 - alpha_x) * scale_x
    render_x1 = rendered_x + (approved_x1 - alpha_x) * scale_x
    render_y0 = rendered_y + (approved_y0 - alpha_y) * scale_y
    render_y1 = rendered_y + (approved_y1 - alpha_y) * scale_y
    return (
        max(0.0, min(1.0, render_x0 / image_width)),
        max(0.0, min(1.0, render_y0 / image_height)),
        max(0.0, min(1.0, render_x1 / image_width)),
        max(0.0, min(1.0, render_y1 / image_height)),
    )


def rendered_semantic_region(
    reference: np.ndarray,
    variant: dict[str, Any],
    region_name: str,
) -> tuple[tuple[float, float, float, float], float]:
    """Retarget an approved pixel landmark into the actual render placement.

    Approved canvases have different sizes and whitespace, while every sprite
    render is 512x512 and anchored for gameplay.  Raw approved normalised
    coordinates therefore do not address the same pixels in the render.  The
    alpha hull supplies the scale and translation without assuming a canvas or
    crop size.
    """

    bounds = retarget_approved_bounds(
        reference,
        variant,
        normalized_bbox(variant["regions"][region_name]),
    )
    image_height, image_width = reference.shape[:2]
    x0, y0, x1, y1 = bounds
    width = (x1 - x0) * image_width
    height = (y1 - y0) * image_height
    return (
        bounds,
        equivalent_diameter(width, height),
    )


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO))
    except ValueError:
        return str(path)


def rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)


def files_for(directory: Path) -> list[Path]:
    files = sorted(path for path in directory.iterdir() if path.suffix.lower() in {".png", ".webp"})
    if not files:
        raise AssertionError(f"No rendered frames: {directory}")
    return files


def pixel_hash(path: Path) -> str:
    return hashlib.sha256(Image.open(path).convert("RGBA").tobytes()).hexdigest()


def premultiplied_gray(image: np.ndarray) -> np.ndarray:
    alpha = image[..., 3:4].astype(np.float32) / 255.0
    rgb = image[..., :3].astype(np.float32) * alpha
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)


def alpha_centroid(image: np.ndarray) -> tuple[float, float]:
    alpha = image[..., 3].astype(np.float32) / 255.0
    mass = float(alpha.sum())
    if mass < 1:
        return (0.0, 0.0)
    yy, xx = np.indices(alpha.shape)
    return (float((xx * alpha).sum() / mass), float((yy * alpha).sum() / mass))


def character_extent(image: np.ndarray, threshold: int = 96) -> tuple[int, int]:
    binary = (image[..., 3] > threshold).astype(np.uint8)
    count, _, stats, _ = cv2.connectedComponentsWithStats(binary)
    if count <= 1:
        raise AssertionError("Reference pose has no opaque character")
    component = max(range(1, count), key=lambda index: int(stats[index, cv2.CC_STAT_AREA]))
    return (int(stats[component, cv2.CC_STAT_WIDTH]), int(stats[component, cv2.CC_STAT_HEIGHT]))


def _ecc_alignment_matrix(reference: np.ndarray, candidate: np.ndarray) -> np.ndarray:
    """Return the candidate-to-reference affine estimated by ECC."""

    ref_gray = premultiplied_gray(reference)
    candidate_gray = premultiplied_gray(candidate)
    warp = np.eye(2, 3, dtype=np.float32)
    mask = ((reference[..., 3] > 8) | (candidate[..., 3] > 8)).astype(np.uint8) * 255
    try:
        cv2.findTransformECC(
            ref_gray,
            candidate_gray,
            warp,
            cv2.MOTION_AFFINE,
            (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-5),
            inputMask=mask,
            gaussFiltSize=5,
        )
    except cv2.error:
        warp = np.eye(2, 3, dtype=np.float32)
    # findTransformECC returns template-to-input coordinates when callers use
    # WARP_INVERSE_MAP.  Store one unambiguous candidate-to-reference matrix so
    # alternative roll estimators can be compared using the same convention.
    return cv2.invertAffineTransform(warp)


def _warp_to_reference(reference: np.ndarray, candidate: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    height, width = reference.shape[:2]
    return cv2.warpAffine(
        candidate,
        matrix,
        (width, height),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )


def _alignment_score(reference: np.ndarray, aligned: np.ndarray) -> float:
    reference_alpha = reference[..., 3] > 16
    aligned_alpha = aligned[..., 3] > 16
    union = reference_alpha | aligned_alpha
    if not union.any():
        return -1.0
    intersection_over_union = float((reference_alpha & aligned_alpha).sum() / union.sum())
    gray_difference = np.abs(
        premultiplied_gray(reference).astype(np.float32)
        - premultiplied_gray(aligned).astype(np.float32)
    )
    return intersection_over_union - float(gray_difference[union].mean()) / 1020.0


def _principal_component_alignment(reference: np.ndarray, candidate: np.ndarray) -> list[np.ndarray]:
    """Return the two 180-degree-ambiguous silhouette alignments."""

    def component_pose(image: np.ndarray) -> tuple[np.ndarray, float, int]:
        binary = (image[..., 3] > 96).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(binary)
        if count <= 1:
            raise AssertionError("Rendered pose has no opaque character")
        component = max(range(1, count), key=lambda index: int(stats[index, cv2.CC_STAT_AREA]))
        yy, xx = np.nonzero(labels == component)
        points = np.column_stack((xx, yy)).astype(np.float64)
        centre = points.mean(axis=0)
        covariance = np.cov((points - centre).T)
        eigenvalues, eigenvectors = np.linalg.eigh(covariance)
        axis = eigenvectors[:, int(np.argmax(eigenvalues))]
        return centre, math.atan2(float(axis[1]), float(axis[0])), len(points)

    reference_centre, reference_angle, reference_area = component_pose(reference)
    candidate_centre, candidate_angle, candidate_area = component_pose(candidate)
    scale = math.sqrt(reference_area / max(1, candidate_area))
    matrices: list[np.ndarray] = []
    for ambiguity in (0.0, math.pi):
        angle = reference_angle - candidate_angle + ambiguity
        cosine, sine = math.cos(angle) * scale, math.sin(angle) * scale
        linear = np.array(((cosine, -sine), (sine, cosine)), dtype=np.float64)
        translation = reference_centre - linear @ candidate_centre
        matrices.append(np.column_stack((linear, translation)).astype(np.float32))
    return matrices


def _feature_alignment(reference: np.ndarray, candidate: np.ndarray) -> list[np.ndarray]:
    """Estimate large rotations from stable rendered features when available."""

    if not hasattr(cv2, "SIFT_create"):
        return []
    detector = cv2.SIFT_create(nfeatures=700, contrastThreshold=0.01)
    reference_gray = premultiplied_gray(reference).astype(np.uint8)
    candidate_gray = premultiplied_gray(candidate).astype(np.uint8)
    reference_points, reference_descriptors = detector.detectAndCompute(
        reference_gray,
        (reference[..., 3] > 8).astype(np.uint8) * 255,
    )
    candidate_points, candidate_descriptors = detector.detectAndCompute(
        candidate_gray,
        (candidate[..., 3] > 8).astype(np.uint8) * 255,
    )
    if reference_descriptors is None or candidate_descriptors is None:
        return []
    pairs = cv2.BFMatcher(cv2.NORM_L2).knnMatch(candidate_descriptors, reference_descriptors, k=2)
    matches = [
        pair[0]
        for pair in pairs
        if len(pair) == 2 and pair[0].distance < 0.78 * pair[1].distance
    ]
    if len(matches) < 4:
        return []
    source = np.float32([candidate_points[match.queryIdx].pt for match in matches])
    target = np.float32([reference_points[match.trainIdx].pt for match in matches])
    matrices: list[np.ndarray] = []
    for estimator in (cv2.estimateAffinePartial2D, cv2.estimateAffine2D):
        matrix, _ = estimator(
            source,
            target,
            method=cv2.RANSAC,
            ransacReprojThreshold=3.0,
            maxIters=2000,
            confidence=0.99,
            refineIters=10,
        )
        if matrix is not None:
            matrices.append(matrix.astype(np.float32))
    return matrices


def root_alignment(
    reference: np.ndarray,
    candidate: np.ndarray,
    *,
    allow_large_rotation: bool = False,
) -> tuple[np.ndarray, np.ndarray]:
    """Return a candidate-to-reference affine and the aligned RGBA image.

    ECC remains the established path for ordinary performances.  A roll can be
    more than 90 degrees away from frame zero, where identity-seeded ECC is not
    a valid optimiser.  For that one choreography we compare it with a
    feature-based and silhouette-principal-axis alignment.  This removes the
    root revolution without treating the whole flat sprite as secondary
    motion.
    """

    matrices = [_ecc_alignment_matrix(reference, candidate)]
    if allow_large_rotation:
        try:
            matrices.extend(_principal_component_alignment(reference, candidate))
        except (AssertionError, ValueError, np.linalg.LinAlgError):
            pass
        matrices.extend(_feature_alignment(reference, candidate))
    candidates: list[tuple[float, np.ndarray, np.ndarray]] = []
    for matrix in matrices:
        linear = matrix[:, :2]
        determinant = float(np.linalg.det(linear))
        singular_values = np.linalg.svd(linear, compute_uv=False)
        if determinant <= 0.15 or determinant > 4.0:
            continue
        if float(singular_values.min()) < 0.40 or float(singular_values.max()) > 2.50:
            continue
        aligned = _warp_to_reference(reference, candidate, matrix)
        candidates.append((_alignment_score(reference, aligned), matrix, aligned))
    if not candidates:
        matrix = np.eye(2, 3, dtype=np.float32)
        return matrix, _warp_to_reference(reference, candidate, matrix)
    _, matrix, aligned = max(candidates, key=lambda item: item[0])
    return matrix, aligned


def align_candidate(
    reference: np.ndarray,
    candidate: np.ndarray,
    *,
    allow_large_rotation: bool = False,
) -> np.ndarray:
    """Remove one best-fit whole-character affine from a candidate frame."""

    return root_alignment(reference, candidate, allow_large_rotation=allow_large_rotation)[1]


def aligned_difference(
    reference: np.ndarray,
    candidate: np.ndarray,
    *,
    allow_large_rotation: bool = False,
) -> tuple[float, float, np.ndarray, np.ndarray]:
    """Return raw/local MAE and pixels after removing one global affine."""

    aligned = align_candidate(reference, candidate, allow_large_rotation=allow_large_rotation)
    foreground = (reference[..., 3] > 8) | (aligned[..., 3] > 8)
    raw = np.abs(candidate.astype(np.int16) - reference.astype(np.int16)).mean(axis=2)
    residual = np.abs(aligned.astype(np.int16) - reference.astype(np.int16)).mean(axis=2)
    raw_mean = float(raw[foreground].mean()) if foreground.any() else 0.0
    residual_mean = float(residual[foreground].mean()) if foreground.any() else 0.0
    return raw_mean, residual_mean, residual, aligned


def central_alpha_tear(
    reference: np.ndarray,
    aligned: np.ndarray,
    semantic_regions: dict[str, tuple[float, float, float, float]] | None = None,
) -> dict[str, float | int]:
    """Measure long transparent cuts through an otherwise opaque character.

    A moving silhouette legitimately exposes pixels near its outside edge. A
    layer-compositing failure is different: after root alignment it removes a
    long, nearly horizontal run from pixels that were opaque inside the
    approved reference pose. This caught the head/body seam that was invisible
    on white but obvious on the game's dark background.
    """

    def character_component(image: np.ndarray, threshold: int) -> np.ndarray:
        """Return the main character alpha component, excluding its shadow.

        The shadow is intentionally a separate rootless ellipse.  During a hop
        the transparent gap between it and Niumpi is not a compositing tear and
        must never participate in the internal-silhouette scan.
        """

        binary = (image[..., 3] >= threshold).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(binary)
        if count <= 1:
            return binary.astype(bool)
        component = max(range(1, count), key=lambda index: int(stats[index, cv2.CC_STAT_AREA]))
        return labels == component

    ref = character_component(reference, 128)
    current_opaque = character_component(aligned, 13)
    height, width = ref.shape
    component_y, component_x = np.nonzero(ref)
    if not len(component_y):
        return {
            "maxRunRatio": 0.0,
            "maxRunPx": 0,
            "row": -1,
            "scanY0": 0,
            "scanY1": 0,
        }
    component_x0, component_x1 = int(component_x.min()), int(component_x.max()) + 1
    component_y0, component_y1 = int(component_y.min()), int(component_y.max()) + 1
    component_height = component_y1 - component_y0
    component_width = component_x1 - component_x0

    # The scan is anchored to the semantic head/body rather than to a fixed
    # percentage of the render canvas. This matters for variants such as
    # Mistwander: its water tail and feet extend the alpha hull far below the
    # torso, and an airborne pose exposes a perfectly legal transparent gap at
    # y~=0.79. The known internal head/body seam at y~=0.56 remains inside the
    # upper-body band for every approved variant.
    head = semantic_regions.get("head") if semantic_regions else None
    body = semantic_regions.get("body") if semantic_regions else None
    feet = semantic_regions.get("feet") if semantic_regions else None
    tail = semantic_regions.get("tail") if semantic_regions else None
    if head and body:
        scan_y0 = int(round((head[1] + (head[3] - head[1]) * 0.28) * height))
        scan_y1 = int(round((body[1] + (body[3] - body[1]) * 0.60) * height))
        scan_x0 = int(round(min(head[0], body[0]) * width))
        scan_x1 = int(round(max(head[2], body[2]) * width))
        if tail:
            # Stop immediately after the semantic tail root. A water tail can
            # separate from the lower torso throughout an airborne action;
            # only the narrow root overlap is a meaningful compositing probe.
            # The authored internal seam at y~=0.56 is above this boundary.
            scan_y1 = min(
                scan_y1,
                int(round((tail[1] + (body[3] - body[1]) * 0.08) * height)),
            )
        if feet:
            scan_y1 = min(scan_y1, int(round((feet[1] - 0.015) * height)))
    else:
        # Synthetic/legacy fallback is still character-relative, never
        # canvas-relative. It covers the central torso while excluding lower
        # appendages and a rootless ground shadow.
        scan_y0 = component_y0 + int(round(component_height * 0.36))
        scan_y1 = component_y0 + int(round(component_height * 0.72))
        scan_x0 = component_x0 + int(round(component_width * 0.04))
        scan_x1 = component_x1 - int(round(component_width * 0.04))
    scan_y0 = max(component_y0, min(scan_y0, component_y1))
    scan_y1 = max(scan_y0, min(scan_y1, component_y1))
    scan_x0 = max(component_x0, min(scan_x0, component_x1))
    scan_x1 = max(scan_x0, min(scan_x1, component_x1))
    central = np.zeros_like(ref)
    central[scan_y0:scan_y1, scan_x0:scan_x1] = True

    # Only a transparent component fully enclosed by the current character is
    # a compositing tear.  Rolls, water tails and bent limbs create deep legal
    # concavities between the silhouette's left/right extremes; those pixels
    # remain connected to the exterior background and must not be counted.
    transparent = ~current_opaque
    padded = np.pad(transparent.astype(np.uint8), 1, constant_values=1)
    _, exterior_labels = cv2.connectedComponents(padded, connectivity=8)
    exterior_label = int(exterior_labels[0, 0])
    exterior = exterior_labels[1:-1, 1:-1] == exterior_label
    enclosed_transparent = transparent & ~exterior
    max_ratio = 0.0
    max_run = 0
    row_index = -1
    for y in range(scan_y0, scan_y1):
        opaque_count = int((ref[y] & central[y]).sum())
        if opaque_count < max(40, int(width * 0.10)):
            continue
        row = (ref[y] & enclosed_transparent[y] & central[y]).astype(np.int16)
        padded = np.pad(row, (1, 1))
        transitions = np.diff(padded)
        starts = np.flatnonzero(transitions == 1)
        ends = np.flatnonzero(transitions == -1)
        longest = int((ends - starts).max()) if len(starts) and len(starts) == len(ends) else 0
        ratio = longest / opaque_count
        if ratio > max_ratio:
            max_ratio = ratio
            max_run = longest
            row_index = y
    return {
        "maxRunRatio": round(max_ratio, 4),
        "maxRunPx": max_run,
        "row": row_index,
        "scanY0": scan_y0,
        "scanY1": scan_y1,
    }


def transparent_canvas_margin(
    images: list[np.ndarray],
    *,
    minimum_px: int = 8,
    alpha_threshold: int = 8,
) -> dict[str, Any]:
    """Validate the transparent safety border on every authored source frame."""

    if minimum_px < 0:
        raise AssertionError("minimum transparent canvas margin must be non-negative")
    worst_margin = math.inf
    worst_frame = -1
    worst_sides = {"left": 0, "top": 0, "right": 0, "bottom": 0}
    violations: list[dict[str, Any]] = []
    for index, image in enumerate(images):
        yy, xx = np.nonzero(image[..., 3] > alpha_threshold)
        if not len(xx):
            margins = {
                "left": image.shape[1],
                "top": image.shape[0],
                "right": image.shape[1],
                "bottom": image.shape[0],
            }
        else:
            margins = {
                "left": int(xx.min()),
                "top": int(yy.min()),
                "right": int(image.shape[1] - 1 - xx.max()),
                "bottom": int(image.shape[0] - 1 - yy.max()),
            }
        frame_margin = min(margins.values())
        if frame_margin < minimum_px:
            violations.append(
                {
                    "frame": index,
                    "minimumMarginPx": int(frame_margin),
                    "sideMarginsPx": margins,
                }
            )
        if frame_margin < worst_margin:
            worst_margin = frame_margin
            worst_frame = index
            worst_sides = margins
    if math.isinf(worst_margin):
        worst_margin = 0
    return {
        "minimumRequiredPx": minimum_px,
        "minimumMarginPx": int(worst_margin),
        "worstFrame": worst_frame,
        "sideMarginsPx": worst_sides,
        "violationFrames": [int(item["frame"]) for item in violations],
        "violations": violations,
        "result": "PASS" if worst_margin >= minimum_px else "FAIL",
    }


def crop_mean(values: np.ndarray, bounds: tuple[float, float, float, float]) -> float:
    height, width = values.shape[:2]
    x0, y0, x1, y1 = bounds
    crop = values[int(y0 * height): max(int(y0 * height) + 1, int(y1 * height)), int(x0 * width): max(int(x0 * width) + 1, int(x1 * width))]
    return float(crop.mean()) if crop.size else 0.0


def crop_values(values: np.ndarray, bounds: tuple[float, float, float, float]) -> np.ndarray:
    height, width = values.shape[:2]
    x0, y0, x1, y1 = bounds
    return values[
        int(y0 * height): max(int(y0 * height) + 1, int(y1 * height)),
        int(x0 * width): max(int(x0 * width) + 1, int(x1 * width)),
    ]


def local_flow(reference: np.ndarray, aligned: np.ndarray) -> np.ndarray:
    """Dense root-aligned optical displacement for coloured/internal parts."""

    return np.linalg.norm(local_flow_vectors(reference, aligned), axis=2)


def local_flow_vectors(reference: np.ndarray, aligned: np.ndarray) -> np.ndarray:
    """Dense root-aligned optical-flow vectors in rendered pixel units."""

    ref = premultiplied_gray(reference).astype(np.uint8)
    current = premultiplied_gray(aligned).astype(np.uint8)
    return cv2.calcOpticalFlowFarneback(ref, current, None, 0.5, 3, 19, 3, 5, 1.2, 0)


def eat_pupil_gaze_evidence(
    images: list[np.ndarray],
    variant: dict[str, Any],
    clip: dict[str, Any],
) -> dict[str, Any]:
    """Measure visible bilateral food anticipation before the first bite.

    The runtime food approaches from screen-right and slightly below the
    neutral gaze.  Each track is measured against frame zero after removing a
    whole-character affine transform.  A high-percentile flow magnitude keeps
    anti-aliased pupil motion visible, while the median vector of those moving
    pixels supplies a stable direction rather than an intensity-only score.
    """

    bite_frames = sorted(
        int(event["frame"])
        for event in clip.get("events", [])
        if event.get("type") == "bite" and isinstance(event.get("frame"), (int, float))
    )
    if not bite_frames:
        return {
            "unit": "pupil optical-flow displacement / rendered semantic diameter",
            "result": "FAIL",
            "reasons": ["eat clip has no bite event for pre-bite gaze validation"],
            "perEye": {},
        }
    first_bite = bite_frames[0]
    reference = images[0]
    bounds: dict[str, tuple[float, float, float, float]] = {}
    diameters: dict[str, float] = {}
    bounds_px: dict[str, list[float]] = {}
    image_height, image_width = reference.shape[:2]
    for eye in ("pupil.L", "pupil.R"):
        bounds[eye], diameters[eye] = rendered_semantic_region(reference, variant, eye)
        x0, y0, x1, y1 = bounds[eye]
        bounds_px[eye] = [
            round(x0 * image_width, 3),
            round(y0 * image_height, 3),
            round((x1 - x0) * image_width, 3),
            round((y1 - y0) * image_height, 3),
        ]
    tracks: dict[str, list[tuple[int, float, float]]] = {"pupil.L": [], "pupil.R": []}
    for index in range(1, min(first_bite, len(images))):
        aligned = align_candidate(reference, images[index])
        flow = local_flow_vectors(reference, aligned)
        for eye in tracks:
            values = crop_values(flow, bounds[eye])
            if not values.size:
                tracks[eye].append((index, 0.0, 0.0))
                continue
            magnitudes = np.linalg.norm(values, axis=2)
            displacement = float(np.percentile(magnitudes, 90))
            moving = values[magnitudes >= np.percentile(magnitudes, 80)]
            direction = np.median(moving, axis=0) if moving.size else np.zeros(2, dtype=np.float32)
            direction_length = float(np.linalg.norm(direction))
            if direction_length > 1e-9:
                dx = float(direction[0]) / direction_length * displacement
                dy = float(direction[1]) / direction_length * displacement
            else:
                dx = dy = 0.0
            tracks[eye].append((index, dx, dy))
    evidence = evaluate_pupil_gaze_tracks(
        tracks,
        diameters,
        first_bite_frame=first_bite,
        # Canvas x grows rightward and y downward. The separately-rendered
        # food prop approaches from the right with a shallow downward drift.
        expected_direction=(1.0, 0.22),
    )
    evidence["unit"] = "pupil optical-flow displacement / rendered semantic diameter"
    for eye, pixels in bounds_px.items():
        evidence["perEye"].setdefault(eye, {})["renderedBoundsPx"] = pixels
    return evidence


def _expanded_bounds(
    bounds: tuple[float, float, float, float],
    fraction: float = 0.16,
) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = bounds
    width, height = x1 - x0, y1 - y0
    return (
        max(0.0, x0 - width * fraction),
        max(0.0, y0 - height * fraction),
        min(1.0, x1 + width * fraction),
        min(1.0, y1 + height * fraction),
    )


def _weighted_alpha_centroid(
    image: np.ndarray,
    bounds: tuple[float, float, float, float],
) -> tuple[float, float] | None:
    height, width = image.shape[:2]
    x0, y0, x1, y1 = _expanded_bounds(bounds)
    px0, px1 = int(x0 * width), max(int(x0 * width) + 1, int(math.ceil(x1 * width)))
    py0, py1 = int(y0 * height), max(int(y0 * height) + 1, int(math.ceil(y1 * height)))
    alpha = image[py0:py1, px0:px1, 3].astype(np.float64) / 255.0
    mass = float(alpha.sum())
    if mass < 1.0:
        return None
    yy, xx = np.indices(alpha.shape)
    return (
        float((xx * alpha).sum() / mass + px0),
        float((yy * alpha).sum() / mass + py0),
    )


def _centroid_equivalent_flow(
    reference: np.ndarray,
    aligned: np.ndarray,
    bounds: tuple[float, float, float, float],
    *,
    vectors: np.ndarray | None = None,
    weights: np.ndarray | None = None,
) -> float:
    """Estimate an internal feature centroid shift from its local flow vectors.

    Pupils, mouths and cheeks live inside a continuously opaque head, so an
    alpha centroid is meaningless for them.  A gradient-weighted vector mean
    estimates the translation of the region's visible feature centroid.  It is
    intentionally not a percentile of per-pixel magnitudes: opposing motion
    cannot inflate the result.
    """

    if vectors is None:
        vectors = local_flow_vectors(reference, aligned)
    if weights is None:
        gray = premultiplied_gray(reference).astype(np.float32)
        gradient_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gradient_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        weights = np.minimum(np.hypot(gradient_x, gradient_y) / 32.0, 4.0) + 0.10
        weights *= ((reference[..., 3] > 8) | (aligned[..., 3] > 8)).astype(np.float32)
    values = crop_values(vectors, bounds)
    local_weights = crop_values(weights, bounds)
    total = float(local_weights.sum())
    if not values.size or total <= 1e-6:
        return 0.0
    vector = (values * local_weights[..., None]).sum(axis=(0, 1)) / total
    return float(np.linalg.norm(vector))


def _rendered_landmark_point(
    reference: np.ndarray,
    variant: dict[str, Any],
    approved_point: dict[str, float],
) -> np.ndarray:
    rendered_x, rendered_y, rendered_width, rendered_height = largest_character_bbox(reference)
    approved_alpha = variant["alpha"]["bboxPx"]
    return np.array(
        (
            rendered_x
            + (float(approved_point["x"]) - float(approved_alpha["x"]))
            * rendered_width / float(approved_alpha["width"]),
            rendered_y
            + (float(approved_point["y"]) - float(approved_alpha["y"]))
            * rendered_height / float(approved_alpha["height"]),
        ),
        dtype=np.float64,
    )


def _projected_leaf_tips(
    image: np.ndarray,
    bounds: tuple[float, float, float, float],
    root: np.ndarray,
    directions: list[np.ndarray],
) -> list[np.ndarray] | None:
    """Locate topology-declared tips as directional alpha-hull extrema."""

    height, width = image.shape[:2]
    x0, y0, x1, y1 = _expanded_bounds(bounds, 0.20)
    search = np.zeros((height, width), dtype=bool)
    search[int(y0 * height): int(math.ceil(y1 * height)), int(x0 * width): int(math.ceil(x1 * width))] = True
    yy, xx = np.nonzero((image[..., 3] > 32) & search)
    if not len(xx):
        return None
    points = np.column_stack((xx, yy)).astype(np.float64)
    result: list[np.ndarray] = []
    for direction in directions:
        projections = (points - root) @ direction
        # Averaging the outer 0.5% is stable across anti-aliasing while still
        # following the authored tip rather than the broad leaf centroid.
        cutoff = float(np.percentile(projections, 99.5))
        result.append(points[projections >= cutoff].mean(axis=0))
    return result


def _semantic_member_bounds(
    reference: np.ndarray,
    variant: dict[str, Any] | None,
    regions: dict[str, tuple[float, float, float, float]],
) -> dict[str, list[tuple[float, float, float, float]]]:
    members = {name: [bounds] for name, bounds in regions.items()}
    if variant is None:
        return members
    semantic = variant["regions"]
    groups = {
        "eyes": ("eye.L", "eye.R"),
        "pupils": ("pupil.L", "pupil.R"),
        "cheeks": ("cheek.L", "cheek.R"),
        "feet": ("foot.L", "foot.R"),
    }
    for name, sources in groups.items():
        if name in members and all(source in semantic for source in sources):
            members[name] = [rendered_semantic_region(reference, variant, source)[0] for source in sources]
    return members


def semantic_motion_trajectory(
    images: list[np.ndarray],
    regions: dict[str, tuple[float, float, float, float]],
    character_height: float,
    window: tuple[int, int] | None = None,
    *,
    landmark_variant: dict[str, Any] | None = None,
    allow_large_rotation: bool = False,
) -> dict[str, Any]:
    """Create a root-affine, semantic-centroid motion fingerprint."""

    start, stop = window or (0, len(images))
    start = max(0, min(start, len(images) - 1))
    stop = max(start + 1, min(stop, len(images)))
    reference = images[start]
    sample_indices = sorted(set(np.linspace(start, stop - 1, min(12, stop - start), dtype=int).tolist()))
    reference_centroid = alpha_centroid(reference)
    member_bounds = _semantic_member_bounds(reference, landmark_variant, regions)
    alpha_centroid_regions = {
        "head", "body", "tail", "arm.L", "arm.R", "feet", "shadow", "accessory"
    }
    reference_members: dict[str, list[tuple[float, float] | None]] = {
        name: [_weighted_alpha_centroid(reference, bounds) for bounds in bounds_list]
        for name, bounds_list in member_bounds.items()
    }

    leaf_reference_tips: list[np.ndarray] | None = None
    leaf_root: np.ndarray | None = None
    leaf_directions: list[np.ndarray] = []
    if landmark_variant and "leaf" in regions and landmark_variant.get("leafTips"):
        leaf_root = _rendered_landmark_point(
            reference,
            landmark_variant,
            landmark_variant["landmarks"]["leafRoot"]["px"],
        )
        approved_tips = [
            _rendered_landmark_point(reference, landmark_variant, item["px"])
            for item in landmark_variant["leafTips"]
        ]
        for tip in approved_tips:
            direction = tip - leaf_root
            length = float(np.linalg.norm(direction))
            if length > 1e-6:
                leaf_directions.append(direction / length)
        leaf_reference_tips = _projected_leaf_tips(
            reference,
            regions["leaf"],
            leaf_root,
            leaf_directions,
        ) if leaf_directions else None

    root_values: list[float] = []
    regional_values: dict[str, list[float]] = {name: [] for name in regions}
    payload: list[dict[str, Any]] = []
    for index in sample_indices:
        candidate = images[index]
        aligned = align_candidate(
            reference,
            candidate,
            allow_large_rotation=allow_large_rotation,
        )
        flow_vectors: np.ndarray | None = None
        flow_weights: np.ndarray | None = None
        root = math.dist(reference_centroid, alpha_centroid(candidate)) / max(1.0, character_height)
        row: dict[str, float] = {}
        for name, bounds_list in member_bounds.items():
            amounts: list[float] = []
            if name == "leaf" and leaf_reference_tips is not None and leaf_root is not None:
                tips = _projected_leaf_tips(aligned, regions["leaf"], leaf_root, leaf_directions)
                if tips is not None:
                    amounts = [
                        float(np.linalg.norm(current - neutral)) / max(1.0, character_height)
                        for current, neutral in zip(tips, leaf_reference_tips)
                    ]
            elif name in alpha_centroid_regions:
                for bounds, neutral in zip(bounds_list, reference_members[name]):
                    current = _weighted_alpha_centroid(aligned, bounds)
                    amounts.append(
                        math.dist(neutral, current) / max(1.0, character_height)
                        if neutral is not None and current is not None else 0.0
                    )
            else:
                if flow_vectors is None:
                    flow_vectors = local_flow_vectors(reference, aligned)
                    gray = premultiplied_gray(reference).astype(np.float32)
                    gradient_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
                    gradient_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
                    flow_weights = np.minimum(np.hypot(gradient_x, gradient_y) / 32.0, 4.0) + 0.10
                    flow_weights *= (
                        (reference[..., 3] > 8) | (aligned[..., 3] > 8)
                    ).astype(np.float32)
                amounts = [
                    _centroid_equivalent_flow(
                        reference,
                        aligned,
                        bounds,
                        vectors=flow_vectors,
                        weights=flow_weights,
                    ) / max(1.0, character_height)
                    for bounds in bounds_list
                ]
            # Bilateral requirements describe both visible features.  Taking
            # the weaker member prevents opposite feet/pupils from cancelling,
            # while also preventing one animated side from standing in for two.
            amount = min(amounts) if amounts else 0.0
            regional_values[name].append(amount)
            row[name] = round(amount, 5)
        root_values.append(root)
        payload.append({"root": round(root, 5), "regions": row})
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()
    meaningful_floor = 0.5 / max(1.0, character_height)
    return {
        "fingerprint": fingerprint,
        "sampleFrames": sample_indices,
        "root": max(root_values, default=0.0),
        "rootSamples": root_values,
        "regions": {name: max(values, default=0.0) for name, values in regional_values.items()},
        "regionSamples": regional_values,
        "regionalMotionSampleCounts": {
            name: sum(value >= meaningful_floor for value in values)
            for name, values in regional_values.items()
        },
        "meaningfulMotionFloorNormalized": meaningful_floor,
        "energy": max((value for values in regional_values.values() for value in values), default=0.0),
    }


def semantic_phase_evidence(
    name: str,
    images: list[np.ndarray],
    regions: dict[str, tuple[float, float, float, float]],
    character_height: float,
    landmark_variant: dict[str, Any] | None = None,
) -> dict[str, float | int]:
    if name == "travel":
        reference = images[0]

        # The baby is a single continuous cloud without articulated arms.
        # Its contact pulses are intentionally small local squash beats on top
        # of a much larger root hop.  A ten-pixel-style evolved-form threshold
        # would only pass after visibly damaging that continuous silhouette.
        topology = (landmark_variant or {}).get("topology", {})
        pulse_floor = 0.010 if topology.get("armsPresent") is False else 0.020

        def body_flow(frame: int) -> float:
            aligned = align_candidate(reference, images[frame])
            values = crop_values(local_flow(reference, aligned), regions["body"])
            return float(np.percentile(values, 90)) / max(1.0, character_height)

        baseline = alpha_centroid(reference)
        apex = max(
            (abs(alpha_centroid(images[index])[1] - baseline[1]) / max(1.0, character_height)
             for index in range(44, 56)),
            default=0.0,
        )
        pulse_count = sum(body_flow(frame) >= pulse_floor for frame in (20, 32))
        return {
            "prepare": body_flow(7),
            "pulseCount": pulse_count,
            "apex": apex,
            "land": body_flow(56),
        }
    if name == "roll":
        states = set()
        for index in (8, 20, 32, 43):
            alpha = largest_component(images[index])[..., 3]
            normalised = cv2.resize(alpha, (96, 96), interpolation=cv2.INTER_AREA)
            states.add(hashlib.sha256((normalised > 48).tobytes()).hexdigest())
        action = semantic_motion_trajectory(
            images,
            regions,
            character_height,
            (8, 44),
            landmark_variant=landmark_variant,
            allow_large_rotation=True,
        )
        # A half-pixel floor is sufficient for the general three-sample noise
        # gate, but not for proving secondary roll acting.  Require a visible
        # fifth of each unchanged contract displacement here; otherwise
        # interpolation residue from removing a 360-degree root spin can count
        # as choreography.
        topology = (landmark_variant or {}).get("topology", {})
        arms_present = topology.get("armsPresent") is not False
        roll_variant = "baby" if not arms_present else "stage-5"
        roll_displacement = semantic_displacement_for_variant(
            "roll", roll_variant, arms_present
        )
        floors = {
            region: float(roll_displacement[region]) * 0.20
            for region in ("body", "feet", "leaf")
        }
        secondary_samples = 0
        for sample_index in range(len(action["sampleFrames"])):
            moving = sum(
                float(action["regionSamples"].get(region, [0.0] * len(action["sampleFrames"]))[sample_index])
                >= floors[region]
                for region in ("body", "feet", "leaf")
            )
            if moving >= 2:
                secondary_samples += 1
        return {
            "silhouetteStates": len(states),
            "secondaryMotionSamples": secondary_samples,
        }
    return {}


def _semantic_region_value(regions: dict[str, float], key: str) -> float | None:
    if key == "arms":
        values = [regions.get("arm.L"), regions.get("arm.R")]
        return min(value for value in values if value is not None) if all(value is not None for value in values) else None
    if key == "oneArm":
        values = [value for name in ("arm.L", "arm.R") if (value := regions.get(name)) is not None]
        return max(values) if values else None
    return regions.get(key)


def _semantic_region_sample_count(
    counts: dict[str, int],
    displacements: dict[str, float],
    key: str,
) -> int | None:
    if key == "arms":
        values = [counts.get("arm.L"), counts.get("arm.R")]
        return min(int(value) for value in values if value is not None) if all(value is not None for value in values) else None
    if key == "oneArm":
        candidates = [name for name in ("arm.L", "arm.R") if name in counts]
        if not candidates:
            return None
        winner = max(candidates, key=lambda name: float(displacements.get(name, 0.0)))
        return int(counts[winner])
    value = counts.get(key)
    return int(value) if value is not None else None


def validate_semantic_motion_result(
    name: str,
    result: dict[str, Any],
    *,
    variant: str,
    arms_present: bool,
) -> list[str]:
    """Pure final-mode Gate B validation, shared by real and synthetic tests."""

    spec = semantic_contract(name)
    reasons = validate_semantic_clip_metadata(name, result.get("manifestClip", {}))
    if float(result.get("rootAlignedDifference", 0.0)) < 1.35:
        reasons.append(f"root-aligned local difference {result.get('rootAlignedDifference', 0.0):.3f} < 1.35")
    displacement = result.get("regionalDisplacementNormalized", {})
    sample_counts = result.get("regionalMotionSampleCounts", {})
    requirements = semantic_displacement_for_variant(name, variant, arms_present)
    root_required = requirements.pop("root", None)
    root_actual = float(result.get("rootDisplacementNormalized", 0.0))
    if root_required is not None and root_actual < root_required:
        reasons.append(f"root displacement/H {root_actual:.4f} < {root_required:.4f}")
    for region, required in requirements.items():
        actual = _semantic_region_value(displacement, region)
        if actual is None:
            reasons.append(f"required displacement region {region} is missing")
        elif actual < required:
            reasons.append(f"{region} displacement/H {actual:.4f} < {required:.4f}")
        count = _semantic_region_sample_count(sample_counts, displacement, region)
        if count is None:
            reasons.append(f"required motion sample count for {region} is missing")
        elif count < 3:
            reasons.append(f"{region} meaningful motion samples {count} < 3")

    proof = result.get("rigProof", {})
    minimums = spec["minimums"]
    if len(proof.get("animatedControls", [])) < minimums["controls"]:
        reasons.append(f"animated controls {len(proof.get('animatedControls', []))} < {minimums['controls']}")
    if len(proof.get("animatedChannels", [])) < minimums["channels"]:
        reasons.append(f"animated channels {len(proof.get('animatedChannels', []))} < {minimums['channels']}")
    if len(proof.get("regions", [])) < minimums["regions"]:
        reasons.append(f"rig regions {len(proof.get('regions', []))} < {minimums['regions']}")

    closure = float(proof.get("blinkClosure", 0.0))
    if "eyeClosure" in spec and closure < float(spec["eyeClosure"]):
        reasons.append(f"eye closure {closure:.3f} < {spec['eyeClosure']:.2f}")
    if "eyeClosureRange" in spec:
        minimum, maximum = spec["eyeClosureRange"]
        if not minimum <= closure <= maximum:
            reasons.append(f"eye closure {closure:.3f} outside {minimum:.2f}..{maximum:.2f}")

    evidence = result.get("phaseEvidence", {})
    phase_requirements = dict(spec.get("phaseEvidence", {}))
    if variant in {"baby", "stage-1"}:
        phase_requirements.update(spec.get("babyPhaseEvidence", {}))
    for key, required in phase_requirements.items():
        actual = float(evidence.get(key, 0.0))
        if actual < required:
            reasons.append(f"{key} phase evidence {actual:.4f} < {required:.4f}")
    if name == "roll" and int(evidence.get("secondaryMotionSamples", 0)) < 3:
        reasons.append(
            f"roll secondary motion samples {int(evidence.get('secondaryMotionSamples', 0))} < 3"
        )
    if "fingerprintRange" in spec:
        if not result.get("subloopFingerprint"):
            reasons.append("subloop fingerprint is missing")
        subloop_required = float(
            spec.get("babySubloopMotion", spec["subloopMotion"])
            if variant in {"baby", "stage-1"}
            else spec["subloopMotion"]
        )
        if float(result.get("subloopMotionNormalized", 0.0)) < subloop_required:
            reasons.append(
                f"subloop motion/H {float(result.get('subloopMotionNormalized', 0.0)):.4f} "
                f"< {subloop_required:.4f}"
            )
    if not result.get("motionFingerprint"):
        reasons.append("motion fingerprint is missing")
    return reasons


def largest_component(image: np.ndarray) -> np.ndarray:
    binary = (image[..., 3] > 96).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary)
    if count <= 1:
        raise AssertionError("Reference pose has no opaque character")
    component = max(range(1, count), key=lambda index: int(stats[index, cv2.CC_STAT_AREA]))
    x, y, width, height, _ = stats[component]
    padding = 4
    x0, y0 = max(0, x - padding), max(0, y - padding)
    x1, y1 = min(image.shape[1], x + width + padding), min(image.shape[0], y + height + padding)
    crop = image[y0:y1, x0:x1].copy()
    keep = labels[y0:y1, x0:x1] == component
    crop[..., 3] = np.where(keep, crop[..., 3], 0)
    crop[..., :3] = np.where(keep[..., None], crop[..., :3], 0)
    return crop


def visible_edges(image: np.ndarray) -> np.ndarray:
    """Return only edges that can contribute to the visible RGBA character."""

    alpha = image[..., 3].astype(np.float32) / 255.0
    premultiplied = np.clip(image[..., :3].astype(np.float32) * alpha[..., None], 0, 255).astype(np.uint8)
    gray = cv2.cvtColor(premultiplied, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 40, 120) > 0
    visible = cv2.dilate((image[..., 3] > 48).astype(np.uint8), np.ones((3, 3), dtype=np.uint8)) > 0
    return edges & visible


def tolerance_aware_edge_match(
    approved_edges: np.ndarray,
    actual_edges: np.ndarray,
    tolerance_px: int = 2,
) -> dict[str, float | int]:
    """Symmetric edge match tolerant of only local rasterisation shifts.

    A one-pixel Canny IoU is unstable after Lanczos resampling of the layered
    128x mesh. Dilating only the opposite edge map gives each edge a small
    spatial correspondence radius without forgiving absent face/leaf detail
    or invented/distorted edges. Recall catches missing authored detail;
    precision catches extra or displaced geometry.
    """

    if approved_edges.shape != actual_edges.shape:
        raise AssertionError("edge maps must share a canvas")
    if tolerance_px < 0:
        raise AssertionError("edge tolerance must be non-negative")
    approved = approved_edges.astype(bool)
    actual = actual_edges.astype(bool)
    if tolerance_px:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (tolerance_px * 2 + 1, tolerance_px * 2 + 1),
        )
        approved_near = cv2.dilate(approved.astype(np.uint8), kernel) > 0
        actual_near = cv2.dilate(actual.astype(np.uint8), kernel) > 0
    else:
        approved_near = approved
        actual_near = actual
    precision = float((actual & approved_near).sum() / max(1, actual.sum()))
    recall = float((approved & actual_near).sum() / max(1, approved.sum()))
    f1 = 2.0 * precision * recall / max(1e-12, precision + recall)
    raw_union = approved | actual
    raw_iou = float((approved & actual).sum() / max(1, raw_union.sum()))
    return {
        "tolerancePx": tolerance_px,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "rawIoU": raw_iou,
    }


def alpha_boundary_band(image: np.ndarray, radius_px: int = 2) -> np.ndarray:
    """Return a narrow band around the visible alpha silhouette."""

    if radius_px < 1:
        raise AssertionError("alpha boundary radius must be positive")
    mask = (image[..., 3] > 48).astype(np.uint8)
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (radius_px * 2 + 1, radius_px * 2 + 1),
    )
    return (cv2.dilate(mask, kernel) > 0) ^ (cv2.erode(mask, kernel) > 0)


def hybrid_tolerance_aware_edge_match(
    approved_edges: np.ndarray,
    actual_edges: np.ndarray,
    approved_boundary: np.ndarray,
    actual_boundary: np.ndarray,
    *,
    silhouette_tolerance_px: int = 2,
    internal_tolerance_px: int = 3,
) -> dict[str, float | int]:
    """Match silhouette strictly and thin internal detail with one extra pixel.

    Alpha IoU independently guards the authored outline.  Applying a 3 px
    radius globally would needlessly soften that boundary gate, while a 2 px
    Canny radius drops valid iridescent veins/highlights after the layered
    128 px source is resampled.  This split keeps the outline at 2 px and gives
    only non-boundary edges the calibrated 3 px correspondence radius.
    """

    shapes = {
        approved_edges.shape,
        actual_edges.shape,
        approved_boundary.shape,
        actual_boundary.shape,
    }
    if len(shapes) != 1:
        raise AssertionError("edge and boundary maps must share a canvas")
    approved = approved_edges.astype(bool)
    actual = actual_edges.astype(bool)
    approved_boundary = approved_boundary.astype(bool)
    actual_boundary = actual_boundary.astype(bool)

    def dilated(edges: np.ndarray, radius: int) -> np.ndarray:
        if radius <= 0:
            return edges
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
        return cv2.dilate(edges.astype(np.uint8), kernel) > 0

    approved_near_silhouette = dilated(approved, silhouette_tolerance_px)
    actual_near_silhouette = dilated(actual, silhouette_tolerance_px)
    approved_near_internal = dilated(approved, internal_tolerance_px)
    actual_near_internal = dilated(actual, internal_tolerance_px)
    matched_approved = (
        (approved & approved_boundary & actual_near_silhouette)
        | (approved & ~approved_boundary & actual_near_internal)
    )
    matched_actual = (
        (actual & actual_boundary & approved_near_silhouette)
        | (actual & ~actual_boundary & approved_near_internal)
    )
    precision = float(matched_actual.sum() / max(1, actual.sum()))
    recall = float(matched_approved.sum() / max(1, approved.sum()))
    f1 = 2.0 * precision * recall / max(1e-12, precision + recall)
    raw_union = approved | actual
    return {
        "silhouetteTolerancePx": silhouette_tolerance_px,
        "internalTolerancePx": internal_tolerance_px,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "rawIoU": float((approved & actual).sum() / max(1, raw_union.sum())),
    }


def appearance_fidelity(rendered: Path, approved_reference: Path) -> dict[str, Any]:
    approved = cv2.resize(largest_component(rgba(approved_reference)), (384, 512), interpolation=cv2.INTER_LANCZOS4)
    actual = cv2.resize(largest_component(rgba(rendered)), (384, 512), interpolation=cv2.INTER_LANCZOS4)
    approved_mask = approved[..., 3] > 48
    actual_mask = actual[..., 3] > 48
    union = approved_mask | actual_mask
    intersection = approved_mask & actual_mask
    alpha_iou = float(intersection.sum() / max(1, union.sum()))
    approved_rgb = approved[..., :3].astype(np.float32)
    actual_rgb = actual[..., :3].astype(np.float32)
    if intersection.any():
        actual_rgb = np.clip(actual_rgb + (approved_rgb[intersection].mean(axis=0) - actual_rgb[intersection].mean(axis=0)), 0, 255)
    colour_mae = float(np.abs(approved_rgb - actual_rgb)[union].mean()) if union.any() else 255.0
    edge_match = hybrid_tolerance_aware_edge_match(
        visible_edges(approved),
        visible_edges(actual),
        alpha_boundary_band(approved, radius_px=2),
        alpha_boundary_band(actual, radius_px=2),
        silhouette_tolerance_px=2,
        internal_tolerance_px=3,
    )
    edge_precision = float(edge_match["precision"])
    edge_recall = float(edge_match["recall"])
    edge_f1 = float(edge_match["f1"])
    reasons = []
    if alpha_iou < 0.82:
        reasons.append(f"silhouette IoU {alpha_iou:.3f} < 0.82")
    if colour_mae > 22.0:
        reasons.append(f"normalised colour MAE {colour_mae:.2f} > 22")
    if edge_precision < 0.90:
        reasons.append(f"tolerance-aware edge precision {edge_precision:.3f} < 0.90")
    if edge_recall < 0.76:
        reasons.append(f"tolerance-aware edge recall {edge_recall:.3f} < 0.76")
    if edge_f1 < 0.82:
        reasons.append(f"tolerance-aware edge F1 {edge_f1:.3f} < 0.82")
    return {
        "approvedReference": display_path(approved_reference),
        "renderedReferencePose": display_path(rendered),
        "alphaIoU": round(alpha_iou, 4),
        "normalisedColourMAE": round(colour_mae, 3),
        # Keep edgeIoU as a compatibility field, but its value is now the
        # tolerance-aware symmetric score. rawEdgeIoU remains diagnostic.
        "edgeIoU": round(edge_f1, 4),
        "rawEdgeIoU": round(float(edge_match["rawIoU"]), 4),
        "edgePrecision": round(edge_precision, 4),
        "edgeRecall": round(edge_recall, 4),
        # Compatibility field remains the strict silhouette tolerance; the
        # explicit internal field documents the hybrid metric.
        "edgeTolerancePx": int(edge_match["silhouetteTolerancePx"]),
        "edgeSilhouetteTolerancePx": int(edge_match["silhouetteTolerancePx"]),
        "edgeInternalTolerancePx": int(edge_match["internalTolerancePx"]),
        "edgeBoundaryBandPx": 2,
        "result": "PASS" if not reasons else "FAIL",
        "reasons": reasons,
    }


def _numeric_metric(value: Any, *, nullable: bool = False) -> tuple[bool, float | None]:
    if value is None:
        return (nullable, None)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return (False, None)
    number = float(value)
    return (math.isfinite(number), number if math.isfinite(number) else None)


def _quality_metrics_pass(
    foreground_mae: float,
    foreground_psnr: float | None,
    alpha_mae: float,
) -> bool:
    return (
        alpha_mae == ATLAS_ALPHA_MAE
        and foreground_mae <= ATLAS_FOREGROUND_RGB_MAE_MAX
        and (foreground_psnr is None or foreground_psnr >= ATLAS_FOREGROUND_RGB_PSNR_MIN)
    )


def _same_metric(left: Any, right: Any, *, tolerance: float = 1e-6) -> bool:
    left_valid, left_number = _numeric_metric(left, nullable=True)
    right_valid, right_number = _numeric_metric(right, nullable=True)
    if not left_valid or not right_valid:
        return False
    if left_number is None or right_number is None:
        return left_number is None and right_number is None
    return math.isclose(left_number, right_number, rel_tol=0.0, abs_tol=tolerance)


def encoding_proof_failures(
    encoding: Any,
    frame_evidence: list[dict[str, Any]],
    frame_count: int,
) -> list[str]:
    """Independently validate schema-v3 codec-selection and per-frame proof."""

    failures: list[str] = []
    if not isinstance(encoding, dict):
        return ["schema 3 clip encoding proof is missing"]
    if encoding.get("format") != "WebP":
        failures.append("codec format must be WebP")

    thresholds = encoding.get("thresholds")
    expected_thresholds = {
        "foregroundMAEMax": ATLAS_FOREGROUND_RGB_MAE_MAX,
        "foregroundPSNRMin": ATLAS_FOREGROUND_RGB_PSNR_MIN,
        "alphaMAE": ATLAS_ALPHA_MAE,
    }
    if not isinstance(thresholds, dict) or any(
        not _same_metric(thresholds.get(name), expected)
        for name, expected in expected_thresholds.items()
    ):
        failures.append("codec thresholds do not match Gate C")

    selection = encoding.get("selection")
    if not isinstance(selection, dict):
        failures.append("codec selection proof is missing")
        selection = {}
    candidates = selection.get("candidateQualities")
    candidates_valid = (
        isinstance(candidates, list)
        and bool(candidates)
        and all(type(quality) is int and 1 <= quality <= 100 for quality in candidates)
        and candidates == sorted(set(candidates))
        and candidates[-1] == 100
    )
    if not candidates_valid:
        failures.append("codec candidateQualities must be ascending unique and include q100")
        candidates = []

    evaluated = selection.get("evaluatedQualities")
    evaluated_valid = (
        isinstance(evaluated, list)
        and bool(evaluated)
        and all(type(quality) is int for quality in evaluated)
        and bool(candidates)
        and len(evaluated) <= len(candidates)
        and evaluated == candidates[: len(evaluated)]
    )
    if not evaluated_valid:
        failures.append("codec evaluatedQualities must be a non-empty declared prefix")
        evaluated = []

    proofs = selection.get("candidateProofs")
    proofs_valid = (
        isinstance(proofs, list)
        and bool(evaluated)
        and len(proofs) == len(evaluated)
        and all(isinstance(proof, dict) for proof in proofs)
        and [proof.get("quality") for proof in proofs] == evaluated
    )
    if not proofs_valid:
        failures.append("codec candidateProofs must map one-to-one to evaluatedQualities")
        proofs = []

    if proofs:
        for proof in proofs:
            quality = proof["quality"]
            mae_valid, foreground_mae = _numeric_metric(proof.get("foregroundMAE"))
            psnr_valid, foreground_psnr = _numeric_metric(
                proof.get("foregroundPSNR"),
                nullable=True,
            )
            alpha_valid, alpha_mae = _numeric_metric(proof.get("alphaMAE"))
            metrics_valid = (
                mae_valid
                and psnr_valid
                and alpha_valid
                and foreground_mae is not None
                and foreground_mae >= 0
                and alpha_mae is not None
                and alpha_mae >= 0
                and (foreground_psnr is None or foreground_psnr >= 0)
            )
            metric_passes = (
                _quality_metrics_pass(foreground_mae, foreground_psnr, alpha_mae)
                if metrics_valid and foreground_mae is not None and alpha_mae is not None
                else None
            )
            if not metrics_valid:
                failures.append(f"codec q{quality} candidate metrics are invalid")

            declared_pass = proof.get("passes")
            if type(declared_pass) is not bool:
                failures.append(f"codec q{quality} candidate pass flag is invalid")
            elif metric_passes is not None and declared_pass != metric_passes:
                failures.append(f"codec q{quality} pass flag has no matching metric result")

            failing_frames = proof.get("failingFrames")
            valid_failing_frames = (
                isinstance(failing_frames, list)
                and all(type(index) is int and 0 <= index < frame_count for index in failing_frames)
                and failing_frames == sorted(set(failing_frames))
            )
            if not valid_failing_frames:
                failures.append(f"codec q{quality} failingFrames are invalid")
            elif declared_pass is False and not failing_frames:
                failures.append(f"codec q{quality} failure has no failingFrames evidence")
            elif declared_pass is True and failing_frames:
                failures.append(f"codec q{quality} passing proof declares failingFrames")
            if declared_pass is False and metric_passes is True:
                failures.append(f"codec q{quality} failure has no metric threshold violation")

    rgb = encoding.get("rgb")
    alpha = encoding.get("alpha")
    if not isinstance(rgb, dict) or type(rgb.get("lossy")) is not bool:
        failures.append("codec rgb selection is invalid")
        rgb = {}
    if not isinstance(alpha, dict) or alpha.get("lossless") is not True:
        failures.append("codec alpha must be lossless")
        alpha = {}

    lossy = rgb.get("lossy") is True
    expected_predecessor: dict[str, Any] | None = None
    if lossy:
        selected = selection.get("selectedQuality")
        if (
            selection.get("strategy") != "lowest-passing-quality"
            or selection.get("claim") != "first-passing-declared-candidate"
            or type(selected) is not int
            or not evaluated
            or selected != evaluated[-1]
            or rgb.get("quality") != selected
            or not proofs
            or proofs[-1].get("passes") is not True
            or any(proof.get("passes") is not False for proof in proofs[:-1])
        ):
            failures.append("lossy codec is not the first passing declared candidate")
        if len(proofs) > 1:
            expected_predecessor = proofs[-2]
    else:
        if (
            selection.get("strategy") != "lossless-fallback"
            or selection.get("claim") != "declared-candidates-exhausted"
            or selection.get("selectedQuality") is not None
            or rgb.get("quality") is not None
            or not candidates
            or evaluated != candidates
            or not proofs
            or any(proof.get("passes") is not False for proof in proofs)
        ):
            failures.append("lossless codec did not exhaust every declared lossy candidate")
        if proofs:
            expected_predecessor = proofs[-1]

    if selection.get("predecessor") != expected_predecessor:
        failures.append("codec predecessor does not equal the last failing candidate proof")

    frame_gate = encoding.get("frameGate")
    if not isinstance(frame_gate, dict):
        failures.append("codec frameGate proof is missing")
        frame_gate = {}
    if frame_gate.get("foregroundAlpha") != ">0":
        failures.append("codec frameGate foreground contract must be alpha > 0")
    declared_frames = frame_gate.get("frames")
    frames_valid = (
        isinstance(declared_frames, list)
        and len(declared_frames) == frame_count
        and all(isinstance(frame, dict) for frame in declared_frames)
        and [frame.get("index") for frame in declared_frames] == list(range(frame_count))
    )
    if not frames_valid:
        failures.append("codec frameGate must contain every frame in order")
        declared_frames = []
    if frame_gate.get("allFramesPassed") is not True:
        failures.append("codec frameGate allFramesPassed must be true")

    measured_by_index = {evidence["frame"]: evidence for evidence in frame_evidence}
    if len(measured_by_index) != frame_count or sorted(measured_by_index) != list(range(frame_count)):
        failures.append("independent Gate C evidence is incomplete")
    if declared_frames:
        for declared in declared_frames:
            index = declared["index"]
            measured = measured_by_index.get(index)
            mae_valid, foreground_mae = _numeric_metric(declared.get("foregroundMAE"))
            psnr_valid, foreground_psnr = _numeric_metric(
                declared.get("foregroundPSNR"),
                nullable=True,
            )
            alpha_valid, alpha_mae = _numeric_metric(declared.get("alphaMAE"))
            metric_passes = (
                _quality_metrics_pass(foreground_mae, foreground_psnr, alpha_mae)
                if mae_valid and psnr_valid and alpha_valid
                and foreground_mae is not None and alpha_mae is not None
                else False
            )
            if declared.get("passes") is not True or not metric_passes:
                failures.append(f"codec frameGate frame {index} does not pass Gate C thresholds")
            if measured is None:
                continue
            measured_psnr = (
                None if measured["foregroundRGBPSNR"] == "inf"
                else measured["foregroundRGBPSNR"]
            )
            if (
                not _same_metric(declared.get("alphaMAE"), measured["alphaMAE"], tolerance=1e-10)
                or not _same_metric(declared.get("foregroundMAE"), measured["foregroundRGBMAE"])
                or not _same_metric(declared.get("foregroundPSNR"), measured_psnr)
                or declared.get("passes") is not measured.get("passes")
            ):
                failures.append(f"codec frameGate frame {index} metrics disagree with independent Gate C")

    if len(measured_by_index) == frame_count and frame_count:
        actual_mae = max(float(frame["foregroundRGBMAE"]) for frame in frame_evidence)
        finite_psnr = [
            float(frame["foregroundRGBPSNR"])
            for frame in frame_evidence
            if frame["foregroundRGBPSNR"] != "inf"
        ]
        actual_psnr: float | None = min(finite_psnr) if finite_psnr else None
        actual_alpha = max(float(frame["alphaMAE"]) for frame in frame_evidence)
        if (
            not _same_metric(rgb.get("foregroundMAE"), actual_mae)
            or not _same_metric(rgb.get("foregroundPSNR"), actual_psnr)
            or not _same_metric(alpha.get("meanAbsoluteError"), actual_alpha, tolerance=1e-10)
        ):
            failures.append("codec selected summary metrics disagree with independent Gate C")
        if lossy and proofs and (
            not _same_metric(proofs[-1].get("foregroundMAE"), rgb.get("foregroundMAE"))
            or not _same_metric(proofs[-1].get("foregroundPSNR"), rgb.get("foregroundPSNR"))
            or not _same_metric(proofs[-1].get("alphaMAE"), alpha.get("meanAbsoluteError"), tolerance=1e-10)
        ):
            failures.append("selected candidate proof disagrees with codec summary")

    return failures


def atlas_gate(
    clip: dict[str, Any],
    sources: list[Path],
    public_root: Path | None = None,
    *,
    schema_version: int = 2,
    canvas: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Decode atlas samples and compare them with their logical source frames.

    Schema 2 stores a full logical frame in every atlas rectangle. Schema 3
    stores only the alpha-trimmed rectangle, so Gate C must reconstruct the
    transparent logical canvas at ``offsetX``/``offsetY`` before measuring it.
    The schema-2 branch deliberately retains the original resize behaviour.
    """

    if schema_version not in (2, 3):
        raise AssertionError(f"atlas manifest schemaVersion is {schema_version!r}, expected 2 or 3")
    metadata = clip["atlas"]
    pages = metadata.get("pages", [metadata])
    root = public_root or (REPO / "public")
    atlas_paths = [root / page["src"].lstrip("/") for page in pages]
    failures = []
    atlases: list[Image.Image | None] = []
    for page_index, path in enumerate(atlas_paths):
        if not path.is_file():
            failures.append(f"missing atlas page {page_index}: {display_path(path)}")
            atlases.append(None)
            continue
        atlases.append(Image.open(path).convert("RGBA"))
    frames = clip["frames"]
    rects = [
        (
            int(frame.get("page", 0)),
            int(frame["x"]),
            int(frame["y"]),
            int(frame["w"]),
            int(frame["h"]),
        )
        for frame in frames
    ]
    if len(set(rects)) != len(rects):
        failures.append("atlas repeats a source rectangle")
    sample_indices = (
        list(range(len(frames)))
        if schema_version == 3
        else sorted({0, len(frames) // 4, len(frames) // 2, 3 * len(frames) // 4, len(frames) - 1})
    )
    alpha_errors: list[float] = []
    rgb_errors: list[float] = []
    psnr_values: list[float] = []
    frame_evidence: list[dict[str, Any]] = []
    for index in sample_indices:
        page, x, y, width, height = rects[index]
        if page < 0 or page >= len(atlases) or atlases[page] is None:
            failures.append(f"frame {index} references missing atlas page {page}")
            continue
        atlas = atlases[page]
        assert atlas is not None
        if x < 0 or y < 0 or x + width > atlas.width or y + height > atlas.height:
            failures.append(f"frame {index} rectangle falls outside atlas page {page}")
            continue
        packed_crop = atlas.crop((x, y, x + width, y + height))
        source = Image.open(sources[index]).convert("RGBA")
        if schema_version == 3:
            if canvas is None:
                logical_width, logical_height = source.size
            else:
                try:
                    logical_width = int(canvas["width"])
                    logical_height = int(canvas["height"])
                except (KeyError, TypeError, ValueError):
                    failures.append("schema 3 manifest canvas must define integer width and height")
                    continue
            frame = frames[index]
            offset_x = frame.get("offsetX")
            offset_y = frame.get("offsetY")
            if not isinstance(offset_x, int) or not isinstance(offset_y, int):
                failures.append(f"frame {index} schema 3 offsets must be integers")
                continue
            if (
                logical_width <= 0
                or logical_height <= 0
                or offset_x < 0
                or offset_y < 0
                or offset_x + width > logical_width
                or offset_y + height > logical_height
            ):
                failures.append(f"frame {index} rectangle falls outside logical canvas")
                continue
            if source.size != (logical_width, logical_height):
                failures.append(
                    f"frame {index} source canvas {source.width}x{source.height} != "
                    f"manifest canvas {logical_width}x{logical_height}"
                )
                continue
            reconstructed = Image.new("RGBA", (logical_width, logical_height), (0, 0, 0, 0))
            reconstructed.paste(packed_crop, (offset_x, offset_y))
            packed = np.asarray(reconstructed, dtype=np.int16)
            expected = np.asarray(source, dtype=np.int16)
        else:
            packed = np.asarray(packed_crop, dtype=np.int16)
            expected = np.asarray(
                source.resize((width, height), Image.Resampling.LANCZOS),
                dtype=np.int16,
            )
        alpha_mae = float(np.abs(packed[..., 3] - expected[..., 3]).mean())
        alpha_errors.append(alpha_mae)
        foreground = expected[..., 3] > 0
        if foreground.any():
            delta = packed[..., :3][foreground].astype(np.float64) - expected[..., :3][foreground].astype(np.float64)
            rgb_mae = float(np.abs(delta).mean())
            mse = float(np.square(delta).mean())
            psnr = float("inf") if mse == 0 else 20.0 * math.log10(255.0 / math.sqrt(mse))
        else:
            rgb_mae = 0.0
            psnr = float("inf")
        rgb_errors.append(rgb_mae)
        psnr_values.append(psnr)
        frame_passes = _quality_metrics_pass(
            rgb_mae,
            None if not math.isfinite(psnr) else psnr,
            alpha_mae,
        )
        frame_evidence.append(
            {
                "frame": index,
                "passes": frame_passes,
                "alphaMAE": round(alpha_mae, 10),
                "foregroundPixels": int(foreground.sum()),
                "foregroundRGBMAE": round(rgb_mae, 6),
                "foregroundRGBPSNR": round(psnr, 6) if math.isfinite(psnr) else "inf",
            }
        )
        if alpha_mae != ATLAS_ALPHA_MAE:
            failures.append(f"frame {index} alpha MAE {alpha_mae:.6f} != 0")
        if rgb_mae > ATLAS_FOREGROUND_RGB_MAE_MAX:
            failures.append(f"frame {index} foreground RGB MAE {rgb_mae:.4f} > 2.5")
        if psnr < ATLAS_FOREGROUND_RGB_PSNR_MIN:
            failures.append(f"frame {index} foreground RGB PSNR {psnr:.3f}dB < 38dB")
    if schema_version == 3:
        failures.extend(
            encoding_proof_failures(clip.get("encoding"), frame_evidence, len(frames))
        )
    return {
        "paths": [display_path(path) for path in atlas_paths],
        "sampledFrames": sample_indices,
        "frameEvidence": frame_evidence,
        "alphaMAE": round(float(np.mean(alpha_errors)), 6) if alpha_errors else None,
        "foregroundRGBMAE": round(float(np.mean(rgb_errors)), 6) if rgb_errors else None,
        "foregroundRGBPSNR": (
            round(float(min(psnr_values)), 4)
            if psnr_values and math.isfinite(min(psnr_values))
            else "inf"
        ),
        "result": "PASS" if not failures else "FAIL",
        "reasons": failures,
    }


def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    width, height = size
    yy, xx = np.indices((height, width))
    pattern = (xx // cell + yy // cell) % 2
    colours = np.array(((35, 15, 70), (74, 51, 101)), dtype=np.uint8)
    return Image.fromarray(colours[pattern], mode="RGB")


def contact_sheet(name: str, sources: list[Path], fps: int, output: Path) -> None:
    indices = np.linspace(0, len(sources) - 1, 8, dtype=int).tolist()
    tile_width, tile_height = 248, 280
    sheet = Image.new("RGB", (tile_width * 4, tile_height * 2), (35, 22, 58))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for slot, index in enumerate(indices):
        frame = Image.open(sources[index]).convert("RGBA")
        frame.thumbnail((224, 224), Image.Resampling.LANCZOS)
        column, row = slot % 4, slot // 4
        x = column * tile_width + (tile_width - frame.width) // 2
        y = row * tile_height + 8
        background = checkerboard(frame.size)
        background.paste(frame, mask=frame.getchannel("A"))
        sheet.paste(background, (x, y))
        draw.text((column * tile_width + 10, row * tile_height + 244), f"{name}  f{index:03d}  {index / fps:.2f}s", fill="white", font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, quality=94)


def verify_clip(
    name: str,
    clip: dict[str, Any],
    source_dir: Path,
    proof_dir: Path,
    regions: dict[str, tuple[float, float, float, float]],
    public_root: Path,
    approved_character_height_fraction: float,
    baseline_character_height: float,
    landmark_variant: dict[str, Any],
    variant: str,
    arms_present: bool,
    require_semantic: bool,
    manifest_schema_version: int,
    logical_canvas: dict[str, Any],
) -> dict[str, Any]:
    sources = files_for(source_dir)
    if len(sources) != int(clip["frameCount"]):
        raise AssertionError(f"{name}: source/manifest frame count mismatch")
    images = [rgba(path) for path in sources]
    if len({image.shape for image in images}) != 1:
        raise AssertionError(f"{name}: inconsistent source canvas")
    unique_ratio = len({pixel_hash(path) for path in sources}) / len(sources)
    reference = images[0]
    canvas_margin = transparent_canvas_margin(images, minimum_px=8)
    end = len(images) - 2 if clip.get("loop") and len(images) > 2 else len(images) - 1
    indices = sorted(set(np.linspace(1, max(1, end), 8, dtype=int).tolist()))
    residuals, explained, displacement = [], [], []
    alpha_tears: list[dict[str, float | int]] = []
    regional = {region: [] for region in regions}
    reference_centroid = alpha_centroid(reference)
    character_width, character_height = character_extent(reference)
    scale_character_height = approved_character_height_fraction * reference.shape[0]
    trajectory = (
        semantic_motion_trajectory(
            images,
            regions,
            scale_character_height,
            landmark_variant=landmark_variant,
            allow_large_rotation=name == "roll",
        )
        if require_semantic and (name == "idle" or name in SEMANTIC_REQUIRED_CLIPS)
        else None
    )
    semantic_spec = semantic_contract(name) if name in SEMANTIC_REQUIRED_CLIPS else None
    subloop = (
        semantic_motion_trajectory(
            images,
            regions,
            scale_character_height,
            tuple(semantic_spec["fingerprintRange"]),
            landmark_variant=landmark_variant,
            allow_large_rotation=name == "roll",
        )
        if require_semantic and semantic_spec and "fingerprintRange" in semantic_spec else None
    )
    phase_evidence = (
        semantic_phase_evidence(
            name,
            images,
            regions,
            scale_character_height,
            landmark_variant,
        )
        if require_semantic and semantic_spec else {}
    )
    representative_difference = None
    for index in indices:
        raw_change, residual, difference, aligned = aligned_difference(
            reference,
            images[index],
            allow_large_rotation=name == "roll",
        )
        residuals.append(residual)
        explained.append(max(0.0, min(1.0, 1.0 - residual / raw_change)) if raw_change > 1e-6 else 1.0)
        displacement.append(math.dist(reference_centroid, alpha_centroid(images[index])))
        alpha_tears.append(central_alpha_tear(reference, aligned, regions))
        for region, bounds in regions.items():
            regional[region].append(crop_mean(difference, bounds))
        if index == indices[len(indices) // 2]:
            representative_difference = difference
    region_peaks = {region: round(max(values), 3) for region, values in regional.items()}
    moving_regions = [region for region, value in region_peaks.items() if value >= 1.6]
    pupil_gaze = eat_pupil_gaze_evidence(images, landmark_variant, clip) if name == "eat" else None
    mean_residual = float(np.mean(residuals))
    mean_explained = float(np.mean(explained))
    root_displacement = max(displacement, default=0.0)
    worst_alpha_tear = max(alpha_tears, key=lambda value: float(value["maxRunRatio"]), default={"maxRunRatio": 0.0, "maxRunPx": 0, "row": -1})
    proof = clip.get("rigProof", {})
    channels = proof.get("animatedChannels", [])
    controls = proof.get("animatedControls", [])
    rig_regions = proof.get("regions", [])
    failures = []
    if unique_ratio < 0.72:
        failures.append(f"unique frame ratio {unique_ratio:.3f} < 0.72")
    if canvas_margin["result"] == "FAIL":
        sides = canvas_margin["sideMarginsPx"]
        failures.append(
            f"transparent canvas margin {int(canvas_margin['minimumMarginPx'])}px < 8px "
            f"at frame {int(canvas_margin['worstFrame'])} "
            f"(L{sides['left']} T{sides['top']} R{sides['right']} B{sides['bottom']})"
        )
    required_local_regions = min(
        len(regions),
        4 if name == "idle" else 6 if name in {"tap_reaction", "happy", "eat"} else 1,
    )
    if len(moving_regions) < required_local_regions:
        failures.append(f"root-aligned moving regions {len(moving_regions)} < {required_local_regions}")
    if name in {"idle", "tap_reaction", "happy", "eat"} and mean_residual < 1.35:
        failures.append(f"root-aligned local difference {mean_residual:.3f} < 1.35")
    if name in {"idle", "tap_reaction", "happy", "eat"} and mean_explained > 0.90 and mean_residual < 2.2:
        failures.append("one global affine explains >90% of visible motion")
    legacy_required_root = CINEMATIC_ROOT_DISPLACEMENT.get(name)
    required_root = (
        legacy_required_root * scale_character_height / baseline_character_height
        if legacy_required_root is not None
        else None
    )
    if required_root is not None and root_displacement < required_root:
        failures.append(
            f"cinematic root displacement {root_displacement:.3f}px < {required_root:.3f}px "
            f"({required_root / scale_character_height:.4%} of {scale_character_height:.1f}px approved character height)"
        )
    required_local = CINEMATIC_LOCAL_DIFFERENCE.get(name)
    if required_local is not None and mean_residual < required_local:
        failures.append(f"cinematic local difference {mean_residual:.3f} < {required_local:.1f}")
    for region, required_peak in CINEMATIC_REGION_PEAKS.get(name, {}).items():
        if region not in region_peaks:
            continue
        actual_peak = region_peaks[region]
        if actual_peak < required_peak:
            failures.append(
                f"cinematic {region} appearance-change MAE {actual_peak:.3f} < {required_peak:.1f}"
            )
    if pupil_gaze and pupil_gaze["result"] != "PASS":
        failures.extend(f"eat gaze: {reason}" for reason in pupil_gaze["reasons"])
    if name == "idle" and (len(controls) < 4 or len(channels) < 6 or len(rig_regions) < 4):
        failures.append("rig gate idle requires 4 controls / 6 channels / 4 regions")
    if name in {"tap_reaction", "happy", "eat"} and (len(controls) < 6 or len(channels) < 10 or len(rig_regions) < 6):
        failures.append(f"rig gate {name} requires 6 controls / 10 channels / 6 regions")
    if name == "blink" and float(proof.get("blinkClosure", 0)) < 0.8:
        failures.append("blink closure < 0.8")
    semantic_fields = {
        "manifestClip": clip,
        "rootAlignedDifference": mean_residual,
        "rootDisplacementNormalized": float(trajectory["root"]) if trajectory else 0.0,
        "regionalDisplacementNormalized": dict(trajectory["regions"]) if trajectory else {},
        "regionalMotionSampleCounts": dict(trajectory["regionalMotionSampleCounts"]) if trajectory else {},
        "regionalDisplacementSamplesNormalized": dict(trajectory["regionSamples"]) if trajectory else {},
        "meaningfulMotionFloorNormalized": (
            float(trajectory["meaningfulMotionFloorNormalized"]) if trajectory else 0.0
        ),
        "rigProof": proof,
        "phaseEvidence": phase_evidence,
        "motionFingerprint": trajectory["fingerprint"] if trajectory else None,
        "subloopFingerprint": subloop["fingerprint"] if subloop else None,
        "subloopMotionNormalized": float(subloop["energy"]) if subloop else 0.0,
    }
    if require_semantic and semantic_spec:
        failures.extend(
            validate_semantic_motion_result(
                name,
                semantic_fields,
                variant=variant,
                arms_present=arms_present,
            )
        )
    if float(worst_alpha_tear["maxRunRatio"]) > 0.22 and int(worst_alpha_tear["maxRunPx"]) >= 24:
        failures.append(
            f"central alpha tear {float(worst_alpha_tear['maxRunRatio']):.3f} > 0.22 "
            f"({int(worst_alpha_tear['maxRunPx'])} px at row {int(worst_alpha_tear['row'])})"
        )
    atlas = atlas_gate(
        clip,
        sources,
        public_root,
        schema_version=manifest_schema_version,
        canvas=logical_canvas,
    )
    if atlas["result"] == "FAIL":
        failures.extend(atlas["reasons"])
    if name in CONTACT_SHEETS:
        contact_sheet(name, sources, int(clip["fps"]), proof_dir / f"{name}-contact-sheet.jpg")
    if name == "idle" and representative_difference is not None:
        heat = cv2.applyColorMap(np.clip(representative_difference * 6, 0, 255).astype(np.uint8), cv2.COLORMAP_MAGMA)
        Image.fromarray(cv2.cvtColor(heat, cv2.COLOR_BGR2RGB)).save(proof_dir / "idle-root-aligned-difference.png")
    return {
        "frameCount": len(sources),
        "fps": int(clip["fps"]),
        "sourceRenderDirectory": display_path(source_dir),
        "characterExtentPx": {"width": character_width, "height": character_height},
        "approvedCharacterHeightPx": round(scale_character_height, 3),
        "uniqueFrameRatio": round(unique_ratio, 4),
        "animatedControls": controls,
        "animatedChannels": channels,
        "rootDisplacementPx": round(root_displacement, 3),
        "rootDisplacementNormalized": round(float(semantic_fields["rootDisplacementNormalized"]), 6),
        "rootAlignedDifference": round(mean_residual, 3),
        "regionalDisplacementNormalized": {
            region: round(float(value), 6)
            for region, value in semantic_fields["regionalDisplacementNormalized"].items()
        },
        "regionalMotionSampleCounts": {
            region: int(value)
            for region, value in semantic_fields["regionalMotionSampleCounts"].items()
        },
        "regionalDisplacementSamplesNormalized": {
            region: [round(float(value), 6) for value in values]
            for region, values in semantic_fields["regionalDisplacementSamplesNormalized"].items()
        },
        "semanticSampleFrames": list(trajectory["sampleFrames"]) if trajectory else [],
        "semanticDisplacementUnit": (
            "root-affine semantic centroid displacement / approved character height; "
            "leaf uses the weakest topology-declared tip"
        ),
        "meaningfulMotionFloorNormalized": round(
            float(semantic_fields["meaningfulMotionFloorNormalized"]),
            8,
        ),
        "globalAffineExplainedRatio": round(mean_explained, 4),
        "phaseEvidence": phase_evidence,
        "motionFingerprint": semantic_fields["motionFingerprint"],
        "subloopFingerprint": semantic_fields["subloopFingerprint"],
        "subloopMotionNormalized": round(float(semantic_fields["subloopMotionNormalized"]), 6),
        "centralAlphaTear": worst_alpha_tear,
        "transparentCanvasMargin": canvas_margin,
        "regionalMovement": region_peaks,
        "regionalMovementUnit": "mean absolute RGBA difference (0..255) after root alignment",
        "pupilGaze": pupil_gaze,
        "movingRegions": moving_regions,
        "blinkClosure": float(proof.get("blinkClosure", 0)),
        "atlas": atlas,
        "result": "PASS" if not failures else "FAIL",
        "reasons": failures,
    }


def verify_variant(requested_variant: str, args: argparse.Namespace, landmarks: dict[str, Any], *, all_mode: bool) -> dict[str, Any]:
    require_semantic = bool(getattr(args, "require_semantic", False))
    manifest_variant = requested_variant
    manifest_path = args.public / manifest_variant / "manifest.json"
    # The production baby directory predates the canonical stage-1 ID. Keep it
    # as an input alias until a stage-1 manifest is rendered, without allowing
    # it to stand in for any of the other nine variants.
    if requested_variant == "stage-1" and not manifest_path.is_file():
        legacy_path = args.public / "baby" / "manifest.json"
        if legacy_path.is_file():
            manifest_variant = "baby"
            manifest_path = legacy_path
    if not manifest_path.is_file():
        raise AssertionError(f"Missing manifest for {requested_variant}: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_schema_version = manifest.get("schemaVersion")
    if manifest_schema_version not in (2, 3):
        raise AssertionError(
            f"manifest schemaVersion is {manifest_schema_version!r}, expected 2 or 3"
        )
    required_clips = required_clips_for_variant(requested_variant, require_semantic)
    approved_variant = landmark_variant_id(requested_variant, manifest)
    if approved_variant not in landmarks["variants"]:
        raise AssertionError(f"No approved landmarks for {requested_variant} (resolved {approved_variant})")
    landmark_variant = landmarks["variants"][approved_variant]
    approved_reference = REPO / landmark_variant["source"]
    if not approved_reference.is_file():
        raise AssertionError(f"Missing approved art for {requested_variant}: {approved_reference}")
    source = args.source / manifest_variant
    if not source.is_dir():
        raise AssertionError(f"Missing rendered source for {requested_variant}: {source}")
    missing = [name for name in required_clips if name not in manifest.get("clips", {})]
    if missing:
        raise AssertionError("Missing clips: " + ", ".join(missing))
    proof_dir = args.proof / requested_variant if all_mode else args.proof
    proof_dir.mkdir(parents=True, exist_ok=True)
    approved_regions = regions_for_variant(
        landmark_variant,
        preserve_legacy_baby=manifest_variant == "baby",
        variant_id=approved_variant,
    )
    idle_reference = rgba(files_for(source / "idle")[0])
    regions = regions_for_variant(
        landmark_variant,
        preserve_legacy_baby=manifest_variant == "baby",
        variant_id=approved_variant,
        reference=idle_reference,
    )
    arms_present = bool(landmark_variant["topology"].get("armsPresent"))
    approved_character_height_fraction = float(landmark_variant["alpha"]["bboxNormalized"]["height"])
    # The existing cinematic thresholds were authored on a 512 px stage-1
    # render. Reading its detected alpha height here preserves those exact
    # gates while giving every later canvas the same displacement percentage.
    baseline_character_height = (
        float(landmarks["variants"]["stage-1"]["alpha"]["bboxNormalized"]["height"]) * 512.0
    )
    public_root = args.public.parents[2]
    report: dict[str, Any] = {
        "schemaVersion": 2,
        "gate": "B+C",
        "mode": "final-semantic" if require_semantic else "phase14-core",
        "variant": requested_variant,
        "manifestVariant": manifest_variant,
        "manifestSchemaVersion": manifest_schema_version,
        "approvedVariant": approved_variant,
        "requiredClips": list(required_clips),
        "fps": manifest["fps"],
        "canvas": manifest["canvas"],
        "anchor": manifest["anchor"],
        "manifest": display_path(manifest_path),
        "approvedCanvas": landmark_variant["canvas"],
        "approvedSemanticRegions": {
            name: [round(value, 6) for value in bounds]
            for name, bounds in approved_regions.items()
        },
        "semanticRegions": {
            name: [round(value, 6) for value in bounds]
            for name, bounds in regions.items()
        },
        "thresholds": {
            "appearanceAlphaIoU": 0.82,
            "appearanceColourMAE": 22.0,
            "appearanceEdgePrecision": 0.90,
            "appearanceEdgeRecall": 0.76,
            "appearanceEdgeF1": 0.82,
            "appearanceEdgeTolerancePx": 2,
            "appearanceInternalEdgeTolerancePx": 3,
            "appearanceEdgeBoundaryBandPx": 2,
            "uniqueFrameRatio": 0.72,
            "rootAlignedDifference": 1.35,
            "regionalDifference": 1.6,
            "eatPupilDisplacementPerDiameter": MIN_PUPIL_GAZE_RATIO,
            "eatPupilDirectionCosine": MIN_GAZE_DIRECTION_COSINE,
            "maxAffineExplainedWhenResidualLow": 0.90,
            "atlasAlphaMAE": 0.0,
            "atlasForegroundRGBMAE": 2.5,
            "atlasForegroundRGBPSNR": 38.0,
            "maxCentralAlphaTearRatio": 0.22,
            "minimumTransparentCanvasMarginPx": 8,
        },
        "appearanceFidelity": appearance_fidelity(files_for(source / "idle")[0], approved_reference),
        "clips": {},
    }
    for name in required_clips:
        clip = manifest["clips"][name]
        directory = source / name
        if directory.exists():
            report["clips"][name] = verify_clip(
                name,
                clip,
                directory,
                proof_dir,
                regions,
                public_root,
                approved_character_height_fraction,
                baseline_character_height,
                landmark_variant,
                requested_variant,
                arms_present,
                require_semantic,
                manifest_schema_version,
                manifest["canvas"],
            )
    missing_results = [name for name in required_clips if name not in report["clips"]]
    failed = [name for name, value in report["clips"].items() if value["result"] == "FAIL"]
    semantic_fingerprint_reasons = (
        validate_semantic_fingerprints(
            report["clips"],
            idle_fingerprint=report["clips"].get("idle", {}).get("motionFingerprint"),
        )
        if require_semantic else []
    )
    report["missing"] = missing_results
    report["failed"] = failed
    report["semanticFingerprintReasons"] = semantic_fingerprint_reasons
    report["result"] = (
        "PASS"
        if not missing_results and not failed and not semantic_fingerprint_reasons
        and report["appearanceFidelity"]["result"] == "PASS"
        else "FAIL"
    )
    (proof_dir / "motion-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main():
    args = arguments()
    if args.all and args.variant:
        raise SystemExit("--all and --variant are mutually exclusive")
    landmarks = load_landmarks()
    if args.all:
        reports: dict[str, Any] = {}
        for variant in landmarks["variants"]:
            try:
                reports[variant] = verify_variant(variant, args, landmarks, all_mode=True)
            except (AssertionError, FileNotFoundError, KeyError, ValueError) as error:
                reports[variant] = {
                    "variant": variant,
                    "result": "MISSING" if "Missing" in str(error) else "FAIL",
                    "reasons": [str(error)],
                }
        aggregate: dict[str, Any] = {
            "schemaVersion": 2,
            "gate": "B+C-all-variants",
            "expectedVariants": list(landmarks["variants"]),
            "variants": reports,
            "result": "PASS" if reports and all(value["result"] == "PASS" for value in reports.values()) else "FAIL",
        }
        report_path = args.report if args.report != REPORT_PATH else REPORT_PATH.with_name("motion-report-all.json")
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(aggregate, indent=2) + "\n", encoding="utf-8")
        args.proof.mkdir(parents=True, exist_ok=True)
        (args.proof / "motion-report-all.json").write_text(json.dumps(aggregate, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({
            "result": aggregate["result"],
            "variants": {name: value["result"] for name, value in reports.items()},
            "report": display_path(report_path),
        }, indent=2))
        if aggregate["result"] != "PASS":
            raise SystemExit(1)
        return

    variant = args.variant or "baby"
    report = verify_variant(variant, args, landmarks, all_mode=False)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": report["result"], "failed": report["failed"], "report": display_path(args.report)}, indent=2))
    if report["result"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
