#!/usr/bin/env python3
"""Build Niumpi atlas fragments in parallel and publish them transactionally.

The regular atlas builder intentionally owns one output manifest.  This
orchestrator gives every ``build_atlases.py --clips`` subprocess a fresh,
isolated public root, validates the fragment against its render report, merges
all fragments deterministically, and only then offers a pages-first /
manifest-last activation step.

The CLI is dry-run by default.  ``--publish`` is accepted only when every clip
from each selected render report was packed, so a semantic-only invocation can
never replace a complete production manifest.
"""

from __future__ import annotations

import argparse
import copy
import fcntl
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from contextlib import contextmanager, nullcontext
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterable, Mapping, Sequence

REPO = Path(__file__).resolve().parents[2]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))

from scripts.niumpi.variant_clip_contract import (  # noqa: E402
    SEMANTIC_REQUIRED_CLIPS,
    required_clips_for_variant,
    validate_semantic_clip_metadata,
)

SOURCE_ROOT = REPO / "art/niumpi/rendered-source"
PUBLIC_ROOT = REPO / "public/assets/niumpi/v2"
PACKER_PATH = REPO / "scripts/niumpi/build_atlases.py"
MAX_WORKERS = 3
MAX_DECODED_PAGE_BYTES = 44_040_192
SHA256_HEX_LENGTH = 64
MANIFEST_NAME = "manifest.json"
ATLAS_DIRECTORY = "atlases"
STAGING_PREFIX = ".atlas-orchestrator-"
VARIANT_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
CLIP_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")
DIRECT_PACKER_PATTERN = re.compile(r"(?:^|\s)(?:\S*/)?python\S*\s+\S*build_atlases\.py(?:\s|$)")
PRODUCTION_VARIANTS = frozenset(
    {
        "baby",
        "stage-2",
        "stage-3",
        "stage-4",
        "stage-5",
        "moonveil",
        "bloomheart",
        "sparkleap",
        "mistwander",
        "prismatic",
    }
)
_GLOBAL_WORKER_SLOTS = threading.BoundedSemaphore(MAX_WORKERS)
_PIPELINE_LOCKS_GUARD = threading.Lock()
_PIPELINE_LOCKS: dict[str, threading.Lock] = {}


class OrchestrationError(RuntimeError):
    """Fail-closed error raised before a production manifest is activated."""


@dataclass(frozen=True)
class PackJob:
    index: int
    variant: str
    clips: tuple[str, ...]
    source_root: Path
    public_root: Path
    packer_path: Path = PACKER_PATH
    python_executable: str = sys.executable
    webp_quality: int = 92
    repo: Path = REPO

    @property
    def output_root(self) -> Path:
        return self.public_root / self.variant

    @property
    def manifest_path(self) -> Path:
        return self.output_root / MANIFEST_NAME

    def command(self) -> list[str]:
        return [
            self.python_executable,
            str(self.packer_path),
            "--variant",
            self.variant,
            "--source",
            str(self.source_root),
            "--public",
            str(self.public_root),
            "--clips",
            *self.clips,
            "--webp-quality",
            str(self.webp_quality),
        ]


@dataclass(frozen=True)
class PartialPack:
    job: PackJob
    manifest: dict[str, Any]
    manifest_path: Path
    pages: Mapping[str, Path]


@dataclass(frozen=True)
class MergedVariant:
    variant: str
    manifest: dict[str, Any]
    pages: Mapping[str, Path]

    def manifest_bytes(self) -> bytes:
        return canonical_json_bytes(self.manifest)


Runner = Callable[[PackJob], PartialPack]
CodecValidator = Callable[
    [str, dict[str, Any], Sequence[Path], Mapping[str, Path], tuple[int, int]],
    None,
]
ReplaceFile = Callable[[str | os.PathLike[str], str | os.PathLike[str]], None]
FsyncDirectory = Callable[[Path], None]
RetireFile = Callable[[Path, Path], None]


def canonical_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _is_sha256(value: Any) -> bool:
    if not isinstance(value, str) or len(value) != SHA256_HEX_LENGTH:
        return False
    try:
        int(value, 16)
    except ValueError:
        return False
    return value == value.lower()


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise OrchestrationError(message)


def _require_safe_variant(variant: Any) -> str:
    _require(
        isinstance(variant, str) and bool(VARIANT_PATTERN.fullmatch(variant)),
        f"unsafe variant id: {variant!r}",
    )
    return variant


def _require_safe_clip(clip: Any) -> str:
    _require(
        isinstance(clip, str) and bool(CLIP_PATTERN.fullmatch(clip)),
        f"unsafe clip id: {clip!r}",
    )
    return clip


def _pipeline_lock_path(public_root: Path) -> Path:
    identity = hashlib.sha256(str(public_root.resolve()).encode("utf-8")).hexdigest()[:24]
    directory = Path(tempfile.gettempdir()) / "niumpi-atlas-pipeline-locks"
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    return directory / f"{identity}.lock"


@contextmanager
def pipeline_lock(public_root: Path, *, timeout_seconds: float = 0.0):
    """Exclusive in-process and cross-process lock outside deployable assets."""

    identity = str(public_root.resolve())
    with _PIPELINE_LOCKS_GUARD:
        local_lock = _PIPELINE_LOCKS.setdefault(identity, threading.Lock())
    acquired = local_lock.acquire(timeout=max(0.0, timeout_seconds))
    if not acquired:
        raise OrchestrationError("another atlas pipeline already owns the publish root")
    descriptor: int | None = None
    try:
        lock_path = _pipeline_lock_path(public_root)
        descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        deadline = time.monotonic() + max(0.0, timeout_seconds)
        while True:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError as error:
                if time.monotonic() >= deadline:
                    raise OrchestrationError(
                        "another atlas process already owns the publish root"
                    ) from error
                time.sleep(0.05)
        yield
    finally:
        if descriptor is not None:
            try:
                fcntl.flock(descriptor, fcntl.LOCK_UN)
            finally:
                os.close(descriptor)
        local_lock.release()


def direct_packer_processes(process_output: str | None = None) -> list[str]:
    if process_output is None:
        completed = subprocess.run(
            ["ps", "-axo", "pid=,args="],
            check=False,
            capture_output=True,
            text=True,
        )
        _require(completed.returncode == 0, "cannot inspect direct atlas-builder processes")
        process_output = completed.stdout
    return [
        line.strip()
        for line in process_output.splitlines()
        if DIRECT_PACKER_PATTERN.search(line) and not line.lstrip().startswith(f"{os.getpid()} ")
    ]


def production_preflight(public_root: Path, *, process_output: str | None = None) -> None:
    active_staging = sorted(public_root.rglob(".atlas-build-*")) if public_root.exists() else []
    _require(
        not active_staging,
        "direct atlas builder has active staging: "
        + ", ".join(path.relative_to(public_root).as_posix() for path in active_staging),
    )
    active_processes = direct_packer_processes(process_output)
    _require(
        not active_processes,
        "direct build_atlases.py process is active: " + " | ".join(active_processes),
    )


def validate_report_for_publication(variant: str, report: dict[str, Any]) -> tuple[str, ...]:
    _require(variant in PRODUCTION_VARIANTS, f"unsupported production variant: {variant}")
    clips = report.get("clips")
    _require(isinstance(clips, dict), f"{variant}: render report clips must be an object")
    for name in clips:
        _require_safe_clip(name)
    canonical = required_clips_for_variant(variant, require_semantic=True)
    _require(
        set(clips) == set(canonical),
        f"{variant}: publication clip set is not canonical; "
        f"missing={sorted(set(canonical) - set(clips))} extra={sorted(set(clips) - set(canonical))}",
    )
    for name in SEMANTIC_REQUIRED_CLIPS:
        report_clip = clips[name]
        semantic_view = {
            **report_clip,
            "fps": report.get("fps"),
            "durationMs": round(int(report_clip["frameCount"]) * 1000 / int(report["fps"]), 3),
            "events": _expected_events(report_clip),
        }
        reasons = validate_semantic_clip_metadata(name, semantic_view)
        _require(not reasons, f"{variant}/{name}: semantic metadata invalid: {'; '.join(reasons)}")
    return canonical


def _load_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OrchestrationError(f"{label} is unreadable: {path}: {error}") from error
    if not isinstance(value, dict):
        raise OrchestrationError(f"{label} must be a JSON object: {path}")
    return value


def _safe_repo_file(repo: Path, value: Any, label: str) -> Path:
    _require(isinstance(value, str) and bool(value), f"missing {label} path")
    root = repo.resolve()
    path = (root / value).resolve()
    _require(path.is_relative_to(root) and path.is_file(), f"{label} is not a repository file: {value!r}")
    return path


def _report_path(job: PackJob) -> Path:
    return job.source_root / job.variant / "render-report.json"


def _source_paths(job: PackJob, clip_name: str, clip_report: dict[str, Any]) -> list[Path]:
    value = clip_report.get("sourceDirectory")
    _require(isinstance(value, str) and value, f"{job.variant}/{clip_name}: missing sourceDirectory")
    directory = (job.repo / value).resolve()
    variant_root = (job.source_root / job.variant).resolve()
    _require(
        directory.parent == variant_root and not directory.name.startswith("_") and directory.is_dir(),
        f"{job.variant}/{clip_name}: sourceDirectory escapes the production variant root",
    )
    paths = sorted(directory.glob("*.png"))
    _require(
        len(paths) == clip_report.get("frameCount"),
        f"{job.variant}/{clip_name}: source frame count mismatch",
    )
    return paths


def _frame_hash_digest(frame_hashes: Sequence[str]) -> str:
    return hashlib.sha256("".join(frame_hashes).encode("ascii")).hexdigest()


def _expected_lineage(report: dict[str, Any]) -> dict[str, str]:
    clips = report.get("clips")
    _require(isinstance(clips, dict), "render report clips must be an object")
    provenance = report.get("provenance")
    _require(isinstance(provenance, dict), "render report provenance must be an object")
    predecessor = provenance.get("corePredecessor")
    semantic = provenance.get("semanticBatch")
    if predecessor is None and semantic is None:
        return {name: "current" for name in sorted(clips)}
    _require(
        isinstance(predecessor, dict) and isinstance(semantic, dict),
        "mixed report must declare corePredecessor and semanticBatch together",
    )
    preserved = predecessor.get("preservedClips")
    semantic_clips = semantic.get("clips")
    digests = predecessor.get("clipFrameHashDigests")
    prior = predecessor.get("reportProvenance")
    _require(
        isinstance(preserved, list)
        and all(isinstance(name, str) for name in preserved)
        and isinstance(semantic_clips, list)
        and all(isinstance(name, str) for name in semantic_clips)
        and isinstance(digests, dict)
        and isinstance(prior, dict),
        "mixed report lineage is incomplete",
    )
    _require(len(set(preserved)) == len(preserved), "mixed report repeats a preserved clip")
    _require(len(set(semantic_clips)) == len(semantic_clips), "mixed report repeats a semantic clip")
    _require(
        not (set(preserved) & set(semantic_clips))
        and set(preserved) | set(semantic_clips) == set(clips),
        "mixed report lineage does not partition every clip",
    )
    _require(set(digests) == set(preserved), "mixed report predecessor digest keys mismatch")
    for sha_name in (
        "masterSha256",
        "generatorSha256",
        "approvedArtSha256",
        "landmarksSha256",
    ):
        _require(
            _is_sha256(prior.get(sha_name)),
            f"mixed report predecessor has invalid {sha_name}",
        )
    for name in preserved:
        hashes = clips[name].get("frameHashes")
        _require(
            isinstance(hashes, list) and digests.get(name) == _frame_hash_digest(hashes),
            f"mixed report predecessor digest mismatch for {name}",
        )
    semantic_frames = sum(int(clips[name]["frameCount"]) for name in semantic_clips)
    _require(semantic.get("frameCount") == semantic_frames, "semanticBatch frameCount mismatch")
    return {
        **{name: "corePredecessor" for name in preserved},
        **{name: "current" for name in semantic_clips},
    }


def _expected_current_inputs(report: dict[str, Any], repo: Path) -> dict[str, str]:
    provenance = report["provenance"]
    result: dict[str, str] = {}
    for path_key, sha_key in (
        ("master", "masterSha256"),
        ("approvedArt", "approvedArtSha256"),
    ):
        path = _safe_repo_file(repo, provenance.get(path_key), path_key)
        expected = provenance.get(sha_key)
        _require(_is_sha256(expected), f"render report has invalid {sha_key}")
        actual = file_sha256(path)
        _require(actual == expected, f"render report {path_key} sha256 mismatch")
        result[sha_key] = actual
    landmarks = repo / "art/niumpi/variant-landmarks.json"
    _require(landmarks.is_file(), "variant landmarks are missing")
    expected_landmarks = provenance.get("landmarksSha256")
    _require(_is_sha256(expected_landmarks), "render report has invalid landmarksSha256")
    actual_landmarks = file_sha256(landmarks)
    _require(actual_landmarks == expected_landmarks, "render report landmarks sha256 mismatch")
    result["landmarksSha256"] = actual_landmarks

    # Reproduce the generator digest without importing Blender-dependent code.
    generator_sources = (
        "scripts/niumpi/build_rig.py",
        "scripts/niumpi/build_actions.py",
        "scripts/niumpi/render_actions.py",
        "scripts/niumpi/build_variant_rig.py",
        "scripts/niumpi/variant_clip_contract.py",
    )
    generator_digest = hashlib.sha256()
    for relative in generator_sources:
        path = repo / relative
        _require(path.is_file(), f"generator source is missing: {relative}")
        generator_digest.update(relative.encode("utf-8"))
        generator_digest.update(b"\0")
        generator_digest.update(path.read_bytes())
        generator_digest.update(b"\0")
    actual_generator = generator_digest.hexdigest()
    expected_generator = provenance.get("generatorSha256")
    _require(_is_sha256(expected_generator), "render report has invalid generatorSha256")
    _require(actual_generator == expected_generator, "render report generator sha256 mismatch")
    result["generatorSha256"] = actual_generator
    return result


def _expected_events(clip_report: dict[str, Any]) -> list[dict[str, Any]]:
    events = clip_report.get("events")
    _require(isinstance(events, list), "render report events must be a list")
    converted: list[dict[str, Any]] = []
    for event in events:
        _require(isinstance(event, dict) and isinstance(event.get("frame"), int), "invalid render event")
        converted.append({**event, "frame": max(0, int(event["frame"]) - 1)})
    return converted


def _expected_rig_proof(clip_name: str, report_clip: dict[str, Any]) -> dict[str, Any]:
    proof = {
        "animatedControls": report_clip.get("animatedControls"),
        "animatedChannels": report_clip.get("animatedChannels"),
        "regions": report_clip.get("regions"),
    }
    for key, value in proof.items():
        _require(
            isinstance(value, list)
            and all(isinstance(item, str) for item in value)
            and len(value) == len(set(value)),
            f"{clip_name}: invalid {key} rig proof",
        )
    if clip_name == "blink":
        closure = report_clip.get("blinkClosure")
        _require(isinstance(closure, (int, float)), "blink: missing blinkClosure")
        proof["blinkClosure"] = float(closure)
    return proof


def _atlas_filename(variant: str, clip_name: str, page_index: int, page: dict[str, Any]) -> str:
    _require(set(page) == {"src", "width", "height", "decodedBytes", "sha256"},
             f"{variant}/{clip_name}: atlas page has an unexpected schema")
    sha = page.get("sha256")
    _require(_is_sha256(sha), f"{variant}/{clip_name}: invalid atlas sha256")
    src = page.get("src")
    _require(isinstance(src, str), f"{variant}/{clip_name}: atlas src must be a string")
    pure = PurePosixPath(src)
    _require(
        pure.is_absolute()
        and ".." not in pure.parts
        and pure.parent == PurePosixPath(f"/assets/niumpi/v2/{variant}/atlases"),
        f"{variant}/{clip_name}: atlas src escapes its variant directory",
    )
    expected_name = f"{clip_name}-{page_index}-{sha[:12]}.webp"
    _require(pure.name == expected_name, f"{variant}/{clip_name}: non-deterministic atlas filename")
    return pure.name


def _metric_equal(left: Any, right: Any, tolerance: float = 5e-6) -> bool:
    if left is None or right is None:
        return left is right
    if left == "inf" or right == "inf":
        return left == right
    try:
        return math.isclose(float(left), float(right), abs_tol=tolerance, rel_tol=0.0)
    except (TypeError, ValueError):
        return False


def validate_codec_reconstruction(
    clip_name: str,
    clip: dict[str, Any],
    sources: Sequence[Path],
    page_files: Mapping[str, Path],
    canvas: tuple[int, int],
) -> None:
    """Independently decode every v3 frame and verify its codec evidence."""

    try:
        import numpy as np
        from PIL import Image
    except ImportError as error:  # keep --help usable in the system interpreter
        raise OrchestrationError(
            "codec validation requires NumPy and Pillow; run with the animation Python environment"
        ) from error

    pages = clip["atlas"]["pages"]
    decoded: list[Image.Image] = []
    for page in pages:
        name = PurePosixPath(page["src"]).name
        with Image.open(page_files[name]) as opened:
            decoded.append(opened.convert("RGBA"))

    evidence: list[dict[str, Any]] = []
    for index, (frame, source_path) in enumerate(zip(clip["frames"], sources, strict=True)):
        page_index = frame["page"]
        crop = decoded[page_index].crop(
            (frame["x"], frame["y"], frame["x"] + frame["w"], frame["y"] + frame["h"])
        )
        reconstructed = Image.new("RGBA", canvas, (0, 0, 0, 0))
        reconstructed.paste(crop, (frame["offsetX"], frame["offsetY"]))
        with Image.open(source_path) as opened:
            source = opened.convert("RGBA")
        _require(source.size == canvas, f"{clip_name}: source {index} canvas mismatch")
        actual = np.asarray(reconstructed, dtype=np.int16)
        expected = np.asarray(source, dtype=np.int16)
        alpha_mae = float(np.abs(actual[..., 3] - expected[..., 3]).mean())
        foreground = expected[..., 3] > 0
        if foreground.any():
            delta = actual[..., :3][foreground].astype(np.float64) - expected[..., :3][foreground].astype(np.float64)
            rgb_mae = float(np.abs(delta).mean())
            mse = float(np.square(delta).mean())
            psnr: float | None = None if mse == 0 else 10 * math.log10((255.0**2) / mse)
        else:
            rgb_mae = 0.0
            psnr = None
        passes = alpha_mae == 0 and rgb_mae <= 2.5 and (psnr is None or psnr >= 38.0)
        _require(passes, f"{clip_name}: codec Gate C failed at frame {index}")
        evidence.append(
            {
                "index": index,
                "passes": True,
                "foregroundMAE": round(rgb_mae, 6),
                "foregroundPSNR": None if psnr is None else round(psnr, 6),
                "alphaMAE": round(alpha_mae, 10),
            }
        )

    encoding = clip.get("encoding")
    _require(isinstance(encoding, dict), f"{clip_name}: missing schema-v3 encoding proof")
    thresholds = encoding.get("thresholds")
    _require(
        thresholds == {"foregroundMAEMax": 2.5, "foregroundPSNRMin": 38.0, "alphaMAE": 0.0},
        f"{clip_name}: codec thresholds differ from Gate C",
    )
    frame_gate = encoding.get("frameGate")
    _require(
        isinstance(frame_gate, dict)
        and frame_gate.get("foregroundAlpha") == ">0"
        and frame_gate.get("allFramesPassed") is True,
        f"{clip_name}: invalid per-frame codec gate",
    )
    declared = frame_gate.get("frames")
    _require(isinstance(declared, list) and len(declared) == len(evidence),
             f"{clip_name}: incomplete per-frame codec evidence")
    for actual, expected_frame in zip(evidence, declared, strict=True):
        _require(expected_frame.get("index") == actual["index"] and expected_frame.get("passes") is True,
                 f"{clip_name}: codec evidence index/result mismatch")
        for key in ("foregroundMAE", "foregroundPSNR", "alphaMAE"):
            _require(_metric_equal(expected_frame.get(key), actual[key]),
                     f"{clip_name}: codec evidence {key} mismatch at frame {actual['index']}")
    rgb = encoding.get("rgb")
    alpha = encoding.get("alpha")
    _require(isinstance(rgb, dict) and isinstance(alpha, dict), f"{clip_name}: invalid codec summary")
    _require(
        encoding.get("format") == "WebP" and alpha.get("lossless") is True,
        f"{clip_name}: codec format/alpha contract is invalid",
    )
    max_mae = max(float(frame["foregroundMAE"]) for frame in evidence)
    finite_psnr = [float(frame["foregroundPSNR"]) for frame in evidence if frame["foregroundPSNR"] is not None]
    min_psnr = min(finite_psnr) if finite_psnr else None
    max_alpha = max(float(frame["alphaMAE"]) for frame in evidence)
    _require(
        _metric_equal(rgb.get("foregroundMAE"), max_mae)
        and _metric_equal(rgb.get("foregroundPSNR"), min_psnr)
        and _metric_equal(alpha.get("meanAbsoluteError"), max_alpha, 1e-10),
        f"{clip_name}: codec summary disagrees with decoded frames",
    )

    selection = encoding.get("selection")
    _require(isinstance(selection, dict), f"{clip_name}: codec selection proof is missing")
    candidates = selection.get("candidateQualities")
    evaluated = selection.get("evaluatedQualities")
    proofs = selection.get("candidateProofs")
    _require(
        isinstance(candidates, list)
        and candidates == sorted(set(candidates))
        and bool(candidates)
        and candidates[-1] == 100
        and all(isinstance(value, int) and 1 <= value <= 100 for value in candidates),
        f"{clip_name}: codec candidates are not deterministic ascending values",
    )
    _require(
        isinstance(evaluated, list)
        and evaluated == candidates[: len(evaluated)]
        and isinstance(proofs, list)
        and [proof.get("quality") for proof in proofs if isinstance(proof, dict)] == evaluated,
        f"{clip_name}: evaluated codec proof is not a candidate prefix",
    )
    _require(proofs and evaluated, f"{clip_name}: codec candidate proof is empty")
    for proof in proofs:
        _require(isinstance(proof, dict), f"{clip_name}: malformed codec candidate proof")
        metric_failure = (
            proof.get("alphaMAE") != 0.0
            or float(proof.get("foregroundMAE", float("inf"))) > 2.5
            or (
                proof.get("foregroundPSNR") is not None
                and float(proof["foregroundPSNR"]) < 38.0
            )
        )
        failing = proof.get("failingFrames")
        if proof.get("passes") is True:
            _require(not metric_failure and failing == [],
                     f"{clip_name}: passing codec candidate contradicts its metrics")
        else:
            _require(metric_failure and isinstance(failing, list) and bool(failing),
                     f"{clip_name}: failed codec candidate lacks failure evidence")
    lossy = rgb.get("lossy")
    selected = selection.get("selectedQuality")
    predecessor = selection.get("predecessor")
    if lossy is True:
        _require(
            selection.get("strategy") == "lowest-passing-quality"
            and selection.get("claim") == "first-passing-declared-candidate"
            and selected == rgb.get("quality") == evaluated[-1]
            and proofs[-1].get("passes") is True
            and not any(proof.get("passes") for proof in proofs[:-1]),
            f"{clip_name}: selected codec is not the first passing declared candidate",
        )
        expected_predecessor = proofs[-2] if len(proofs) > 1 else None
    else:
        _require(
            lossy is False
            and selection.get("strategy") == "lossless-fallback"
            and rgb.get("quality") is None
            and selected is None
            and selection.get("claim") == "declared-candidates-exhausted"
            and evaluated == candidates
            and not any(proof.get("passes") for proof in proofs),
            f"{clip_name}: lossless fallback did not exhaust lossy candidates",
        )
        expected_predecessor = proofs[-1]
    _require(predecessor == expected_predecessor,
             f"{clip_name}: codec predecessor proof is missing or inconsistent")
    if lossy is True:
        _require(
            _metric_equal(proofs[-1].get("foregroundMAE"), rgb.get("foregroundMAE"))
            and _metric_equal(proofs[-1].get("foregroundPSNR"), rgb.get("foregroundPSNR"))
            and _metric_equal(proofs[-1].get("alphaMAE"), alpha.get("meanAbsoluteError"), 1e-10),
            f"{clip_name}: selected candidate proof disagrees with codec summary",
        )


def validate_partial_result(
    job: PackJob,
    *,
    codec_validator: CodecValidator = validate_codec_reconstruction,
) -> PartialPack:
    """Validate one isolated pack result against the current source report."""

    try:
        from PIL import Image
    except ImportError as error:
        raise OrchestrationError(
            "atlas validation requires Pillow; run with the animation Python environment"
        ) from error

    _require(job.clips and len(job.clips) == len(set(job.clips)), "pack job clips must be unique")
    _require_safe_variant(job.variant)
    for name in job.clips:
        _require_safe_clip(name)
    _require(job.manifest_path.is_file(), f"job {job.index} did not produce a manifest")
    manifest = _load_json(job.manifest_path, "partial atlas manifest")
    report_path = _report_path(job)
    report = _load_json(report_path, "render report")
    _require(report.get("schemaVersion") == 2, "render report schema must be 2")
    _require(report.get("variant") == job.variant, "render report variant mismatch")
    report_clips = report.get("clips")
    _require(isinstance(report_clips, dict), "render report clips must be an object")
    _require(set(job.clips).issubset(report_clips), "pack job requests an unknown report clip")

    _require(manifest.get("schemaVersion") == 3, "partial manifest must use schema 3")
    _require(manifest.get("variant") == job.variant, "partial manifest variant mismatch")
    _require(manifest.get("fps") == report.get("fps"), "partial manifest fps mismatch")
    _require(manifest.get("canvas") == report.get("canvas"), "partial manifest canvas mismatch")
    expected_anchor = {"x": int(report["anchor"]["x"]), "y": int(report["anchor"]["y"])}
    _require(manifest.get("anchor") == expected_anchor, "partial manifest anchor mismatch")
    packing = manifest.get("packing")
    _require(isinstance(packing, dict), "partial manifest packing contract is missing")
    _require(
        packing.get("mode") == "trimmed-rgba-v1"
        and packing.get("transparentRGB") == "zero-when-alpha-zero"
        and packing.get("sourceCanonicalization") == {
            "transparentRGB": "zero-when-alpha-zero",
            "stage": "pre-encode",
        }
        and packing.get("decodedTransparentRGB") == "unspecified-for-lossy-webp"
        and packing.get("gutterPx") == 4
        and packing.get("maxDecodedPageBytes") == MAX_DECODED_PAGE_BYTES,
        "partial manifest packing contract is invalid",
    )
    clips = manifest.get("clips")
    _require(isinstance(clips, dict) and set(clips) == set(job.clips),
             "partial manifest clips are missing or unexpected")
    _require(
        set(manifest) == {
            "schemaVersion", "variant", "fps", "canvas", "anchor", "packing",
            "clips", "rigProof", "provenance",
        },
        "partial manifest has an unexpected top-level schema",
    )

    expected_inputs = _expected_current_inputs(report, job.repo)
    lineage = _expected_lineage(report)
    provenance = manifest.get("provenance")
    _require(isinstance(provenance, dict), "partial manifest provenance is missing")
    expected_packer_sha = file_sha256(job.packer_path)
    exact_provenance = {
        "master": report["provenance"]["master"],
        "approvedArt": report["provenance"]["approvedArt"],
        "renderer": "Blender frame_set + depsgraph",
        "renderReport": report["provenance"],
        "renderReportSha256": file_sha256(report_path),
        "currentInputs": expected_inputs,
        "clipLineage": lineage,
        "packerSha256": expected_packer_sha,
    }
    for key, value in exact_provenance.items():
        _require(provenance.get(key) == value, f"partial manifest provenance mismatch: {key}")
    _require(
        set(provenance) == set(exact_provenance) | {"sourceFrameHashDigests", "sha256"},
        "partial manifest has unexpected provenance fields",
    )

    canvas = (int(report["canvas"]["width"]), int(report["canvas"]["height"]))
    expected_source_digests: dict[str, str] = {}
    expected_page_hashes: dict[str, str] = {}
    page_files: dict[str, Path] = {}
    top_controls: set[str] = set()
    top_channels: set[str] = set()
    top_regions: set[str] = set()

    for clip_name in sorted(job.clips):
        report_clip = report_clips[clip_name]
        clip = clips[clip_name]
        _require(isinstance(clip, dict), f"{clip_name}: clip manifest must be an object")
        source_paths = _source_paths(job, clip_name, report_clip)
        frame_hashes = report_clip.get("frameHashes")
        _require(isinstance(frame_hashes, list) and len(frame_hashes) == len(source_paths),
                 f"{clip_name}: invalid report frame hashes")
        actual_hashes = [file_sha256(path) for path in source_paths]
        _require(actual_hashes == frame_hashes, f"{clip_name}: source PNG hashes differ from render report")
        expected_source_digests[clip_name] = _frame_hash_digest(actual_hashes)

        expected_clip = {
            "name": clip_name,
            "fps": report["fps"],
            "frameCount": report_clip["frameCount"],
            "durationMs": round(report_clip["frameCount"] * 1000 / report["fps"], 3),
            "loop": report_clip["loop"],
            "transition": report_clip["transition"],
            "events": _expected_events(report_clip),
            "rigProof": _expected_rig_proof(clip_name, report_clip),
        }
        for key, value in expected_clip.items():
            _require(clip.get(key) == value, f"{job.variant}/{clip_name}: {key} differs from render report")
        if clip_name in SEMANTIC_REQUIRED_CLIPS:
            semantic_reasons = validate_semantic_clip_metadata(clip_name, clip)
            _require(
                not semantic_reasons,
                f"{job.variant}/{clip_name}: semantic metadata invalid: {'; '.join(semantic_reasons)}",
            )
        for optional in ("playback", "loopRange", "exitRange"):
            _require(
                (optional in clip) == (optional in report_clip)
                and (optional not in clip or clip[optional] == report_clip[optional]),
                f"{job.variant}/{clip_name}: {optional} differs from render report",
            )
        expected_clip_keys = {
            "name", "fps", "frameCount", "durationMs", "loop", "transition",
            "atlas", "frames", "events", "rigProof", "encoding",
        } | {name for name in ("playback", "loopRange", "exitRange") if name in report_clip}
        _require(set(clip) == expected_clip_keys,
                 f"{job.variant}/{clip_name}: unexpected clip manifest schema")

        proof = clip["rigProof"]
        top_controls.update(proof["animatedControls"])
        top_channels.update(proof["animatedChannels"])
        top_regions.update(proof["regions"])
        atlas = clip.get("atlas")
        pages = atlas.get("pages") if isinstance(atlas, dict) else None
        _require(isinstance(pages, list) and pages, f"{clip_name}: atlas pages are missing")
        for page_index, page in enumerate(pages):
            _require(isinstance(page, dict), f"{clip_name}: atlas page must be an object")
            name = _atlas_filename(job.variant, clip_name, page_index, page)
            path = job.output_root / ATLAS_DIRECTORY / name
            _require(path.is_file(), f"{clip_name}: atlas page is missing: {name}")
            actual_sha = file_sha256(path)
            _require(actual_sha == page["sha256"], f"{clip_name}: atlas page sha256 mismatch: {name}")
            with Image.open(path) as opened:
                width, height = opened.size
                _require(opened.format == "WEBP", f"{clip_name}: atlas page is not WebP")
            _require(
                page["width"] == width
                and page["height"] == height
                and page["decodedBytes"] == width * height * 4
                and page["decodedBytes"] <= packing["maxDecodedPageBytes"],
                f"{clip_name}: atlas page dimensions/decodedBytes mismatch",
            )
            _require(name not in page_files, f"duplicate atlas filename: {name}")
            page_files[name] = path
            expected_page_hashes[f"{clip_name}:{page_index}"] = actual_sha

        frames = clip.get("frames")
        _require(isinstance(frames, list) and len(frames) == report_clip["frameCount"],
                 f"{clip_name}: frame metadata count mismatch")
        rects: set[tuple[int, int, int, int, int]] = set()
        for index, frame in enumerate(frames):
            _require(isinstance(frame, dict), f"{clip_name}: frame {index} must be an object")
            _require(
                set(frame) == {
                    "index", "page", "x", "y", "w", "h", "offsetX", "offsetY",
                    "anchorX", "anchorY", "durationMs",
                },
                f"{clip_name}: frame {index} has an unexpected schema",
            )
            integers = ("index", "page", "x", "y", "w", "h", "offsetX", "offsetY", "anchorX", "anchorY")
            _require(all(isinstance(frame[key], int) and not isinstance(frame[key], bool) for key in integers),
                     f"{clip_name}: frame {index} geometry must be integer")
            page_index = frame["page"]
            _require(frame["index"] == index and 0 <= page_index < len(pages),
                     f"{clip_name}: frame {index} index/page is invalid")
            page = pages[page_index]
            _require(
                frame["w"] > 0
                and frame["h"] > 0
                and frame["x"] >= 0
                and frame["y"] >= 0
                and frame["x"] + frame["w"] <= page["width"]
                and frame["y"] + frame["h"] <= page["height"],
                f"{clip_name}: frame {index} escapes its atlas page",
            )
            _require(
                frame["offsetX"] >= 0
                and frame["offsetY"] >= 0
                and frame["offsetX"] + frame["w"] <= canvas[0]
                and frame["offsetY"] + frame["h"] <= canvas[1],
                f"{clip_name}: frame {index} escapes the logical canvas",
            )
            _require(
                frame["anchorX"] == expected_anchor["x"]
                and frame["anchorY"] == expected_anchor["y"]
                and frame["durationMs"] == round(1000 / report["fps"], 3),
                f"{clip_name}: frame {index} timing/anchor mismatch",
            )
            rect = (page_index, frame["x"], frame["y"], frame["w"], frame["h"])
            _require(rect not in rects, f"{clip_name}: atlas repeats a source rectangle")
            rects.add(rect)
        codec_validator(clip_name, clip, source_paths, page_files, canvas)

    _require(provenance.get("sourceFrameHashDigests") == expected_source_digests,
             "partial manifest source-frame digests mismatch")
    _require(provenance.get("sha256") == expected_page_hashes,
             "partial manifest atlas hash map mismatch")
    expected_top_proof = {
        "animatedControls": sorted(top_controls),
        "animatedChannels": sorted(top_channels),
        "regions": sorted(top_regions),
    }
    _require(manifest.get("rigProof") == expected_top_proof, "partial manifest top-level rigProof mismatch")
    return PartialPack(job=job, manifest=manifest, manifest_path=job.manifest_path, pages=page_files)


def run_subprocess_job(job: PackJob) -> PartialPack:
    """Run and validate one packer job in its fresh isolated public root."""

    _require(1 <= job.webp_quality <= 100, f"job {job.index}: invalid WebP quality")
    _require(job.packer_path.is_file(), f"job {job.index}: packer is missing")
    _require(not job.public_root.exists(), f"job {job.index}: isolated public root is not fresh")
    job.public_root.parent.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(
        job.command(),
        cwd=job.repo,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        diagnostics = "\n".join((completed.stdout + "\n" + completed.stderr).splitlines()[-30:])
        raise OrchestrationError(
            f"packer job {job.index} ({job.variant}: {', '.join(job.clips)}) failed "
            f"with exit {completed.returncode}:\n{diagnostics}"
        )
    return validate_partial_result(job)


def run_jobs(
    jobs: Sequence[PackJob],
    runner: Runner = run_subprocess_job,
    *,
    max_workers: int = MAX_WORKERS,
) -> list[PartialPack]:
    """Run jobs with a global hard cap of three concurrent subprocesses."""

    _require(jobs, "no atlas pack jobs were requested")
    _require(1 <= max_workers <= MAX_WORKERS, f"max_workers must be between 1 and {MAX_WORKERS}")
    indexes = [job.index for job in jobs]
    _require(len(indexes) == len(set(indexes)), "pack job indexes must be unique")
    failures: list[tuple[PackJob, BaseException]] = []
    results: list[PartialPack] = []

    def globally_bounded(job: PackJob) -> PartialPack:
        with _GLOBAL_WORKER_SLOTS:
            return runner(job)

    with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="niumpi-atlas") as executor:
        futures: dict[Future[PartialPack], PackJob] = {
            executor.submit(globally_bounded, job): job
            for job in sorted(jobs, key=lambda item: item.index)
        }
        for future in as_completed(futures):
            job = futures[future]
            try:
                result = future.result()
                _require(result.job == job, f"runner returned the wrong result for job {job.index}")
                results.append(result)
            except BaseException as error:  # collect all already-running failures; never publish partial success
                failures.append((job, error))
                for pending in futures:
                    if pending is not future:
                        pending.cancel()
    if failures:
        details = "; ".join(
            f"job {job.index} {job.variant}/{','.join(job.clips)}: {error}"
            for job, error in sorted(failures, key=lambda item: item[0].index)
        )
        raise OrchestrationError(f"atlas packing failed; nothing was published: {details}") from failures[0][1]
    return sorted(results, key=lambda result: result.job.index)


def _top_rig_proof(clips: Mapping[str, dict[str, Any]]) -> dict[str, list[str]]:
    controls: set[str] = set()
    channels: set[str] = set()
    regions: set[str] = set()
    for clip in clips.values():
        proof = clip["rigProof"]
        controls.update(proof["animatedControls"])
        channels.update(proof["animatedChannels"])
        regions.update(proof["regions"])
    return {
        "animatedControls": sorted(controls),
        "animatedChannels": sorted(channels),
        "regions": sorted(regions),
    }


def merge_variant_fragments(
    partials: Sequence[PartialPack],
    expected_clips: Iterable[str],
) -> MergedVariant:
    """Pure, deterministic merge.  Conflicts are always fatal."""

    _require(partials, "cannot merge an empty partial-pack list")
    expected = set(expected_clips)
    _require(expected, "expected clip set cannot be empty")
    ordered = sorted(partials, key=lambda item: (item.job.variant, item.job.index, item.job.clips))
    variant = ordered[0].job.variant
    _require_safe_variant(variant)
    _require(all(partial.job.variant == variant for partial in ordered), "cannot merge multiple variants")

    base = ordered[0].manifest
    _require(base.get("schemaVersion") == 3, "only schema-v3 fragments can be merged")
    shared_top = ("schemaVersion", "variant", "fps", "canvas", "anchor", "packing")
    shared_provenance = (
        "master", "approvedArt", "renderer", "renderReport", "renderReportSha256",
        "currentInputs", "clipLineage", "packerSha256",
    )
    clips: dict[str, dict[str, Any]] = {}
    pages: dict[str, Path] = {}
    source_digests: dict[str, str] = {}
    page_hashes: dict[str, str] = {}
    for partial in ordered:
        manifest = partial.manifest
        for key in shared_top:
            _require(manifest.get(key) == base.get(key), f"fragment contract conflict: {key}")
        provenance = manifest.get("provenance")
        base_provenance = base.get("provenance")
        _require(isinstance(provenance, dict) and isinstance(base_provenance, dict),
                 "fragment provenance is missing")
        for key in shared_provenance:
            _require(provenance.get(key) == base_provenance.get(key),
                     f"fragment provenance conflict: {key}")
        fragment_clips = manifest.get("clips")
        _require(isinstance(fragment_clips, dict) and fragment_clips,
                 "fragment contains no clips")
        _require(manifest.get("rigProof") == _top_rig_proof(fragment_clips),
                 "fragment top-level rigProof disagrees with its clips")
        for name, clip in fragment_clips.items():
            _require(name not in clips, f"duplicate clip fragment: {name}")
            clips[name] = copy.deepcopy(clip)
        fragment_digests = provenance.get("sourceFrameHashDigests")
        _require(isinstance(fragment_digests, dict) and set(fragment_digests) == set(fragment_clips),
                 "fragment source digest keys differ from its clips")
        for name, digest in fragment_digests.items():
            _require(_is_sha256(digest), f"fragment has invalid source digest for {name}")
            source_digests[name] = digest
        fragment_hashes = provenance.get("sha256")
        _require(isinstance(fragment_hashes, dict), "fragment atlas hash map is missing")
        expected_hash_keys = {
            f"{name}:{index}"
            for name, clip in fragment_clips.items()
            for index, _ in enumerate(clip["atlas"]["pages"])
        }
        _require(set(fragment_hashes) == expected_hash_keys,
                 "fragment atlas hash keys differ from its pages")
        for key, digest in fragment_hashes.items():
            _require(_is_sha256(digest), f"fragment has invalid atlas digest for {key}")
            _require(key not in page_hashes, f"duplicate atlas hash key: {key}")
            page_hashes[key] = digest
        for name, path in partial.pages.items():
            _require(name not in pages, f"duplicate atlas filename: {name}")
            pages[name] = path

    _require(set(clips) == expected, f"merged clip set mismatch: got {sorted(clips)}, expected {sorted(expected)}")
    referenced_names = {
        PurePosixPath(page["src"]).name
        for clip in clips.values()
        for page in clip["atlas"]["pages"]
    }
    _require(set(pages) == referenced_names, "merged page files differ from manifest references")
    _require(set(source_digests) == expected, "merged source digest set is incomplete")

    provenance = {key: copy.deepcopy(base["provenance"][key]) for key in shared_provenance}
    provenance["sourceFrameHashDigests"] = {key: source_digests[key] for key in sorted(source_digests)}
    provenance["sha256"] = {key: page_hashes[key] for key in sorted(page_hashes)}
    merged_manifest = {
        "schemaVersion": base["schemaVersion"],
        "variant": variant,
        "fps": base["fps"],
        "canvas": copy.deepcopy(base["canvas"]),
        "anchor": copy.deepcopy(base["anchor"]),
        "packing": copy.deepcopy(base["packing"]),
        "clips": {key: clips[key] for key in sorted(clips)},
        "rigProof": _top_rig_proof(clips),
        "provenance": provenance,
    }
    return MergedVariant(
        variant=variant,
        manifest=merged_manifest,
        pages={key: pages[key] for key in sorted(pages)},
    )


def referenced_page_names(manifest: Mapping[str, Any]) -> set[str]:
    """Return safe atlas basenames referenced by a v2/v3 manifest."""

    clips = manifest.get("clips")
    _require(isinstance(clips, dict), "published manifest clips must be an object")
    variant = manifest.get("variant")
    _require(isinstance(variant, str) and variant, "published manifest variant is missing")
    names: set[str] = set()
    for clip_name, clip in clips.items():
        _require(isinstance(clip, dict), f"published clip {clip_name} is invalid")
        atlas = clip.get("atlas")
        _require(isinstance(atlas, dict), f"published clip {clip_name} atlas is invalid")
        pages = atlas.get("pages", [atlas])
        _require(isinstance(pages, list) and pages, f"published clip {clip_name} has no pages")
        for page in pages:
            _require(isinstance(page, dict) and isinstance(page.get("src"), str),
                     f"published clip {clip_name} page src is invalid")
            pure = PurePosixPath(page["src"])
            _require(
                pure.is_absolute()
                and ".." not in pure.parts
                and pure.parent == PurePosixPath(f"/assets/niumpi/v2/{variant}/atlases")
                and pure.suffix == ".webp",
                f"published clip {clip_name} page src escapes its atlas directory",
            )
            _require(pure.name not in names, f"published manifest repeats page {pure.name}")
            names.add(pure.name)
    return names


def _fsync_file(path: Path) -> None:
    with path.open("rb") as handle:
        os.fsync(handle.fileno())


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _remove_empty_created_directories(paths: Sequence[tuple[Path, bool]]) -> None:
    for path, existed in paths:
        if not existed:
            try:
                path.rmdir()
            except OSError:
                pass


def _publish_variant_locked(
    merged: MergedVariant,
    target_public_root: Path,
    *,
    replace_file: ReplaceFile = os.replace,
    fsync_directory: FsyncDirectory = _fsync_directory,
    retire_file: RetireFile = os.replace,
    restore_file: ReplaceFile = os.replace,
) -> None:
    """Activate one variant pages-first and manifest-last.

    New content-addressed pages are rolled back if activation fails.  After a
    successful manifest swap, exactly the new generation and the pages
    referenced by the immediately preceding manifest are retained.
    """

    variant_root = target_public_root / merged.variant
    _require_safe_variant(merged.variant)
    _require(merged.manifest.get("schemaVersion") == 3, "only a schema-v3 merge can be published")
    _require(merged.manifest.get("variant") == merged.variant, "merged manifest variant mismatch")
    atlas_root = variant_root / ATLAS_DIRECTORY
    manifest_path = variant_root / MANIFEST_NAME
    variant_existed = variant_root.exists()
    atlas_existed = atlas_root.exists()
    active_direct_builds = sorted(variant_root.glob(".atlas-build-*"))
    _require(
        not active_direct_builds,
        "refusing activation while a direct atlas builder has an open staging directory: "
        + ", ".join(path.name for path in active_direct_builds),
    )
    previous_names: set[str] = set()
    idempotent = False
    if manifest_path.exists():
        previous = _load_json(manifest_path, "current published manifest")
        _require(previous.get("variant") == merged.variant, "current manifest variant mismatch")
        previous_names = referenced_page_names(previous)
        for name in previous_names:
            _require((atlas_root / name).is_file(), f"current manifest references missing page: {name}")
        idempotent = previous == merged.manifest
    previous_manifest_bytes = manifest_path.read_bytes() if manifest_path.exists() else None

    new_names = referenced_page_names(merged.manifest)
    _require(set(merged.pages) == new_names, "merged pages differ from manifest references")
    expected_hash_by_name: dict[str, str] = {}
    for clip in merged.manifest["clips"].values():
        for page in clip["atlas"]["pages"]:
            name = PurePosixPath(page["src"]).name
            digest = page.get("sha256")
            _require(_is_sha256(digest), f"new manifest has invalid page sha256: {name}")
            expected_hash_by_name[name] = digest
    for name, source in merged.pages.items():
        _require(source.is_file(), f"merged page source is missing: {source}")
        _require(file_sha256(source) == expected_hash_by_name[name], f"merged page hash mismatch: {name}")
    if idempotent:
        # A retry of the exact same generation is a no-op only after both its
        # supplied pages and the live target pages pass content hashes. This
        # preserves the retained predecessor without masking corrupt inputs.
        for name in new_names:
            live = atlas_root / name
            _require(file_sha256(live) == expected_hash_by_name[name], f"live page hash mismatch: {name}")
        return

    # Do not create even an empty production directory before all read-only
    # validation has passed.
    variant_root.mkdir(parents=True, exist_ok=True)
    atlas_root.mkdir(parents=True, exist_ok=True)

    installed: list[Path] = []
    retired: list[tuple[Path, Path]] = []
    with tempfile.TemporaryDirectory(
        prefix=STAGING_PREFIX,
        dir=variant_root,
        ignore_cleanup_errors=True,
    ) as temporary:
        stage = Path(temporary)
        switched = False
        manifest_switch_attempted = False
        try:
            stage_atlases = stage / ATLAS_DIRECTORY
            stage_atlases.mkdir()
            stage_retired = stage / "retired"
            stage_retired.mkdir()
            for name in sorted(new_names):
                staged = stage_atlases / name
                shutil.copyfile(merged.pages[name], staged)
                _fsync_file(staged)
                _require(file_sha256(staged) == expected_hash_by_name[name], f"staged page hash mismatch: {name}")
            staged_manifest = stage / MANIFEST_NAME
            candidate_manifest_bytes = merged.manifest_bytes()
            staged_manifest.write_bytes(candidate_manifest_bytes)
            _fsync_file(staged_manifest)

            # Every page becomes readable while the old manifest is still live.
            for name in sorted(new_names):
                destination = atlas_root / name
                if destination.exists():
                    _require(
                        destination.is_file() and file_sha256(destination) == expected_hash_by_name[name],
                        f"content-address collision at {destination}",
                    )
                    continue
                installed.append(destination)
                replace_file(stage_atlases / name, destination)
            fsync_directory(atlas_root)
            _require(all((atlas_root / name).is_file() for name in new_names),
                     "not every new page is readable before manifest activation")

            # This is the sole visibility switch and must always be last.
            manifest_switch_attempted = True
            replace_file(staged_manifest, manifest_path)
            switched = True
            fsync_directory(variant_root)

            # Garbage collection is reversible until every retirement and
            # directory sync succeeds. Only current+immediately-previous page
            # references survive the transaction.
            keep = new_names | previous_names
            for existing in sorted(atlas_root.glob("*.webp")):
                if existing.name in keep:
                    continue
                quarantined = stage_retired / existing.name
                retired.append((quarantined, existing))
                retire_file(existing, quarantined)
            fsync_directory(atlas_root)
        except BaseException as error:
            rollback_errors: list[str] = []
            manifest_restored = not switched and not manifest_switch_attempted
            if manifest_switch_attempted and not switched:
                try:
                    if manifest_path.exists():
                        active_manifest_bytes: bytes | None = manifest_path.read_bytes()
                    else:
                        active_manifest_bytes = None
                    if active_manifest_bytes == candidate_manifest_bytes:
                        switched = True
                    elif active_manifest_bytes == previous_manifest_bytes:
                        manifest_restored = True
                    else:
                        rollback_errors.append(
                            "manifest switch outcome is uncertain; both page generations retained"
                        )
                except BaseException as inspection_error:
                    rollback_errors.append(
                        f"manifest switch outcome cannot be inspected: {inspection_error}"
                    )
            if switched:
                try:
                    if previous_manifest_bytes is None:
                        manifest_path.unlink(missing_ok=True)
                    else:
                        rollback_manifest = stage / "rollback-manifest.json"
                        rollback_manifest.write_bytes(previous_manifest_bytes)
                        _fsync_file(rollback_manifest)
                        restore_file(rollback_manifest, manifest_path)
                    _fsync_directory(variant_root)
                    manifest_restored = True
                except BaseException as rollback_error:
                    rollback_errors.append(f"manifest restore failed: {rollback_error}")
            for quarantined, original in reversed(retired):
                try:
                    if quarantined.exists():
                        os.replace(quarantined, original)
                except BaseException as rollback_error:
                    rollback_errors.append(f"page restore failed for {original.name}: {rollback_error}")
            if manifest_restored:
                for path in reversed(installed):
                    try:
                        path.unlink(missing_ok=True)
                    except BaseException as rollback_error:
                        rollback_errors.append(f"new-page rollback failed for {path.name}: {rollback_error}")
            elif installed:
                rollback_errors.append(
                    "manifest state is uncertain; candidate pages intentionally retained"
                )
            try:
                _fsync_directory(atlas_root)
            except BaseException as rollback_error:
                rollback_errors.append(f"atlas rollback fsync failed: {rollback_error}")
            if manifest_restored:
                _remove_empty_created_directories(((atlas_root, atlas_existed), (variant_root, variant_existed)))
            if rollback_errors:
                raise OrchestrationError(
                    f"atlas activation failed ({error}); rollback incomplete: {'; '.join(rollback_errors)}"
                ) from error
            raise


def publish_variant(
    merged: MergedVariant,
    target_public_root: Path,
    *,
    replace_file: ReplaceFile = os.replace,
    fsync_directory: FsyncDirectory = _fsync_directory,
    retire_file: RetireFile = os.replace,
    restore_file: ReplaceFile = os.replace,
) -> None:
    """Lock and atomically activate one variant."""

    with pipeline_lock(target_public_root):
        if target_public_root.resolve() == PUBLIC_ROOT.resolve():
            production_preflight(target_public_root)
        _publish_variant_locked(
            merged,
            target_public_root,
            replace_file=replace_file,
            fsync_directory=fsync_directory,
            retire_file=retire_file,
            restore_file=restore_file,
        )


def _partition(values: Sequence[str], size: int) -> list[tuple[str, ...]]:
    _require(size > 0, "batch size must be positive")
    return [tuple(values[index : index + size]) for index in range(0, len(values), size)]


def _selected_clips(report: dict[str, Any], requested: set[str] | None) -> list[str]:
    clips = report.get("clips")
    _require(isinstance(clips, dict) and clips, "render report has no clips")
    for name in clips:
        _require_safe_clip(name)
    available = set(clips)
    if requested is None:
        return sorted(available)
    _require(requested and requested.issubset(available),
             f"unknown requested clips: {sorted(requested - available)}")
    return sorted(requested)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--variants", nargs="+", required=True)
    parser.add_argument("--clips", nargs="+", help="Optional dry-run subset; publish requires the full report")
    parser.add_argument("--source", type=Path, default=SOURCE_ROOT)
    parser.add_argument("--public", type=Path, default=PUBLIC_ROOT)
    parser.add_argument("--packer", type=Path, default=PACKER_PATH)
    parser.add_argument("--python", dest="python_executable", default=sys.executable)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--workers", type=int, default=MAX_WORKERS)
    parser.add_argument("--webp-quality", type=int, default=92)
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args(argv)
    if not 1 <= args.workers <= MAX_WORKERS:
        parser.error(f"--workers must be between 1 and {MAX_WORKERS}")
    if args.batch_size <= 0:
        parser.error("--batch-size must be positive")
    if not 1 <= args.webp_quality <= 100:
        parser.error("--webp-quality must be between 1 and 100")
    if len(args.variants) != len(set(args.variants)):
        parser.error("--variants cannot contain duplicates")
    if any(not VARIANT_PATTERN.fullmatch(variant) for variant in args.variants):
        parser.error("--variants may contain only lowercase letters, digits and hyphens")
    if args.clips and any(not CLIP_PATTERN.fullmatch(clip) for clip in args.clips):
        parser.error("--clips may contain only lowercase letters, digits and underscores")
    return args


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    source_root = args.source.resolve()
    target_public_root = args.public.resolve()
    packer_path = args.packer.resolve()
    if args.publish:
        _require(len(args.variants) == 1, "multi-variant publication is disabled; publish one variant transaction at a time")
        _require(source_root == SOURCE_ROOT.resolve(), "--publish requires the canonical rendered-source root")
        _require(target_public_root == PUBLIC_ROOT.resolve(), "--publish requires the canonical public/assets/niumpi/v2 root")
        _require(packer_path == PACKER_PATH.resolve(), "--publish requires the canonical build_atlases.py")
    requested = set(args.clips) if args.clips else None
    reports: dict[str, dict[str, Any]] = {}
    selections: dict[str, list[str]] = {}
    for variant in sorted(args.variants):
        report = _load_json(source_root / variant / "render-report.json", "render report")
        _require(report.get("variant") == variant, f"render report variant mismatch for {variant}")
        reports[variant] = report
        selections[variant] = _selected_clips(report, requested)
        if args.publish:
            canonical = validate_report_for_publication(variant, report)
            _require(
                set(selections[variant]) == set(canonical),
                f"refusing partial publication for {variant}; the canonical final clip set is required",
            )

    lock_context = pipeline_lock(target_public_root) if args.publish else nullcontext()
    with lock_context:
        if args.publish:
            # This runs while the exclusive pipeline lock is held and before
            # even the first isolated worker is submitted.
            production_preflight(target_public_root)
        with tempfile.TemporaryDirectory(
            prefix="niumpi-atlas-orchestrator-",
            ignore_cleanup_errors=True,
        ) as temporary:
            workspace = Path(temporary)
            jobs: list[PackJob] = []
            next_index = 0
            for variant in sorted(selections):
                for batch in _partition(selections[variant], args.batch_size):
                    jobs.append(
                        PackJob(
                            index=next_index,
                            variant=variant,
                            clips=batch,
                            source_root=source_root,
                            public_root=workspace / f"job-{next_index:04d}" / "public/assets/niumpi/v2",
                            packer_path=packer_path,
                            python_executable=args.python_executable,
                            webp_quality=args.webp_quality,
                            repo=REPO,
                        )
                    )
                    next_index += 1
            partials = run_jobs(jobs, max_workers=args.workers)
            merged: list[MergedVariant] = []
            for variant in sorted(selections):
                fragments = [partial for partial in partials if partial.job.variant == variant]
                merged.append(merge_variant_fragments(fragments, selections[variant]))

            if args.publish:
                # A direct legacy packer does not yet honour our lock. Repeat
                # the read-only process/staging guard immediately before the
                # one allowed activation.
                production_preflight(target_public_root)
                _require(len(merged) == 1, "internal publication transaction must contain one variant")
                _publish_variant_locked(merged[0], target_public_root)
            for result in merged:
                print(
                    "NIUMPI_ATLAS_ORCHESTRATOR_OK "
                    f"variant={result.variant} clips={len(result.manifest['clips'])} "
                    f"pages={len(result.pages)} published={str(args.publish).lower()}"
                )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OrchestrationError as error:
        print(f"NIUMPI_ATLAS_ORCHESTRATOR_FAIL {error}", file=sys.stderr)
        raise SystemExit(1) from error
