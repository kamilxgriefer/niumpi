#!/usr/bin/env python3
"""Build bounded, content-addressed Niumpi sprite atlases.

Schema v3 trims each canonical RGBA frame, keeps four transparent pixels
around every packed rectangle and records the logical-canvas offset. Pages
are bounded by decoded RGBA bytes rather than only by encoded file size.
WebP quality is selected independently for every clip; lossless is used when
no lossy quality satisfies the unchanged codec gates.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

import numpy as np
from PIL import Image


REPO = Path(__file__).resolve().parents[2]
SOURCE_ROOT = REPO / "art/niumpi/rendered-source"
PUBLIC_ROOT = REPO / "public/assets/niumpi/v2"
MAX_PAGE_SIZE = 4096
MAX_DECODED_PAGE_BYTES = 44_040_192
MAX_PAGE_PIXELS = MAX_DECODED_PAGE_BYTES // 4
GUTTER_PX = 4
FOREGROUND_ALPHA_MIN = 0
QUALITY_CANDIDATES = tuple(range(79, 101))
SHA256_PATTERN_LENGTH = 64
GENERATOR_SOURCE_PATHS = (
    Path("scripts/niumpi/build_rig.py"),
    Path("scripts/niumpi/build_actions.py"),
    Path("scripts/niumpi/render_actions.py"),
    Path("scripts/niumpi/build_variant_rig.py"),
    Path("scripts/niumpi/variant_clip_contract.py"),
)


@dataclass(frozen=True)
class SourceFrame:
    index: int
    canonical: Image.Image
    bbox: tuple[int, int, int, int]


@dataclass(frozen=True)
class PackedFrame:
    index: int
    page: int
    x: int
    y: int
    w: int
    h: int
    offset_x: int
    offset_y: int


@dataclass
class PackedClip:
    pages: list[Image.Image]
    frames: list[PackedFrame]
    sources: list[SourceFrame]
    canvas: tuple[int, int]


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", default="baby")
    parser.add_argument("--source", type=Path, default=SOURCE_ROOT)
    parser.add_argument("--public", type=Path, default=PUBLIC_ROOT)
    parser.add_argument("--clips", nargs="*")
    parser.add_argument(
        "--webp-quality",
        type=int,
        default=92,
        help="Compatibility/search hint; v3 still selects the lowest passing quality per clip",
    )
    parser.add_argument("--max-foreground-mae", type=float, default=2.5)
    parser.add_argument("--min-foreground-psnr", type=float, default=38.0)
    args = parser.parse_args()
    if not 1 <= args.webp_quality <= 100:
        parser.error("--webp-quality must be between 1 and 100")
    return args


def canonicalize_transparent_rgb(image: Image.Image) -> Image.Image:
    """Zero source hidden RGB only where alpha is exactly zero.

    This is a deterministic pre-encode canonicalization. Lossy WebP does not
    promise that decoded RGB remains zero under fully transparent pixels.
    """

    array = np.asarray(image.convert("RGBA")).copy()
    transparent = array[..., 3] == 0
    array[transparent, :3] = 0
    return Image.fromarray(array, "RGBA")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def generator_sha256(repo: Path = REPO) -> str:
    """Reproduce render_actions.generator_sha256 without importing bpy."""

    digest = hashlib.sha256()
    for relative in GENERATOR_SOURCE_PATHS:
        path = repo / relative
        if not path.is_file():
            raise RuntimeError(f"generator source is missing: {relative.as_posix()}")
        digest.update(relative.as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _resolved_repo_file(repo: Path, value: Any, label: str) -> Path:
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"render report is missing {label} path")
    root = repo.resolve()
    path = (root / value).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise RuntimeError(f"render report {label} is not a repository file: {value!r}")
    return path


def _required_sha(provenance: dict[str, Any], name: str) -> str:
    value = provenance.get(name)
    if not isinstance(value, str) or len(value) != SHA256_PATTERN_LENGTH:
        raise RuntimeError(f"render report provenance has invalid {name}")
    try:
        int(value, 16)
    except ValueError as error:
        raise RuntimeError(f"render report provenance has invalid {name}") from error
    return value.lower()


def validate_report_provenance(report: dict[str, Any], repo: Path = REPO) -> dict[str, Any]:
    provenance = report.get("provenance")
    if not isinstance(provenance, dict):
        raise RuntimeError("render report has no provenance object")
    checks = (
        ("master", "masterSha256"),
        ("approvedArt", "approvedArtSha256"),
    )
    verified: dict[str, str] = {}
    for path_name, sha_name in checks:
        path = _resolved_repo_file(repo, provenance.get(path_name), path_name)
        expected = _required_sha(provenance, sha_name)
        actual = file_sha256(path)
        if actual != expected:
            raise RuntimeError(f"render report {path_name} sha256 mismatch: {actual} != {expected}")
        verified[sha_name] = actual
    landmarks = repo / "art/niumpi/variant-landmarks.json"
    expected_landmarks = _required_sha(provenance, "landmarksSha256")
    actual_landmarks = file_sha256(landmarks)
    if actual_landmarks != expected_landmarks:
        raise RuntimeError(
            f"render report landmarks sha256 mismatch: {actual_landmarks} != {expected_landmarks}"
        )
    verified["landmarksSha256"] = actual_landmarks
    expected_generator = _required_sha(provenance, "generatorSha256")
    actual_generator = generator_sha256(repo)
    if actual_generator != expected_generator:
        raise RuntimeError(
            "render report generator sha256 mismatch: "
            f"{actual_generator} != {expected_generator}"
        )
    verified["generatorSha256"] = actual_generator
    return verified


def frame_hash_digest(frame_hashes: list[str]) -> str:
    return hashlib.sha256("".join(frame_hashes).encode("ascii")).hexdigest()


def validate_report_lineage(report: dict[str, Any]) -> dict[str, str]:
    """Validate an optional preserved-core/current-semantic provenance chain."""

    provenance = report.get("provenance", {})
    predecessor = provenance.get("corePredecessor")
    semantic = provenance.get("semanticBatch")
    clips = report.get("clips", {})
    if predecessor is None and semantic is None:
        return {name: "current" for name in clips}
    if not isinstance(predecessor, dict) or not isinstance(semantic, dict):
        raise RuntimeError("mixed render report must declare both corePredecessor and semanticBatch")
    preserved = predecessor.get("preservedClips")
    semantic_clips = semantic.get("clips")
    digests = predecessor.get("clipFrameHashDigests")
    prior = predecessor.get("reportProvenance")
    if (not isinstance(preserved, list) or not isinstance(semantic_clips, list)
        or not isinstance(digests, dict) or not isinstance(prior, dict)):
        raise RuntimeError("mixed render report lineage is incomplete")
    if len(set(preserved)) != len(preserved) or len(set(semantic_clips)) != len(semantic_clips):
        raise RuntimeError("mixed render report lineage contains duplicate clips")
    if set(preserved) & set(semantic_clips) or set(preserved) | set(semantic_clips) != set(clips):
        raise RuntimeError("mixed render report lineage does not partition all clips")
    if set(digests) != set(preserved):
        raise RuntimeError("mixed render report predecessor digest keys do not match preserved clips")
    for sha_name in ("masterSha256", "generatorSha256", "approvedArtSha256", "landmarksSha256"):
        _required_sha(prior, sha_name)
    for name in preserved:
        hashes = clips.get(name, {}).get("frameHashes")
        if not isinstance(hashes, list) or digests.get(name) != frame_hash_digest(hashes):
            raise RuntimeError(f"mixed render report predecessor digest mismatch for {name}")
    expected_semantic_frames = sum(int(clips[name]["frameCount"]) for name in semantic_clips)
    if int(semantic.get("frameCount", -1)) != expected_semantic_frames:
        raise RuntimeError("semanticBatch frameCount does not match its clip partition")
    return {
        **{name: "corePredecessor" for name in preserved},
        **{name: "current" for name in semantic_clips},
    }


def validate_source_frame_hashes(
    clip: str,
    rendered: dict[str, Any],
    paths: list[Path],
) -> list[str]:
    expected = rendered.get("frameHashes")
    if not isinstance(expected, list) or len(expected) != len(paths):
        raise RuntimeError(f"{clip}: frameHashes count does not match source PNG count")
    actual = [file_sha256(path) for path in paths]
    for index, (actual_hash, expected_hash) in enumerate(zip(actual, expected, strict=True)):
        if not isinstance(expected_hash, str) or actual_hash != expected_hash.lower():
            raise RuntimeError(
                f"{clip}: source PNG hash mismatch at frame {index}: {actual_hash} != {expected_hash}"
            )
    return actual


def guard_partial_publish(out_root: Path, requested_clips: set[str]) -> None:
    """Never replace a complete published target with a partial manifest."""

    if requested_clips and (out_root / "manifest.json").exists():
        raise RuntimeError(
            "--clips cannot publish over an existing manifest; use a fresh --public pilot directory "
            "or build the complete variant"
        )


def packing_contract() -> dict[str, Any]:
    return {
        "mode": "trimmed-rgba-v1",
        # Compatibility value consumed by the v3 runtime validator. The
        # explicit fields scope it to source preprocessing; lossy decode is
        # intentionally not claimed to preserve RGB under zero alpha.
        "transparentRGB": "zero-when-alpha-zero",
        "sourceCanonicalization": {
            "transparentRGB": "zero-when-alpha-zero",
            "stage": "pre-encode",
        },
        "decodedTransparentRGB": "unspecified-for-lossy-webp",
        "gutterPx": GUTTER_PX,
        "maxDecodedPageBytes": MAX_DECODED_PAGE_BYTES,
    }


def source_frames(paths: list[Path], canvas: tuple[int, int]) -> list[SourceFrame]:
    result: list[SourceFrame] = []
    for index, source_path in enumerate(paths):
        with Image.open(source_path) as opened:
            canonical = canonicalize_transparent_rgb(opened)
        if canonical.size != canvas:
            raise RuntimeError(f"{source_path}: expected {canvas}, got {canonical.size}")
        bbox = canonical.getchannel("A").getbbox() or (0, 0, 1, 1)
        result.append(SourceFrame(index=index, canonical=canonical, bbox=bbox))
    return result


def shelf_layout(
    group: list[SourceFrame],
    width: int,
) -> tuple[int, int, dict[int, tuple[int, int, int, int]]] | None:
    max_height = min(MAX_PAGE_SIZE, MAX_PAGE_PIXELS // width)
    if max_height <= 0:
        return None
    shelves: list[dict[str, int]] = []
    placements: dict[int, tuple[int, int, int, int]] = {}
    used_height = 0
    ordered = sorted(
        group,
        key=lambda frame: (
            -(frame.bbox[3] - frame.bbox[1]),
            -(frame.bbox[2] - frame.bbox[0]),
            frame.index,
        ),
    )
    for source in ordered:
        crop_width = source.bbox[2] - source.bbox[0]
        crop_height = source.bbox[3] - source.bbox[1]
        outer_width = crop_width + 2 * GUTTER_PX
        outer_height = crop_height + 2 * GUTTER_PX
        if outer_width > width or outer_height > max_height:
            return None
        eligible = [
            shelf
            for shelf in shelves
            if outer_height <= shelf["height"] and shelf["x"] + outer_width <= width
        ]
        if eligible:
            shelf = min(
                eligible,
                key=lambda item: (
                    width - item["x"] - outer_width,
                    item["height"] - outer_height,
                ),
            )
        else:
            if used_height + outer_height > max_height:
                return None
            shelf = {"y": used_height, "height": outer_height, "x": 0}
            shelves.append(shelf)
            used_height += outer_height
        placements[source.index] = (
            shelf["x"] + GUTTER_PX,
            shelf["y"] + GUTTER_PX,
            crop_width,
            crop_height,
        )
        shelf["x"] += outer_width

    used_width = max((x + w + GUTTER_PX for x, _, w, _ in placements.values()), default=1)
    used_height = max((y + h + GUTTER_PX for _, y, _, h in placements.values()), default=1)
    decoded_bytes = used_width * used_height * 4
    if used_width > MAX_PAGE_SIZE or used_height > MAX_PAGE_SIZE or decoded_bytes > MAX_DECODED_PAGE_BYTES:
        return None
    return used_width, used_height, placements


def best_layout(group: list[SourceFrame]) -> tuple[int, int, dict[int, tuple[int, int, int, int]]] | None:
    widest = max((frame.bbox[2] - frame.bbox[0] + 2 * GUTTER_PX for frame in group), default=1)
    first_grid_width = max(1024, math.ceil(widest / 128) * 128)
    widths = sorted({widest, *range(first_grid_width, MAX_PAGE_SIZE + 1, 128)})
    candidates = [layout for width in widths if (layout := shelf_layout(group, width)) is not None]
    if not candidates:
        return None
    return min(candidates, key=lambda layout: (layout[0] * layout[1], layout[1], layout[0]))


def pack_trimmed_frames(sources: list[SourceFrame], canvas: tuple[int, int]) -> PackedClip:
    """Pack contiguous frame ranges so adjacent playback pages stay bounded."""

    pages: list[Image.Image] = []
    mappings: list[PackedFrame] = []
    start = 0
    while start < len(sources):
        low, high = 1, len(sources) - start
        best: tuple[int, tuple[int, int, dict[int, tuple[int, int, int, int]]]] | None = None
        while low <= high:
            middle = (low + high) // 2
            layout = best_layout(sources[start : start + middle])
            if layout is None:
                high = middle - 1
            else:
                best = (middle, layout)
                low = middle + 1
        if best is None:
            raise RuntimeError(f"Cannot fit cropped frame {start} within the decoded-page cap")
        count, (page_width, page_height, placements) = best
        page = Image.new("RGBA", (page_width, page_height), (0, 0, 0, 0))
        page_index = len(pages)
        for source in sources[start : start + count]:
            x, y, width, height = placements[source.index]
            x0, y0, x1, y1 = source.bbox
            page.paste(source.canonical.crop((x0, y0, x1, y1)), (x, y))
            mappings.append(
                PackedFrame(
                    index=source.index,
                    page=page_index,
                    x=x,
                    y=y,
                    w=width,
                    h=height,
                    offset_x=x0,
                    offset_y=y0,
                )
            )
        pages.append(page)
        start += count
    return PackedClip(
        pages=pages,
        frames=sorted(mappings, key=lambda frame: frame.index),
        sources=sources,
        canvas=canvas,
    )


def reconstruct_frame(
    pack: PackedClip,
    mapping: PackedFrame,
    pages: list[Image.Image] | None = None,
) -> Image.Image:
    source_pages = pages or pack.pages
    logical = Image.new("RGBA", pack.canvas, (0, 0, 0, 0))
    crop = source_pages[mapping.page].crop(
        (mapping.x, mapping.y, mapping.x + mapping.w, mapping.y + mapping.h)
    )
    logical.paste(crop, (mapping.offset_x, mapping.offset_y))
    return logical


def geometry_is_exact(pack: PackedClip) -> bool:
    return all(
        np.array_equal(
            np.asarray(reconstruct_frame(pack, mapping)),
            np.asarray(source.canonical),
        )
        for mapping, source in zip(pack.frames, pack.sources, strict=True)
    )


def encode_webp(image: Image.Image, quality: int | None) -> bytes:
    output = io.BytesIO()
    if quality is None:
        image.save(output, "WEBP", lossless=True, quality=100, method=6, exact=True)
    else:
        image.save(output, "WEBP", lossless=False, quality=quality, method=6, exact=True)
    return output.getvalue()


def decode_pages(encoded: list[bytes]) -> list[Image.Image]:
    decoded: list[Image.Image] = []
    for blob in encoded:
        with Image.open(io.BytesIO(blob)) as opened:
            decoded.append(opened.convert("RGBA"))
    return decoded


def codec_metrics(pack: PackedClip, encoded: list[bytes]) -> dict[str, float | bool | None]:
    decoded = decode_pages(encoded)
    canonical_exact = True
    per_frame: list[dict[str, Any]] = []
    for frame_index, (mapping, source) in enumerate(zip(pack.frames, pack.sources, strict=True)):
        reconstructed = reconstruct_frame(pack, mapping, decoded)
        source_array = np.asarray(source.canonical, dtype=np.int16)
        decoded_array = np.asarray(reconstructed, dtype=np.int16)
        canonical_exact = canonical_exact and bool(np.array_equal(source_array, decoded_array))
        alpha_delta = np.abs(source_array[..., 3] - decoded_array[..., 3])
        alpha_mae = float(alpha_delta.mean())
        foreground = source_array[..., 3] > FOREGROUND_ALPHA_MIN
        rgb_delta = source_array[..., :3][foreground] - decoded_array[..., :3][foreground]
        foreground_mae = float(np.abs(rgb_delta).mean()) if rgb_delta.size else 0.0
        foreground_mse = float(np.square(rgb_delta.astype(np.float64)).mean()) if rgb_delta.size else 0.0
        foreground_psnr = None if foreground_mse == 0 else 10 * math.log10((255.0**2) / foreground_mse)
        per_frame.append(
            {
                "index": frame_index,
                "foregroundMAE": round(foreground_mae, 6),
                "foregroundPSNR": None if foreground_psnr is None else round(foreground_psnr, 6),
                "alphaMAE": round(alpha_mae, 10),
            }
        )
    foreground_mae = max((float(frame["foregroundMAE"]) for frame in per_frame), default=0.0)
    finite_psnr = [float(frame["foregroundPSNR"]) for frame in per_frame if frame["foregroundPSNR"] is not None]
    alpha_mae = max((float(frame["alphaMAE"]) for frame in per_frame), default=0.0)
    return {
        "foregroundMAE": round(foreground_mae, 6),
        "foregroundPSNR": round(min(finite_psnr), 6) if finite_psnr else None,
        "alphaMAE": round(alpha_mae, 10),
        "canonicalRGBAExact": canonical_exact,
        "perFrame": per_frame,
    }


def codec_passes(metrics: dict[str, float | bool | None], max_mae: float, min_psnr: float) -> bool:
    frames = metrics.get("perFrame")
    if not isinstance(frames, list) or not frames:
        frames = [metrics]
    return all(
        frame["alphaMAE"] == 0
        and float(frame["foregroundMAE"]) <= max_mae
        and (frame["foregroundPSNR"] is None or float(frame["foregroundPSNR"]) >= min_psnr)
        for frame in frames
    )


def find_quality_boundary(
    evaluate: Callable[[int], dict[str, Any]],
    candidates: tuple[int, ...] = QUALITY_CANDIDATES,
) -> tuple[int | None, dict[str, Any] | None, list[int]]:
    """Return the first passing declared candidate, never an absolute claim."""

    ordered = tuple(sorted(set(candidates)))
    if not ordered or ordered[-1] != 100 or any(quality < 1 or quality > 100 for quality in ordered):
        raise ValueError("quality candidates must be unique values in 1..100 and include q100")
    evaluated: list[int] = []
    predecessor = None
    for quality in ordered:
        result = evaluate(quality)
        evaluated.append(quality)
        if result["passes"]:
            return quality, predecessor, evaluated
        predecessor = result
    return None, predecessor, evaluated


def _candidate_proof(quality: int, metrics: dict[str, Any]) -> dict[str, Any]:
    frames = metrics.get("perFrame") if isinstance(metrics.get("perFrame"), list) else []
    failing_frames = [int(frame["index"]) for frame in frames if not frame.get("passes", False)]
    return {
        "quality": quality,
        "passes": bool(metrics["passes"]),
        "foregroundMAE": metrics["foregroundMAE"],
        "foregroundPSNR": metrics["foregroundPSNR"],
        "alphaMAE": metrics["alphaMAE"],
        "failingFrames": failing_frames,
    }


def validate_encoding_evidence(encoding: dict[str, Any], frame_count: int) -> None:
    """Reject internally inconsistent candidate or per-frame codec proof."""

    thresholds = encoding["thresholds"]
    selection = encoding["selection"]
    candidates = selection.get("candidateQualities")
    evaluated = selection.get("evaluatedQualities")
    proofs = selection.get("candidateProofs")
    if not isinstance(candidates, list) or candidates != sorted(set(candidates)) or not candidates:
        raise RuntimeError("codec candidate list is not deterministic ascending unique")
    if candidates[-1] != 100 or not isinstance(evaluated, list) or evaluated != candidates[: len(evaluated)]:
        raise RuntimeError("codec evaluated candidates are not a declared prefix ending at selection")
    if not isinstance(proofs, list) or [proof.get("quality") for proof in proofs] != evaluated:
        raise RuntimeError("codec candidate proofs do not match evaluated candidates")
    for proof in proofs:
        metric_failure = (
            proof.get("alphaMAE") != thresholds["alphaMAE"]
            or float(proof.get("foregroundMAE", float("inf"))) > thresholds["foregroundMAEMax"]
            or (proof.get("foregroundPSNR") is not None
                and float(proof["foregroundPSNR"]) < thresholds["foregroundPSNRMin"])
        )
        failing_frames = proof.get("failingFrames")
        if proof.get("passes") is True:
            if metric_failure or failing_frames != []:
                raise RuntimeError("passing codec candidate has contradictory metric proof")
        elif not metric_failure or not isinstance(failing_frames, list) or not failing_frames:
            raise RuntimeError("failed codec candidate has no metric/frame failure proof")
    selected = selection.get("selectedQuality")
    if encoding["rgb"]["lossy"]:
        if (selection.get("claim") != "first-passing-declared-candidate"
            or not proofs
            or selected != evaluated[-1]
            or not proofs[-1].get("passes")
            or any(proof.get("passes") for proof in proofs[:-1])):
            raise RuntimeError("codec selected quality is not the first passing declared candidate")
    elif (selected is not None or selection.get("claim") != "declared-candidates-exhausted"
        or evaluated != candidates or any(proof.get("passes") for proof in proofs)):
        raise RuntimeError("lossless fallback did not exhaust all declared lossy candidates")
    expected_predecessor = proofs[-2] if encoding["rgb"]["lossy"] and len(proofs) > 1 else (
        proofs[-1] if not encoding["rgb"]["lossy"] else None
    )
    predecessor = selection.get("predecessor")
    if (predecessor is None) != (expected_predecessor is None):
        raise RuntimeError("codec predecessor proof is missing or unexpected")
    if predecessor and (predecessor.get("quality") != expected_predecessor.get("quality")
        or predecessor.get("passes") is not False
        or any(predecessor.get(key) != expected_predecessor.get(key) for key in (
            "foregroundMAE", "foregroundPSNR", "alphaMAE", "failingFrames"
        ))):
        raise RuntimeError("codec predecessor proof does not identify the last failing candidate")

    frames = encoding.get("frameGate", {}).get("frames")
    if (not isinstance(frames, list) or len(frames) != frame_count
        or [frame.get("index") for frame in frames] != list(range(frame_count))):
        raise RuntimeError("codec per-frame proof is incomplete")
    if not encoding["frameGate"].get("allFramesPassed") or any(not frame.get("passes") for frame in frames):
        raise RuntimeError("selected codec does not pass every frame")
    if any(
        frame["alphaMAE"] != thresholds["alphaMAE"]
        or float(frame["foregroundMAE"]) > thresholds["foregroundMAEMax"]
        or (frame["foregroundPSNR"] is not None
            and float(frame["foregroundPSNR"]) < thresholds["foregroundPSNRMin"])
        for frame in frames
    ):
        raise RuntimeError("selected codec per-frame metrics violate thresholds")


def select_clip_encoding(
    pack: PackedClip,
    max_mae: float,
    min_psnr: float,
    quality_hint: int = 92,
) -> tuple[list[bytes], dict[str, Any]]:
    cache: dict[int, tuple[list[bytes], dict[str, Any]]] = {}

    def evaluate(quality: int) -> dict[str, Any]:
        if quality not in cache:
            blobs = [encode_webp(page, quality) for page in pack.pages]
            metrics = codec_metrics(pack, blobs)
            per_frame = [
                {
                    **frame,
                    "passes": codec_passes(frame, max_mae, min_psnr),
                }
                for frame in metrics["perFrame"]
            ]
            cache[quality] = (
                blobs,
                {
                    **metrics,
                    "perFrame": per_frame,
                    "passes": all(frame["passes"] for frame in per_frame),
                },
            )
        return cache[quality][1]

    candidates = tuple(sorted({
        *QUALITY_CANDIDATES,
        *((quality_hint,) if quality_hint >= QUALITY_CANDIDATES[0] else ()),
    }))
    quality, predecessor, evaluated = find_quality_boundary(evaluate, candidates)
    if quality is None:
        selected = [encode_webp(page, None) for page in pack.pages]
        metrics = codec_metrics(pack, selected)
        metrics["perFrame"] = [
            {**frame, "passes": codec_passes(frame, max_mae, min_psnr)}
            for frame in metrics["perFrame"]
        ]
        if not metrics["canonicalRGBAExact"]:
            raise RuntimeError("lossless WebP did not reconstruct canonical RGBA exactly")
        selected_quality: int | None = None
        lossy = False
        strategy = "lossless-fallback"
    else:
        selected = cache[quality][0]
        metrics = cache[quality][1]
        selected_quality = quality
        lossy = True
        strategy = "lowest-passing-quality"
    if not codec_passes(metrics, max_mae, min_psnr):
        raise RuntimeError(f"codec gate failed after selection: {metrics}")

    proof = None
    if predecessor is not None:
        predecessor_quality = 100 if quality is None else evaluated[-2]
        proof = _candidate_proof(predecessor_quality, predecessor)
        if proof["passes"]:
            raise RuntimeError("codec predecessor unexpectedly passes")

    encoding = {
        "format": "WebP",
        "rgb": {
            "lossy": lossy,
            "quality": selected_quality,
            "foregroundMAE": metrics["foregroundMAE"],
            "foregroundPSNR": metrics["foregroundPSNR"],
        },
        "alpha": {"lossless": True, "meanAbsoluteError": metrics["alphaMAE"]},
        "thresholds": {
            "foregroundMAEMax": max_mae,
            "foregroundPSNRMin": min_psnr,
            "alphaMAE": 0.0,
        },
        "selection": {
            "strategy": strategy,
            "claim": "first-passing-declared-candidate" if lossy else "declared-candidates-exhausted",
            "candidateQualities": list(candidates),
            "selectedQuality": selected_quality,
            "predecessor": proof,
            "evaluatedQualities": evaluated,
            "candidateProofs": [_candidate_proof(quality, cache[quality][1]) for quality in evaluated],
        },
        "frameGate": {
            "foregroundAlpha": ">0",
            "allFramesPassed": codec_passes(metrics, max_mae, min_psnr),
            "frames": metrics["perFrame"],
        },
    }
    validate_encoding_evidence(encoding, len(pack.frames))
    return selected, encoding


def main():
    args = parse_args()
    report_path = args.source / args.variant / "render-report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    if report.get("schemaVersion") != 2 or report.get("variant") != args.variant:
        raise RuntimeError(
            f"render report variant mismatch: requested {args.variant!r}, found {report.get('variant')!r}"
        )
    width = int(report["canvas"]["width"])
    height = int(report["canvas"]["height"])
    fps = int(report["fps"])
    anchor = report["anchor"]
    verified_provenance = validate_report_provenance(report)
    clip_lineage = validate_report_lineage(report)
    render_report_sha256 = file_sha256(report_path)
    out_root = args.public / args.variant
    atlas_root = out_root / "atlases"
    requested_clips = set(args.clips or [])
    guard_partial_publish(out_root, requested_clips)
    out_root.mkdir(parents=True, exist_ok=True)
    atlas_root.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=".atlas-build-", dir=out_root) as temporary:
        temp_root = Path(temporary)
        temp_atlas_root = temp_root / "atlases"
        temp_atlas_root.mkdir()
        clips: dict[str, Any] = {}
        top_controls: set[str] = set()
        top_channels: set[str] = set()
        top_regions: set[str] = set()
        pending_pages: list[tuple[Path, Path]] = []
        new_page_names: set[str] = set()
        page_hashes: dict[str, str] = {}
        source_hash_digests: dict[str, str] = {}

        for clip, rendered in sorted(report["clips"].items()):
            if requested_clips and clip not in requested_clips:
                continue
            variant_source_root = (args.source / args.variant).resolve()
            source_dir = (REPO / rendered["sourceDirectory"]).resolve()
            if source_dir.parent != variant_source_root or source_dir.name.startswith("_"):
                raise RuntimeError(f"{clip}: source directory escapes production variant root: {source_dir}")
            source_paths = sorted(source_dir.glob("*.png"))
            if len(source_paths) != rendered["frameCount"]:
                raise RuntimeError(
                    f"{clip}: expected {rendered['frameCount']} source frames, found {len(source_paths)}"
                )
            verified_source_hashes = validate_source_frame_hashes(clip, rendered, source_paths)
            source_hash_digests[clip] = frame_hash_digest(verified_source_hashes)
            sources = source_frames(source_paths, (width, height))
            pack = pack_trimmed_frames(sources, (width, height))
            if not geometry_is_exact(pack):
                raise RuntimeError(f"{clip}: trimmed packing does not exactly reconstruct canonical RGBA")
            encoded_pages, encoding = select_clip_encoding(
                pack,
                max_mae=args.max_foreground_mae,
                min_psnr=args.min_foreground_psnr,
                quality_hint=args.webp_quality,
            )

            pages: list[dict[str, Any]] = []
            for page_index, (page, blob) in enumerate(zip(pack.pages, encoded_pages, strict=True)):
                content_hash = hashlib.sha256(blob).hexdigest()
                filename = f"{clip}-{page_index}-{content_hash[:12]}.webp"
                temp_path = temp_atlas_root / filename
                temp_path.write_bytes(blob)
                final_path = atlas_root / filename
                decoded_bytes = page.width * page.height * 4
                if decoded_bytes > MAX_DECODED_PAGE_BYTES:
                    raise RuntimeError(f"{clip}: page {page_index} exceeds decoded byte cap")
                pages.append(
                    {
                        "src": f"/assets/niumpi/v2/{args.variant}/atlases/{filename}",
                        "width": page.width,
                        "height": page.height,
                        "decodedBytes": decoded_bytes,
                        "sha256": content_hash,
                    }
                )
                page_hashes[f"{clip}:{page_index}"] = content_hash
                pending_pages.append((temp_path, final_path))
                new_page_names.add(filename)
                print(
                    f"NIUMPI_ATLAS_PAGE clip={clip} page={page_index} "
                    f"atlas={page.width}x{page.height} decodedBytes={decoded_bytes}"
                )

            frames = [
                {
                    "index": mapping.index,
                    "page": mapping.page,
                    "x": mapping.x,
                    "y": mapping.y,
                    "w": mapping.w,
                    "h": mapping.h,
                    "offsetX": mapping.offset_x,
                    "offsetY": mapping.offset_y,
                    "anchorX": int(anchor["x"]),
                    "anchorY": int(anchor["y"]),
                    "durationMs": round(1000 / fps, 3),
                }
                for mapping in pack.frames
            ]
            rig_proof = {
                "animatedControls": rendered["animatedControls"],
                "animatedChannels": rendered["animatedChannels"],
                "regions": rendered["regions"],
            }
            if clip == "blink":
                rig_proof["blinkClosure"] = float(rendered["blinkClosure"])
            top_controls.update(rig_proof["animatedControls"])
            top_channels.update(rig_proof["animatedChannels"])
            top_regions.update(rig_proof["regions"])
            clips[clip] = {
                "name": clip,
                "fps": fps,
                "frameCount": len(sources),
                "durationMs": round(len(sources) * 1000 / fps, 3),
                "loop": rendered["loop"],
                "transition": rendered["transition"],
                "atlas": {"pages": pages},
                "frames": frames,
                "events": [
                    dict(event, frame=max(0, int(event["frame"]) - 1))
                    for event in rendered["events"]
                ],
                "rigProof": rig_proof,
                "encoding": encoding,
            }
            if "playback" in rendered:
                clips[clip]["playback"] = rendered["playback"]
            for range_name in ("loopRange", "exitRange"):
                if range_name in rendered:
                    clips[clip][range_name] = rendered[range_name]

        manifest = {
            "schemaVersion": 3,
            "variant": args.variant,
            "fps": fps,
            "canvas": {"width": width, "height": height},
            "anchor": {"x": int(anchor["x"]), "y": int(anchor["y"])},
            "packing": packing_contract(),
            "clips": clips,
            "rigProof": {
                "animatedControls": sorted(top_controls),
                "animatedChannels": sorted(top_channels),
                "regions": sorted(top_regions),
            },
            "provenance": {
                "master": report["provenance"]["master"],
                "approvedArt": report["provenance"]["approvedArt"],
                "renderer": "Blender frame_set + depsgraph",
                "renderReport": report.get("provenance", {}),
                "renderReportSha256": render_report_sha256,
                "currentInputs": verified_provenance,
                "sourceFrameHashDigests": source_hash_digests,
                "clipLineage": clip_lineage,
                "packerSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                "sha256": page_hashes,
            },
        }
        temp_manifest = temp_root / "manifest.json"
        temp_manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

        for temp_path, final_path in pending_pages:
            os.replace(temp_path, final_path)
        os.replace(temp_manifest, out_root / "manifest.json")

        # Content-addressed predecessors remain available for tabs that loaded
        # the previous manifest before this atomic swap. A separately versioned
        # retention policy may garbage-collect them after the rollout window;
        # the packer itself never creates stale-session 404s.
        retained_predecessors = sum(
            1 for existing in atlas_root.glob("*.webp") if existing.name not in new_page_names
        )

    manifest_path = out_root / "manifest.json"
    try:
        manifest_label = manifest_path.relative_to(REPO)
    except ValueError:
        # Fragment jobs intentionally stage outside the repository.  A valid
        # build must not fail only because its diagnostic path is external.
        manifest_label = manifest_path
    print(
        f"NIUMPI_ATLASES_OK manifest={manifest_label} "
        f"clips={len(clips)} pages={sum(len(item['atlas']['pages']) for item in clips.values())} "
        f"retainedPredecessorPages={retained_predecessors}"
    )


if __name__ == "__main__":
    main()
