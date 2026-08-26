from __future__ import annotations

import copy
import hashlib
import io
import itertools
import json
import multiprocessing
import os
import tempfile
import threading
import time
import unittest
from contextlib import redirect_stderr
from dataclasses import replace
from pathlib import Path
from typing import Any

from PIL import Image

from scripts.niumpi import orchestrate_atlas_packs as orchestrator


VARIANT = "baby"
FPS = 24
CANVAS = {"width": 512, "height": 512}
ANCHOR = {"x": 256, "y": 478}
PACKING = {
    "mode": "trimmed-rgba-v1",
    "transparentRGB": "zero-when-alpha-zero",
    "sourceCanonicalization": {
        "transparentRGB": "zero-when-alpha-zero",
        "stage": "pre-encode",
    },
    "decodedTransparentRGB": "unspecified-for-lossy-webp",
    "gutterPx": 4,
    "maxDecodedPageBytes": 44_040_192,
}


def _hold_pipeline_lock(root: str, ready: Any, release: Any) -> None:
    with orchestrator.pipeline_lock(Path(root)):
        ready.set()
        release.wait(5)


def _digest(value: str | bytes) -> str:
    payload = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(payload).hexdigest()


def _tree_snapshot(root: Path) -> dict[str, bytes]:
    if not root.exists():
        return {}
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def _write_page(root: Path, clip: str, generation: str) -> tuple[str, Path, str]:
    root.mkdir(parents=True, exist_ok=True)
    colour_seed = hashlib.sha256(f"{clip}:{generation}".encode("utf-8")).digest()
    temporary = root / f"{clip}-{generation}.webp"
    Image.new("RGBA", (8, 8), (*colour_seed[:3], 255)).save(
        temporary,
        "WEBP",
        lossless=True,
        method=6,
        exact=True,
    )
    sha256 = orchestrator.file_sha256(temporary)
    name = f"{clip}-0-{sha256[:12]}.webp"
    path = root / name
    temporary.replace(path)
    return name, path, sha256


def _shared_provenance(clips: tuple[str, ...], generation: str) -> dict[str, Any]:
    return {
        "master": "art/niumpi/blender/fixture.blend",
        "approvedArt": "public/assets/niumpi/stages/fixture.webp",
        "renderer": "Blender frame_set + depsgraph",
        "renderReport": {"fixtureGeneration": generation},
        "renderReportSha256": _digest(f"report:{generation}"),
        "currentInputs": {
            "masterSha256": _digest("master"),
            "approvedArtSha256": _digest("approved"),
            "landmarksSha256": _digest("landmarks"),
            "generatorSha256": _digest("generator"),
        },
        "clipLineage": {name: "current" for name in sorted(clips)},
        "packerSha256": _digest("packer"),
    }


def _partial(
    root: Path,
    *,
    index: int,
    clip: str,
    all_clips: tuple[str, ...],
    generation: str,
) -> orchestrator.PartialPack:
    source_root = root / "rendered-source"
    public_root = root / "isolated" / f"job-{index}"
    job = orchestrator.PackJob(
        index=index,
        variant=VARIANT,
        clips=(clip,),
        source_root=source_root,
        public_root=public_root,
        repo=root,
    )
    name, page_path, page_sha = _write_page(root / "page-inputs" / generation, clip, generation)
    proof = {
        "animatedControls": [f"{clip}.control", "shared.control"],
        "animatedChannels": [f"{clip}.channel", "shared.channel"],
        "regions": [f"{clip}.region", "body"],
    }
    top_proof = {key: sorted(set(values)) for key, values in proof.items()}
    clip_manifest = {
        "name": clip,
        "fps": FPS,
        "frameCount": 1,
        "durationMs": round(1000 / FPS, 3),
        "loop": True,
        "transition": "loop",
        "atlas": {
            "pages": [
                {
                    "src": f"/assets/niumpi/v2/{VARIANT}/atlases/{name}",
                    "width": 8,
                    "height": 8,
                    "decodedBytes": 8 * 8 * 4,
                    "sha256": page_sha,
                }
            ]
        },
        "frames": [
            {
                "index": 0,
                "page": 0,
                "x": 0,
                "y": 0,
                "w": 8,
                "h": 8,
                "offsetX": 252,
                "offsetY": 470,
                "anchorX": ANCHOR["x"],
                "anchorY": ANCHOR["y"],
                "durationMs": round(1000 / FPS, 3),
            }
        ],
        "events": [],
        "rigProof": top_proof,
    }
    provenance = _shared_provenance(all_clips, generation)
    provenance["sourceFrameHashDigests"] = {clip: _digest(f"source:{clip}:{generation}")}
    provenance["sha256"] = {f"{clip}:0": page_sha}
    manifest = {
        "schemaVersion": 3,
        "variant": VARIANT,
        "fps": FPS,
        "canvas": copy.deepcopy(CANVAS),
        "anchor": copy.deepcopy(ANCHOR),
        "packing": copy.deepcopy(PACKING),
        "clips": {clip: clip_manifest},
        "rigProof": top_proof,
        "provenance": provenance,
    }
    manifest_path = job.manifest_path
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_bytes(orchestrator.canonical_json_bytes(manifest))
    return orchestrator.PartialPack(
        job=job,
        manifest=manifest,
        manifest_path=manifest_path,
        pages={name: page_path},
    )


def _partials(
    root: Path,
    clips: tuple[str, ...],
    generation: str,
) -> list[orchestrator.PartialPack]:
    return [
        _partial(
            root,
            index=index,
            clip=clip,
            all_clips=clips,
            generation=generation,
        )
        for index, clip in enumerate(clips)
    ]


def _merged(
    root: Path,
    generation: str,
    clips: tuple[str, ...] = ("idle", "blink"),
) -> orchestrator.MergedVariant:
    return orchestrator.merge_variant_fragments(
        _partials(root, clips, generation),
        expected_clips=clips,
    )


def _validated_partial_fixture(root: Path) -> tuple[orchestrator.PackJob, dict[str, Path]]:
    variant = "stage-2"
    clip = "idle"
    repo = root / "repo"
    source_root = repo / "art/niumpi/rendered-source"
    source_dir = source_root / variant / clip
    source_dir.mkdir(parents=True)
    source = source_dir / "0001.png"
    Image.new("RGBA", (8, 8), (71, 142, 213, 255)).save(source)
    source_sha = orchestrator.file_sha256(source)

    master = repo / "art/niumpi/blender/fixture.blend"
    approved = repo / "public/assets/niumpi/stages/stage-2.webp"
    landmarks = repo / "art/niumpi/variant-landmarks.json"
    for path, payload in (
        (master, b"master"),
        (approved, b"approved"),
        (landmarks, b"landmarks"),
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)

    generator_sources = (
        "scripts/niumpi/build_rig.py",
        "scripts/niumpi/build_actions.py",
        "scripts/niumpi/render_actions.py",
        "scripts/niumpi/build_variant_rig.py",
        "scripts/niumpi/variant_clip_contract.py",
    )
    generator_digest = hashlib.sha256()
    for index, relative in enumerate(generator_sources):
        path = repo / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(f"generator-{index}".encode("utf-8"))
        generator_digest.update(relative.encode("utf-8"))
        generator_digest.update(b"\0")
        generator_digest.update(path.read_bytes())
        generator_digest.update(b"\0")

    provenance = {
        "master": master.relative_to(repo).as_posix(),
        "masterSha256": orchestrator.file_sha256(master),
        "approvedArt": approved.relative_to(repo).as_posix(),
        "approvedArtSha256": orchestrator.file_sha256(approved),
        "landmarksSha256": orchestrator.file_sha256(landmarks),
        "generatorSha256": generator_digest.hexdigest(),
    }
    report = {
        "schemaVersion": 2,
        "variant": variant,
        "fps": 24,
        "canvas": {"width": 8, "height": 8},
        "anchor": {"x": 4, "y": 7},
        "provenance": provenance,
        "clips": {
            clip: {
                "frameCount": 1,
                "frameHashes": [source_sha],
                "sourceDirectory": source_dir.relative_to(repo).as_posix(),
                "loop": True,
                "transition": {"anticipationFrames": 0, "actionFrames": 1, "recoveryFrames": 0},
                "events": [],
                "animatedControls": ["root"],
                "animatedChannels": ["root.location"],
                "regions": ["body"],
            }
        },
    }
    report_path = source_root / variant / "render-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    packer = repo / "scripts/niumpi/build_atlases.py"
    packer.write_text("# fixture packer\n", encoding="utf-8")
    public_root = root / "isolated/public/assets/niumpi/v2"
    job = orchestrator.PackJob(
        index=0,
        variant=variant,
        clips=(clip,),
        source_root=source_root,
        public_root=public_root,
        packer_path=packer,
        repo=repo,
    )
    atlas_root = job.output_root / orchestrator.ATLAS_DIRECTORY
    atlas_root.mkdir(parents=True)
    temporary_page = atlas_root / "temporary.webp"
    Image.new("RGBA", (8, 8), (71, 142, 213, 255)).save(
        temporary_page,
        "WEBP",
        lossless=True,
        method=6,
        exact=True,
    )
    page_sha = orchestrator.file_sha256(temporary_page)
    page_name = f"{clip}-0-{page_sha[:12]}.webp"
    page_path = atlas_root / page_name
    temporary_page.replace(page_path)

    candidates = list(range(79, 101))
    failed_proofs = [
        {
            "quality": quality,
            "passes": False,
            "foregroundMAE": 3.0,
            "foregroundPSNR": 37.0,
            "alphaMAE": 0.0,
            "failingFrames": [0],
        }
        for quality in candidates
    ]
    rig_proof = {
        "animatedControls": ["root"],
        "animatedChannels": ["root.location"],
        "regions": ["body"],
    }
    clip_manifest = {
        "name": clip,
        "fps": 24,
        "frameCount": 1,
        "durationMs": round(1000 / 24, 3),
        "loop": True,
        "transition": report["clips"][clip]["transition"],
        "atlas": {
            "pages": [
                {
                    "src": f"/assets/niumpi/v2/{variant}/atlases/{page_name}",
                    "width": 8,
                    "height": 8,
                    "decodedBytes": 8 * 8 * 4,
                    "sha256": page_sha,
                }
            ]
        },
        "frames": [
            {
                "index": 0,
                "page": 0,
                "x": 0,
                "y": 0,
                "w": 8,
                "h": 8,
                "offsetX": 0,
                "offsetY": 0,
                "anchorX": 4,
                "anchorY": 7,
                "durationMs": round(1000 / 24, 3),
            }
        ],
        "events": [],
        "rigProof": rig_proof,
        "encoding": {
            "format": "WebP",
            "rgb": {
                "lossy": False,
                "quality": None,
                "foregroundMAE": 0.0,
                "foregroundPSNR": None,
            },
            "alpha": {"lossless": True, "meanAbsoluteError": 0.0},
            "thresholds": {"foregroundMAEMax": 2.5, "foregroundPSNRMin": 38.0, "alphaMAE": 0.0},
            "selection": {
                "strategy": "lossless-fallback",
                "claim": "declared-candidates-exhausted",
                "candidateQualities": candidates,
                "selectedQuality": None,
                "predecessor": failed_proofs[-1],
                "evaluatedQualities": candidates,
                "candidateProofs": failed_proofs,
            },
            "frameGate": {
                "foregroundAlpha": ">0",
                "allFramesPassed": True,
                "frames": [
                    {
                        "index": 0,
                        "passes": True,
                        "foregroundMAE": 0.0,
                        "foregroundPSNR": None,
                        "alphaMAE": 0.0,
                    }
                ],
            },
        },
    }
    manifest = {
        "schemaVersion": 3,
        "variant": variant,
        "fps": 24,
        "canvas": {"width": 8, "height": 8},
        "anchor": {"x": 4, "y": 7},
        "packing": copy.deepcopy(PACKING),
        "clips": {clip: clip_manifest},
        "rigProof": rig_proof,
        "provenance": {
            "master": provenance["master"],
            "approvedArt": provenance["approvedArt"],
            "renderer": "Blender frame_set + depsgraph",
            "renderReport": provenance,
            "renderReportSha256": orchestrator.file_sha256(report_path),
            "currentInputs": {
                "masterSha256": provenance["masterSha256"],
                "approvedArtSha256": provenance["approvedArtSha256"],
                "landmarksSha256": provenance["landmarksSha256"],
                "generatorSha256": provenance["generatorSha256"],
            },
            "sourceFrameHashDigests": {
                clip: hashlib.sha256(source_sha.encode("ascii")).hexdigest(),
            },
            "clipLineage": {clip: "current"},
            "packerSha256": orchestrator.file_sha256(packer),
            "sha256": {f"{clip}:0": page_sha},
        },
    }
    job.manifest_path.parent.mkdir(parents=True, exist_ok=True)
    job.manifest_path.write_bytes(orchestrator.canonical_json_bytes(manifest))
    return job, {
        "manifest": job.manifest_path,
        "page": page_path,
        "source": source,
        "report": report_path,
    }


class AtlasOrchestratorTests(unittest.TestCase):
    def test_pipeline_lock_is_cross_process_and_concurrent_publishers_cannot_race_cleanup(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            context = multiprocessing.get_context("spawn")
            ready = context.Event()
            release_process = context.Event()
            process = context.Process(
                target=_hold_pipeline_lock,
                args=(str(root / "lock-target"), ready, release_process),
            )
            process.start()
            try:
                self.assertTrue(ready.wait(3), "child process never acquired the pipeline lock")
                with self.assertRaisesRegex(orchestrator.OrchestrationError, "another atlas process"):
                    with orchestrator.pipeline_lock(root / "lock-target"):
                        self.fail("a second process acquired the same publish lock")
            finally:
                release_process.set()
                process.join(timeout=5)
                if process.is_alive():
                    process.terminate()
            self.assertEqual(process.exitcode, 0)

            target = root / "published"
            previous = _merged(root / "inputs/g0", "g0")
            candidate = _merged(root / "inputs/g1", "g1")
            missing = _merged(root / "inputs/g2", "g2")
            orchestrator.publish_variant(previous, target)
            missing_page = next(iter(missing.pages.values()))
            missing_page.unlink()
            page_install_started = threading.Event()
            release_install = threading.Event()
            first_errors: list[BaseException] = []

            def slow_replace(source: str | os.PathLike[str], destination: str | os.PathLike[str]) -> None:
                if Path(destination).suffix == ".webp" and not page_install_started.is_set():
                    page_install_started.set()
                    if not release_install.wait(3):
                        raise TimeoutError("test did not release page installation")
                os.replace(source, destination)

            def publish_first() -> None:
                try:
                    orchestrator.publish_variant(candidate, target, replace_file=slow_replace)
                except BaseException as error:
                    first_errors.append(error)

            thread = threading.Thread(target=publish_first, name="first-publisher")
            thread.start()
            self.assertTrue(page_install_started.wait(3), "first publisher never reached activation")
            with self.assertRaisesRegex(orchestrator.OrchestrationError, "another atlas pipeline"):
                orchestrator.publish_variant(missing, target)
            release_install.set()
            thread.join(timeout=5)
            self.assertFalse(thread.is_alive())
            self.assertEqual(first_errors, [])
            manifest = json.loads((target / VARIANT / orchestrator.MANIFEST_NAME).read_text())
            self.assertEqual(manifest, candidate.manifest)
            self.assertTrue(
                all(
                    (target / VARIANT / orchestrator.ATLAS_DIRECTORY / name).is_file()
                    for name in orchestrator.referenced_page_names(manifest)
                )
            )

    def test_two_run_jobs_calls_share_one_process_global_worker_cap(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            groups = [
                _partials(root / f"group-{group}", tuple(f"g{group}_c{index}" for index in range(4)), "cap")
                for group in range(2)
            ]
            by_job = {partial.job: partial for group in groups for partial in group}
            lock = threading.Lock()
            release = threading.Event()
            first_wave = threading.Event()
            active = 0
            peak = 0
            errors: list[BaseException] = []

            def runner(job: orchestrator.PackJob) -> orchestrator.PartialPack:
                nonlocal active, peak
                with lock:
                    active += 1
                    peak = max(peak, active)
                    if active == orchestrator.MAX_WORKERS:
                        first_wave.set()
                try:
                    if not release.wait(5):
                        raise TimeoutError("global worker cap test timed out")
                    return by_job[job]
                finally:
                    with lock:
                        active -= 1

            def invoke(group: list[orchestrator.PartialPack]) -> None:
                try:
                    orchestrator.run_jobs([partial.job for partial in group], runner)
                except BaseException as error:
                    errors.append(error)

            threads = [threading.Thread(target=invoke, args=(group,)) for group in groups]
            for thread in threads:
                thread.start()
            self.assertTrue(first_wave.wait(3), "three global worker slots were never filled")
            with lock:
                self.assertEqual(active, 3)
                self.assertEqual(peak, 3)
            release.set()
            for thread in threads:
                thread.join(timeout=5)
                self.assertFalse(thread.is_alive())
            self.assertEqual(errors, [])
            self.assertEqual(peak, 3)

    def test_publication_requires_canonical_complete_reports_and_paths(self) -> None:
        core_seven = orchestrator.required_clips_for_variant("stage-2", require_semantic=False)
        incomplete = {"clips": {name: {} for name in core_seven}}
        with self.assertRaisesRegex(orchestrator.OrchestrationError, "publication clip set is not canonical"):
            orchestrator.validate_report_for_publication("stage-2", incomplete)

        actual = json.loads(
            (orchestrator.SOURCE_ROOT / "baby/render-report.json").read_text(encoding="utf-8")
        )
        broken_semantic = copy.deepcopy(actual)
        broken_semantic["clips"]["sad"]["frameCount"] -= 1
        with self.assertRaisesRegex(orchestrator.OrchestrationError, "semantic metadata invalid"):
            orchestrator.validate_report_for_publication("baby", broken_semantic)

        with self.assertRaisesRegex(orchestrator.OrchestrationError, "multi-variant publication is disabled"):
            orchestrator.main(["--variants", "baby", "stage-2", "--publish"])
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(orchestrator.OrchestrationError, "canonical public"):
                orchestrator.main(
                    ["--variants", "baby", "--public", temporary, "--publish"]
                )
        with redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            orchestrator.parse_args(["--variants", "baby", "--clips", "bad-name"])

    def test_validate_partial_result_rejects_tampered_paths_provenance_encoding_and_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            job, _ = _validated_partial_fixture(Path(temporary))
            result = orchestrator.validate_partial_result(job)
            self.assertEqual(result.job, job)

        def mutate_manifest(paths: dict[str, Path], mutate: Any) -> None:
            manifest = json.loads(paths["manifest"].read_text(encoding="utf-8"))
            mutate(manifest)
            paths["manifest"].write_bytes(orchestrator.canonical_json_bytes(manifest))

        cases = (
            (
                "src traversal",
                lambda paths: mutate_manifest(
                    paths,
                    lambda manifest: manifest["clips"]["idle"]["atlas"]["pages"][0].__setitem__(
                        "src", "/assets/niumpi/v2/stage-2/atlases/../escape.webp"
                    ),
                ),
                "atlas src escapes",
            ),
            (
                "current provenance",
                lambda paths: mutate_manifest(
                    paths,
                    lambda manifest: manifest["provenance"]["currentInputs"].__setitem__(
                        "masterSha256", "0" * 64
                    ),
                ),
                "provenance mismatch: currentInputs",
            ),
            (
                "encoding predecessor",
                lambda paths: mutate_manifest(
                    paths,
                    lambda manifest: manifest["clips"]["idle"]["encoding"]["selection"].__setitem__(
                        "predecessor", None
                    ),
                ),
                "predecessor proof",
            ),
            (
                "decoded dimensions",
                lambda paths: mutate_manifest(
                    paths,
                    lambda manifest: manifest["clips"]["idle"]["atlas"]["pages"][0].__setitem__(
                        "decodedBytes", 1
                    ),
                ),
                "dimensions/decodedBytes mismatch",
            ),
            (
                "page bytes",
                lambda paths: paths["page"].write_bytes(paths["page"].read_bytes() + b"tamper"),
                "atlas page sha256 mismatch",
            ),
            (
                "source bytes",
                lambda paths: Image.new("RGBA", (8, 8), (0, 0, 0, 255)).save(paths["source"]),
                "source PNG hashes differ",
            ),
        )
        for label, mutate, message in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                job, paths = _validated_partial_fixture(Path(temporary))
                mutate(paths)
                with self.assertRaisesRegex(orchestrator.OrchestrationError, message):
                    orchestrator.validate_partial_result(job)

        mixed = {
            "clips": {
                "idle": {"frameCount": 1, "frameHashes": ["1" * 64]},
                "sad": {"frameCount": 1, "frameHashes": ["2" * 64]},
            },
            "provenance": {
                "corePredecessor": {
                    "preservedClips": ["idle"],
                    "clipFrameHashDigests": {
                        "idle": hashlib.sha256(("1" * 64).encode("ascii")).hexdigest(),
                    },
                    "reportProvenance": {
                        "masterSha256": "A" * 64,
                        "generatorSha256": "b" * 64,
                        "approvedArtSha256": "c" * 64,
                        "landmarksSha256": "d" * 64,
                    },
                },
                "semanticBatch": {"clips": ["sad"], "frameCount": 1},
            },
        }
        with self.assertRaisesRegex(orchestrator.OrchestrationError, "invalid masterSha256"):
            orchestrator._expected_lineage(mixed)

    def test_post_swap_and_cleanup_failures_restore_manifest_and_tree(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "published"
            previous = _merged(root / "inputs/g0", "g0")
            candidate = _merged(root / "inputs/g1", "g1")
            orchestrator.publish_variant(previous, target)
            before = _tree_snapshot(target)
            fsync_calls = 0

            def fail_post_swap(path: Path) -> None:
                nonlocal fsync_calls
                fsync_calls += 1
                if fsync_calls == 2:
                    raise OSError("synthetic post-swap fsync failure")
                orchestrator._fsync_directory(path)

            with self.assertRaisesRegex(OSError, "post-swap fsync failure"):
                orchestrator.publish_variant(candidate, target, fsync_directory=fail_post_swap)
            self.assertEqual(_tree_snapshot(target), before)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "published"
            previous = _merged(root / "inputs/g0", "g0")
            candidate = _merged(root / "inputs/g1", "g1")
            orchestrator.publish_variant(previous, target)
            fsync_calls = 0

            def fail_after_swap(path: Path) -> None:
                nonlocal fsync_calls
                fsync_calls += 1
                if fsync_calls == 2:
                    raise OSError("force rollback")
                orchestrator._fsync_directory(path)

            def fail_manifest_restore(
                _source: str | os.PathLike[str],
                _destination: str | os.PathLike[str],
            ) -> None:
                raise OSError("synthetic rollback-manifest failure")

            with self.assertRaisesRegex(
                orchestrator.OrchestrationError,
                "candidate pages intentionally retained",
            ):
                orchestrator.publish_variant(
                    candidate,
                    target,
                    fsync_directory=fail_after_swap,
                    restore_file=fail_manifest_restore,
                )
            live_manifest = json.loads(
                (target / VARIANT / orchestrator.MANIFEST_NAME).read_text(encoding="utf-8")
            )
            self.assertEqual(live_manifest, candidate.manifest)
            atlas_root = target / VARIANT / orchestrator.ATLAS_DIRECTORY
            self.assertTrue(
                all((atlas_root / name).is_file() for name in orchestrator.referenced_page_names(candidate.manifest))
            )
            self.assertTrue(
                all((atlas_root / name).is_file() for name in orchestrator.referenced_page_names(previous.manifest))
            )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "published"
            generations = [_merged(root / f"inputs/g{index}", f"g{index}") for index in range(3)]
            orchestrator.publish_variant(generations[0], target)
            orchestrator.publish_variant(generations[1], target)
            before = _tree_snapshot(target)

            def fail_cleanup(_source: Path, _destination: Path) -> None:
                raise OSError("synthetic cleanup failure")

            with self.assertRaisesRegex(OSError, "synthetic cleanup failure"):
                orchestrator.publish_variant(generations[2], target, retire_file=fail_cleanup)
            self.assertEqual(_tree_snapshot(target), before)

    def test_idempotent_republish_preserves_the_previous_generation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "published"
            generations = [_merged(root / f"inputs/g{index}", f"g{index}") for index in range(3)]
            names = [orchestrator.referenced_page_names(item.manifest) for item in generations]
            orchestrator.publish_variant(generations[0], target)
            orchestrator.publish_variant(generations[1], target)
            before_retry = _tree_snapshot(target)

            missing_name, missing_source = next(iter(generations[1].pages.items()))
            missing_bytes = missing_source.read_bytes()
            missing_source.unlink()
            with self.assertRaisesRegex(orchestrator.OrchestrationError, "merged page source is missing"):
                orchestrator.publish_variant(generations[1], target)
            missing_source.write_bytes(missing_bytes)
            corrupt_pages = dict(generations[1].pages)
            corrupt_pages[missing_name] = root / "missing-candidate-page.webp"
            corrupt_candidate = replace(generations[1], pages=corrupt_pages)
            with self.assertRaisesRegex(orchestrator.OrchestrationError, "merged page source is missing"):
                orchestrator.publish_variant(corrupt_candidate, target)

            orchestrator.publish_variant(generations[1], target)
            self.assertEqual(_tree_snapshot(target), before_retry)
            atlas_root = target / VARIANT / orchestrator.ATLAS_DIRECTORY
            self.assertEqual({path.name for path in atlas_root.glob("*.webp")}, names[0] | names[1])
            orchestrator.publish_variant(generations[2], target)
            self.assertEqual({path.name for path in atlas_root.glob("*.webp")}, names[1] | names[2])

    def test_production_preflight_rejects_active_staging_and_direct_process(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            active = root / "baby/.atlas-build-live"
            active.mkdir(parents=True)
            with self.assertRaisesRegex(orchestrator.OrchestrationError, "active staging"):
                orchestrator.production_preflight(root, process_output="")
            active.rmdir()
            with self.assertRaisesRegex(orchestrator.OrchestrationError, "process is active"):
                orchestrator.production_preflight(
                    root,
                    process_output="123 python3 scripts/niumpi/build_atlases.py --variant baby\n",
                )

    def test_run_jobs_enforces_one_global_peak_of_three(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clips = tuple(f"clip-{index}" for index in range(8))
            partials = _partials(root, clips, "concurrency")
            by_index = {partial.job.index: partial for partial in partials}
            jobs = [partial.job for partial in reversed(partials)]
            lock = threading.Lock()
            release = threading.Event()
            first_wave = threading.Event()
            active = 0
            started = 0
            peak = 0
            result: list[orchestrator.PartialPack] = []
            errors: list[BaseException] = []

            def runner(job: orchestrator.PackJob) -> orchestrator.PartialPack:
                nonlocal active, started, peak
                with lock:
                    active += 1
                    started += 1
                    peak = max(peak, active)
                    if active == orchestrator.MAX_WORKERS:
                        first_wave.set()
                try:
                    if not release.wait(timeout=5):
                        raise TimeoutError("test did not release the first worker wave")
                    # Deliberately scramble completion order.
                    time.sleep((len(jobs) - job.index) * 0.002)
                    return by_index[job.index]
                finally:
                    with lock:
                        active -= 1

            def invoke() -> None:
                try:
                    result.extend(
                        orchestrator.run_jobs(
                            jobs,
                            runner,
                            max_workers=orchestrator.MAX_WORKERS,
                        )
                    )
                except BaseException as error:  # surfaced in the test thread
                    errors.append(error)

            thread = threading.Thread(target=invoke, name="atlas-orchestrator-test")
            thread.start()
            reached_first_wave = first_wave.wait(timeout=2)
            with lock:
                first_wave_started = started
                first_wave_active = active
                first_wave_peak = peak
            release.set()
            thread.join(timeout=5)

            self.assertTrue(reached_first_wave, "three workers never became active together")
            self.assertFalse(thread.is_alive(), "run_jobs did not terminate")
            self.assertEqual(errors, [])
            self.assertEqual(first_wave_started, 3, "a fourth job started while the first wave was blocked")
            self.assertEqual(first_wave_active, 3)
            self.assertEqual(first_wave_peak, 3)
            self.assertEqual(peak, 3)
            self.assertEqual([partial.job.index for partial in result], list(range(len(jobs))))

            with self.assertRaisesRegex(orchestrator.OrchestrationError, "between 1 and 3"):
                orchestrator.run_jobs(jobs[:1], runner, max_workers=4)

    def test_merge_is_byte_deterministic_for_every_completion_order(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clips = ("tap_reaction", "idle", "blink", "happy")
            partials = _partials(root, clips, "determinism")
            expected_bytes: bytes | None = None
            expected_pages: tuple[str, ...] | None = None

            for permutation in itertools.permutations(partials):
                merged = orchestrator.merge_variant_fragments(permutation, expected_clips=reversed(clips))
                payload = merged.manifest_bytes()
                page_names = tuple(merged.pages)
                if expected_bytes is None:
                    expected_bytes = payload
                    expected_pages = page_names
                else:
                    self.assertEqual(payload, expected_bytes)
                    self.assertEqual(page_names, expected_pages)

            assert expected_bytes is not None
            canonical = orchestrator.merge_variant_fragments(partials, expected_clips=clips)
            self.assertEqual(list(canonical.manifest["clips"]), sorted(clips))
            self.assertEqual(tuple(canonical.pages), tuple(sorted(canonical.pages)))
            for field in ("animatedControls", "animatedChannels", "regions"):
                values = canonical.manifest["rigProof"][field]
                self.assertEqual(values, sorted(set(values)))

    def test_merge_conflicts_are_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            clips = ("idle", "blink")
            partials = _partials(root, clips, "conflicts")

            conflict_manifest = copy.deepcopy(partials[1].manifest)
            conflict_manifest["fps"] = FPS + 1
            fps_conflict = replace(partials[1], manifest=conflict_manifest)
            duplicate_job = replace(partials[0].job, index=99)
            duplicate = replace(partials[0], job=duplicate_job)
            other_variant_job = replace(partials[1].job, variant="teen", index=98)
            other_variant = replace(partials[1], job=other_variant_job)

            cases = (
                ("shared contract", [partials[0], fps_conflict], clips, "contract conflict: fps"),
                ("duplicate clip", [partials[0], duplicate], ("idle",), "duplicate clip fragment"),
                ("missing clip", [partials[0]], clips, "merged clip set mismatch"),
                ("multiple variants", [partials[0], other_variant], clips, "multiple variants"),
            )
            for label, fragments, expected, message in cases:
                with self.subTest(label=label):
                    with self.assertRaisesRegex(orchestrator.OrchestrationError, message):
                        orchestrator.merge_variant_fragments(fragments, expected_clips=expected)

    def test_publish_rolls_back_every_new_page_when_manifest_switch_fails(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = root / "inputs"
            target = root / "published"
            previous = _merged(inputs / "g0", "g0")
            candidate = _merged(inputs / "g1", "g1")
            orchestrator.publish_variant(previous, target)
            before = _tree_snapshot(target)
            manifest_path = target / VARIANT / orchestrator.MANIFEST_NAME

            def fail_at_manifest(source: str | os.PathLike[str], destination: str | os.PathLike[str]) -> None:
                if Path(destination) == manifest_path:
                    raise OSError("synthetic activation failure")
                os.replace(source, destination)

            with self.assertRaisesRegex(OSError, "synthetic activation failure"):
                orchestrator.publish_variant(candidate, target, replace_file=fail_at_manifest)

            self.assertEqual(_tree_snapshot(target), before)
            self.assertFalse(
                any(path.name.startswith(orchestrator.STAGING_PREFIX) for path in target.rglob("*")),
                "failed activation left a staging directory",
            )

            def move_manifest_then_raise(
                source: str | os.PathLike[str],
                destination: str | os.PathLike[str],
            ) -> None:
                os.replace(source, destination)
                if Path(destination) == manifest_path:
                    raise OSError("synthetic post-replace exception")

            with self.assertRaisesRegex(OSError, "post-replace exception"):
                orchestrator.publish_variant(candidate, target, replace_file=move_manifest_then_raise)
            self.assertEqual(_tree_snapshot(target), before)

    def test_manifest_is_switched_last_and_previous_generation_remains_readable(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = root / "inputs"
            target = root / "published"
            previous = _merged(inputs / "g0", "g0")
            candidate = _merged(inputs / "g1", "g1")
            orchestrator.publish_variant(previous, target)

            variant_root = target / VARIANT
            atlas_root = variant_root / orchestrator.ATLAS_DIRECTORY
            manifest_path = variant_root / orchestrator.MANIFEST_NAME
            previous_manifest_bytes = manifest_path.read_bytes()
            previous_names = orchestrator.referenced_page_names(previous.manifest)
            candidate_names = orchestrator.referenced_page_names(candidate.manifest)
            calls: list[str] = []

            def recording_replace(source: str | os.PathLike[str], destination: str | os.PathLike[str]) -> None:
                destination_path = Path(destination)
                if destination_path == manifest_path:
                    self.assertEqual(manifest_path.read_bytes(), previous_manifest_bytes)
                    self.assertTrue(all((atlas_root / name).is_file() for name in candidate_names))
                    calls.append(orchestrator.MANIFEST_NAME)
                else:
                    self.assertEqual(manifest_path.read_bytes(), previous_manifest_bytes)
                    calls.append(destination_path.name)
                os.replace(source, destination)

            orchestrator.publish_variant(candidate, target, replace_file=recording_replace)

            self.assertEqual(calls, [*sorted(candidate_names), orchestrator.MANIFEST_NAME])
            self.assertEqual(manifest_path.read_bytes(), candidate.manifest_bytes())
            self.assertEqual(
                {path.name for path in atlas_root.glob("*.webp")},
                candidate_names | previous_names,
            )
            self.assertTrue(all((atlas_root / name).read_bytes() for name in previous_names))

    def test_retention_window_is_exactly_current_plus_immediate_previous(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "published"
            generations = [
                _merged(root / "inputs" / generation, generation)
                for generation in ("g0", "g1", "g2")
            ]
            names = [orchestrator.referenced_page_names(item.manifest) for item in generations]
            self.assertFalse(names[0] & names[1])
            self.assertFalse(names[1] & names[2])

            orchestrator.publish_variant(generations[0], target)
            orchestrator.publish_variant(generations[1], target)
            atlas_root = target / VARIANT / orchestrator.ATLAS_DIRECTORY
            self.assertEqual({path.name for path in atlas_root.glob("*.webp")}, names[0] | names[1])

            orchestrator.publish_variant(generations[2], target)
            retained = {path.name for path in atlas_root.glob("*.webp")}
            self.assertEqual(retained, names[1] | names[2])
            self.assertTrue(names[0].isdisjoint(retained), "G0 survived after G2 activation")


if __name__ == "__main__":
    unittest.main()
