#!/usr/bin/env python3
"""Build Niumpi's full-frame animation atlases from approved pose sheets.

The shipped renderer never assembles a puppet.  This build step chroma-keys
the authored full-character poses, registers them to one contact plane and
uses bidirectional optical flow to create the in-between drawings.  The output
is a set of flattened RGBA frames and one compact WebP atlas per evolution
variant.  Runtime code only selects rectangles from those atlases.

Run from the repository root:
  python3 -m venv .venv-animation
  .venv-animation/bin/pip install -r scripts/requirements-animation.txt
  .venv-animation/bin/python scripts/build-niumpi-animation.py
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "public/assets/niumpi/frame-animation"
SOURCE_ROOT = ROOT / "artifacts/niumpi-frame-animation"
SHEET_ROOT = SOURCE_ROOT / "pose-sheets"
LAYER_ROOT = SOURCE_ROOT / "layers"
ATLAS_ROOT = ASSET_ROOT / "atlases"
FRAME_ROOT = SOURCE_ROOT / "frames"
MANIFEST_PATH = ASSET_ROOT / "manifest.json"

FRAME_SIZE = 224
ATLAS_COLUMNS = 8
FPS = 24

VARIANTS = (
    "stage-1", "stage-2", "stage-3", "stage-4", "stage-5",
    "moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic",
)


@dataclass(frozen=True)
class ClipSpec:
    frames: int
    loop: bool
    poses: tuple[int, ...]


CLIPS: dict[str, ClipSpec] = {
    "idle": ClipSpec(48, True, (0, 1, 0, 2, 0)),
    "blink": ClipSpec(8, False, (0, 3, 4, 3, 0)),
    "look": ClipSpec(16, False, (0, 5, 0, 6, 0)),
    "tap_reaction": ClipSpec(24, False, (0, 7, 8, 9, 0)),
    "happy": ClipSpec(32, False, (0, 7, 10, 9, 0)),
    "hatch_complete": ClipSpec(36, False, (4, 2, 7, 8, 9, 0)),
}


def chroma_key(rgb: np.ndarray) -> np.ndarray:
    """Turn the deliberately impossible green backdrop into soft alpha."""
    data = rgb.astype(np.float32)
    red, green, blue = data[..., 0], data[..., 1], data[..., 2]
    dominance = green - np.maximum(red, blue)
    key = np.clip((dominance - 24.0) / 92.0, 0.0, 1.0)
    # Protect cyan leaf paint: only pixels that are both very green and very
    # dominant can disappear completely.
    key *= np.clip((green - 105.0) / 100.0, 0.0, 1.0)
    alpha = np.round((1.0 - key) * 255.0).astype(np.uint8)

    # Remove reflected green from anti-aliased boundary pixels without touching
    # the iridescent teal inside the character.
    spill = (key > 0.08) & (key < 0.98)
    data[..., 1][spill] = np.minimum(
        data[..., 1][spill],
        np.maximum(data[..., 0][spill], data[..., 2][spill]) * 1.08 + 14.0,
    )
    rgba = np.dstack((np.clip(data, 0, 255).astype(np.uint8), alpha))
    rgba[alpha <= 2, :3] = 0
    return rgba


def extract_poses(path: Path) -> list[np.ndarray]:
    sheet = np.asarray(Image.open(path).convert("RGB"))
    height, width = sheet.shape[:2]
    poses: list[np.ndarray] = []
    for row in range(3):
        y0, y1 = round(row * height / 3), round((row + 1) * height / 3)
        for column in range(4):
            x0, x1 = round(column * width / 4), round((column + 1) * width / 4)
            cell = chroma_key(sheet[y0:y1, x0:x1])
            cell = cv2.resize(cell, (FRAME_SIZE, FRAME_SIZE), interpolation=cv2.INTER_LANCZOS4)
            # Fully transparent RGB must remain black to avoid coloured WebP
            # fringes after bilinear sampling on the canvas.
            cell[cell[..., 3] <= 2, :3] = 0
            poses.append(cell)
    return poses


def composite_gray(frame: np.ndarray) -> np.ndarray:
    alpha = frame[..., 3:4].astype(np.float32) / 255.0
    neutral = np.full_like(frame[..., :3], 44, dtype=np.float32)
    rgb = frame[..., :3].astype(np.float32) * alpha + neutral * (1.0 - alpha)
    gray = cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2GRAY)
    # Alpha silhouettes matter as much as internal paint to optical flow.
    return cv2.addWeighted(gray, 0.72, frame[..., 3], 0.28, 0)


def flow_between(a: np.ndarray, b: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    ga, gb = composite_gray(a), composite_gray(b)
    flags = 0
    forward = cv2.calcOpticalFlowFarneback(ga, gb, None, 0.5, 4, 21, 4, 7, 1.5, flags)
    backward = cv2.calcOpticalFlowFarneback(gb, ga, None, 0.5, 4, 21, 4, 7, 1.5, flags)
    return forward, backward


def ease(value: float) -> float:
    return value * value * (3.0 - 2.0 * value)


def interpolate(
    a: np.ndarray,
    b: np.ndarray,
    amount: float,
    flows: tuple[np.ndarray, np.ndarray],
) -> np.ndarray:
    """Motion-compensated nearest key: motion without double-exposed faces."""
    t = ease(float(np.clip(amount, 0.0, 1.0)))
    forward, backward = flows
    yy, xx = np.mgrid[0:FRAME_SIZE, 0:FRAME_SIZE].astype(np.float32)
    map_ax = xx - forward[..., 0] * t
    map_ay = yy - forward[..., 1] * t
    map_bx = xx - backward[..., 0] * (1.0 - t)
    map_by = yy - backward[..., 1] * (1.0 - t)
    wa = cv2.remap(a, map_ax, map_ay, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)
    wb = cv2.remap(b, map_bx, map_by, cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)

    # Blending two complete character paintings produces duplicate pupils,
    # mouths and leaf edges.  Both endpoints have already been warped to the
    # same in-between geometry, so switch source at the motion midpoint.  The
    # silhouette keeps travelling while there is only ever one painted face.
    result = wa if t < 0.5 else wb
    result = np.ascontiguousarray(result)
    result[result[..., 3] <= 2, :3] = 0
    return result


def allocate_segments(total: int, segment_count: int, loop: bool) -> list[int]:
    moving = total if loop else total - 1
    base, remainder = divmod(moving, segment_count)
    return [base + (1 if index < remainder else 0) for index in range(segment_count)]


def make_clip(
    poses: list[np.ndarray],
    spec: ClipSpec,
    cache: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]],
) -> list[np.ndarray]:
    counts = allocate_segments(spec.frames, len(spec.poses) - 1, spec.loop)
    frames: list[np.ndarray] = []
    for segment, count in enumerate(counts):
        a_index, b_index = spec.poses[segment], spec.poses[segment + 1]
        pair = (a_index, b_index)
        if pair not in cache:
            cache[pair] = flow_between(poses[a_index], poses[b_index])
        for step in range(count):
            frames.append(interpolate(poses[a_index], poses[b_index], step / count, cache[pair]))
    if not spec.loop:
        frames.append(poses[spec.poses[-1]].copy())
    assert len(frames) == spec.frames, (len(frames), spec.frames)
    return frames


def save_layers(variant: str, neutral: np.ndarray) -> None:
    """Preserve the logical surfaces used to art-direct the key poses."""
    destination = LAYER_ROOT / variant
    destination.mkdir(parents=True, exist_ok=True)
    alpha = neutral[..., 3].astype(np.float32) / 255.0
    yy, xx = np.mgrid[0:FRAME_SIZE, 0:FRAME_SIZE].astype(np.float32)
    nx, ny = xx / FRAME_SIZE, yy / FRAME_SIZE

    def ellipse(cx: float, cy: float, rx: float, ry: float) -> np.ndarray:
        field = 1.0 - ((nx - cx) / rx) ** 2 - ((ny - cy) / ry) ** 2
        return np.clip(field * 4.0, 0.0, 1.0)

    masks = {
        "body": alpha,
        "head-and-leaves": alpha * np.clip((0.64 - ny) * 8.0, 0.0, 1.0),
        "leaf-follow": alpha * np.clip((0.39 - ny) * 12.0, 0.0, 1.0),
        "left-arm": alpha * ellipse(0.22, 0.61, 0.22, 0.24),
        "right-arm": alpha * ellipse(0.78, 0.61, 0.22, 0.24),
        "lower-body": alpha * np.clip((ny - 0.61) * 7.0, 0.0, 1.0),
        "left-eye-and-lid": alpha * ellipse(0.39, 0.51, 0.115, 0.14),
        "right-eye-and-lid": alpha * ellipse(0.61, 0.51, 0.115, 0.14),
        "ground-shadow": ellipse(0.50, 0.87, 0.34, 0.075),
    }
    for name, mask in masks.items():
        softened = cv2.GaussianBlur(np.round(mask * 255).astype(np.uint8), (0, 0), 1.2)
        Image.fromarray(softened, "L").save(destination / f"{name}.png", optimize=True)


def save_source_frames(variant: str, clip: str, frames: list[np.ndarray]) -> None:
    destination = FRAME_ROOT / variant / clip
    destination.mkdir(parents=True, exist_ok=True)
    for index, frame in enumerate(frames):
        Image.fromarray(frame, "RGBA").save(
            destination / f"{index:03d}.webp",
            "WEBP", quality=86, method=5, exact=True,
        )


def save_atlas(variant: str, frames: list[np.ndarray]) -> tuple[int, int]:
    rows = math.ceil(len(frames) / ATLAS_COLUMNS)
    atlas = np.zeros((rows * FRAME_SIZE, ATLAS_COLUMNS * FRAME_SIZE, 4), dtype=np.uint8)
    for index, frame in enumerate(frames):
        x = (index % ATLAS_COLUMNS) * FRAME_SIZE
        y = (index // ATLAS_COLUMNS) * FRAME_SIZE
        atlas[y:y + FRAME_SIZE, x:x + FRAME_SIZE] = frame
    ATLAS_ROOT.mkdir(parents=True, exist_ok=True)
    Image.fromarray(atlas, "RGBA").save(
        ATLAS_ROOT / f"{variant}.webp",
        "WEBP", quality=88, method=6, exact=True,
    )
    return atlas.shape[1], atlas.shape[0]


def build(clean: bool) -> None:
    if clean:
        for target in (LAYER_ROOT, ATLAS_ROOT, FRAME_ROOT):
            if target.exists():
                shutil.rmtree(target)

    clip_manifest: dict[str, dict[str, object]] = {}
    cursor = 0
    for name, spec in CLIPS.items():
        frames = []
        for index in range(spec.frames):
            absolute = cursor + index
            frames.append({
                "index": index,
                "x": (absolute % ATLAS_COLUMNS) * FRAME_SIZE,
                "y": (absolute // ATLAS_COLUMNS) * FRAME_SIZE,
                "w": FRAME_SIZE,
                "h": FRAME_SIZE,
                "durationMs": round(1000 / FPS, 4),
            })
        clip_manifest[name] = {
            "fps": FPS,
            "loop": spec.loop,
            "frameCount": spec.frames,
            "durationMs": round(spec.frames * 1000 / FPS, 4),
            "frames": frames,
        }
        cursor += spec.frames

    variants_manifest: dict[str, dict[str, object]] = {}
    for variant in VARIANTS:
        print(f"building {variant}…", flush=True)
        poses = extract_poses(SHEET_ROOT / f"{variant}.png")
        save_layers(variant, poses[0])
        flow_cache: dict[tuple[int, int], tuple[np.ndarray, np.ndarray]] = {}
        all_frames: list[np.ndarray] = []
        for clip, spec in CLIPS.items():
            clip_frames = make_clip(poses, spec, flow_cache)
            save_source_frames(variant, clip, clip_frames)
            all_frames.extend(clip_frames)
        width, height = save_atlas(variant, all_frames)
        variants_manifest[variant] = {
            "atlas": f"/assets/niumpi/frame-animation/atlases/{variant}.webp",
            "width": width,
            "height": height,
            "sourcePoseSheet": f"artifacts/niumpi-frame-animation/pose-sheets/{variant}.png",
        }

    manifest = {
        "version": 1,
        "renderer": "canvas-2d-full-frame-atlas",
        "frameSize": {"width": FRAME_SIZE, "height": FRAME_SIZE},
        "columns": ATLAS_COLUMNS,
        "fps": FPS,
        "totalFramesPerVariant": cursor,
        "clips": clip_manifest,
        "variants": variants_manifest,
    }
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {MANIFEST_PATH.relative_to(ROOT)} ({cursor} frames × {len(VARIANTS)} variants)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-clean", action="store_true", help="Keep old generated files before rebuilding")
    args = parser.parse_args()
    build(clean=not args.no_clean)
