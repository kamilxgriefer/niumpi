from __future__ import annotations

import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

from scripts.niumpi import build_atlases as packer


class AtlasSchemaV3Tests(unittest.TestCase):
    def test_canonicalization_zeros_only_fully_transparent_rgb(self):
        array = np.zeros((8, 8, 4), dtype=np.uint8)
        array[..., :3] = (231, 82, 19)
        array[2, 3] = (17, 91, 203, 1)
        array[4, 5] = (21, 88, 144, 128)
        canonical = np.asarray(
            packer.canonicalize_transparent_rgb(Image.fromarray(array, "RGBA"))
        )
        self.assertTrue(np.all(canonical[canonical[..., 3] == 0, :3] == 0))
        self.assertEqual(tuple(canonical[2, 3]), (17, 91, 203, 1))
        self.assertEqual(tuple(canonical[4, 5]), (21, 88, 144, 128))

    def test_trimmed_pack_and_lossless_codec_reconstruct_canonical_rgba(self):
        canvas = (64, 64)
        sources: list[packer.SourceFrame] = []
        for index in range(7):
            array = np.zeros((canvas[1], canvas[0], 4), dtype=np.uint8)
            array[..., :3] = (71 + index, 29, 199)  # deliberately hidden RGB
            x0 = 4 + index
            y0 = 8 + index
            width = 16 + index
            height = 22
            array[y0 : y0 + height, x0 : x0 + width] = (
                40 + index * 9,
                150,
                210 - index * 4,
                255,
            )
            # Semi-transparent edge colour is semantic and must not be zeroed.
            array[y0, x0 : x0 + width] = (200, 70, 120, 96)
            canonical = packer.canonicalize_transparent_rgb(Image.fromarray(array, "RGBA"))
            bbox = canonical.getchannel("A").getbbox()
            self.assertIsNotNone(bbox)
            sources.append(packer.SourceFrame(index, canonical, bbox))

        packed = packer.pack_trimmed_frames(sources, canvas)
        self.assertTrue(packer.geometry_is_exact(packed))
        self.assertTrue(all(page.width * page.height * 4 <= packer.MAX_DECODED_PAGE_BYTES for page in packed.pages))
        self.assertTrue(all(frame.x >= 4 and frame.y >= 4 for frame in packed.frames))
        self.assertTrue(all(frame.offset_x > 0 and frame.offset_y > 0 for frame in packed.frames))

        encoded = [packer.encode_webp(page, None) for page in packed.pages]
        metrics = packer.codec_metrics(packed, encoded)
        self.assertEqual(metrics["alphaMAE"], 0)
        self.assertEqual(metrics["foregroundMAE"], 0)
        self.assertIsNone(metrics["foregroundPSNR"])
        self.assertTrue(metrics["canonicalRGBAExact"])

        selected, encoding = packer.select_clip_encoding(
            packed,
            max_mae=2.5,
            min_psnr=38.0,
            quality_hint=92,
        )
        selected_metrics = packer.codec_metrics(packed, selected)
        self.assertTrue(packer.codec_passes(selected_metrics, 2.5, 38.0))
        self.assertEqual(encoding["alpha"]["meanAbsoluteError"], 0)
        self.assertTrue(encoding["frameGate"]["allFramesPassed"])
        self.assertEqual(len(encoding["frameGate"]["frames"]), len(sources))
        self.assertEqual(
            encoding["selection"]["claim"],
            "first-passing-declared-candidate" if encoding["rgb"]["lossy"] else "declared-candidates-exhausted",
        )
        if encoding["rgb"]["lossy"]:
            quality = encoding["rgb"]["quality"]
            self.assertEqual(encoding["selection"]["selectedQuality"], quality)
            if quality > packer.QUALITY_CANDIDATES[0]:
                self.assertEqual(encoding["selection"]["predecessor"]["quality"], quality - 1)
                self.assertFalse(encoding["selection"]["predecessor"]["passes"])
            else:
                self.assertIsNone(encoding["selection"]["predecessor"])
        else:
            self.assertEqual(encoding["selection"]["predecessor"]["quality"], 100)

    def test_quality_boundary_records_the_failing_predecessor(self):
        def evaluate(quality: int):
            return {"passes": quality >= 86, "quality": quality}

        selected, predecessor, evaluated = packer.find_quality_boundary(evaluate)
        self.assertEqual(selected, 86)
        self.assertEqual(predecessor, {"passes": False, "quality": 85})
        self.assertEqual(evaluated, list(range(79, 87)))

    def test_quality_boundary_falls_back_when_q100_fails(self):
        selected, predecessor, evaluated = packer.find_quality_boundary(
            lambda quality: {"passes": False, "quality": quality}
        )
        self.assertIsNone(selected)
        self.assertEqual(predecessor, {"passes": False, "quality": 100})
        self.assertEqual(evaluated, list(range(79, 101)))

    def test_first_declared_quality_can_pass_without_a_predecessor(self):
        selected, predecessor, evaluated = packer.find_quality_boundary(
            lambda quality: {"passes": True, "quality": quality}
        )
        self.assertEqual(selected, packer.QUALITY_CANDIDATES[0])
        self.assertIsNone(predecessor)
        self.assertEqual(evaluated, [packer.QUALITY_CANDIDATES[0]])

    def test_per_frame_gate_cannot_hide_one_bad_frame_in_clip_average(self):
        metrics = {
            "foregroundMAE": 1.0,
            "foregroundPSNR": 42.0,
            "alphaMAE": 0.0,
            "perFrame": [
                {"index": 0, "foregroundMAE": 1.0, "foregroundPSNR": 42.0, "alphaMAE": 0.0},
                {"index": 1, "foregroundMAE": 2.7, "foregroundPSNR": 37.9, "alphaMAE": 0.0},
            ],
        }
        self.assertFalse(packer.codec_passes(metrics, 2.5, 38.0))

    def test_partial_publish_refuses_before_touching_existing_core(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "baby"
            atlas = root / "atlases" / "idle-core.webp"
            atlas.parent.mkdir(parents=True)
            atlas.write_bytes(b"core-atlas")
            manifest = root / "manifest.json"
            manifest.write_text('{"schemaVersion":2,"clips":{"idle":{}}}\n')
            before_manifest = manifest.read_bytes()
            before_atlas = atlas.read_bytes()

            with self.assertRaisesRegex(RuntimeError, "--clips cannot publish"):
                packer.guard_partial_publish(root, {"sad"})

            self.assertEqual(manifest.read_bytes(), before_manifest)
            self.assertEqual(atlas.read_bytes(), before_atlas)

    def test_report_provenance_and_source_png_hashes_are_verified(self):
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary)
            master = repo / "art/niumpi/blender/test.blend"
            approved = repo / "public/assets/niumpi/stages/stage-1.webp"
            landmarks = repo / "art/niumpi/variant-landmarks.json"
            for path, data in (
                (master, b"master"),
                (approved, b"approved"),
                (landmarks, b"landmarks"),
            ):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            for index, relative in enumerate(packer.GENERATOR_SOURCE_PATHS):
                path = repo / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(f"generator-{index}".encode())
            digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
            report = {
                "provenance": {
                    "master": master.relative_to(repo).as_posix(),
                    "masterSha256": digest(master),
                    "approvedArt": approved.relative_to(repo).as_posix(),
                    "approvedArtSha256": digest(approved),
                    "landmarksSha256": digest(landmarks),
                    "generatorSha256": packer.generator_sha256(repo),
                }
            }
            verified = packer.validate_report_provenance(report, repo)
            self.assertEqual(verified["masterSha256"], digest(master))
            master.write_bytes(b"tampered")
            with self.assertRaisesRegex(RuntimeError, "master sha256 mismatch"):
                packer.validate_report_provenance(report, repo)
            master.write_bytes(b"master")
            (repo / packer.GENERATOR_SOURCE_PATHS[0]).write_bytes(b"changed-generator")
            with self.assertRaisesRegex(RuntimeError, "generator sha256 mismatch"):
                packer.validate_report_provenance(report, repo)

            frame = repo / "0000.png"
            frame.write_bytes(b"frame")
            rendered = {"frameHashes": [digest(frame)]}
            self.assertEqual(packer.validate_source_frame_hashes("idle", rendered, [frame]), [digest(frame)])
            frame.write_bytes(b"changed")
            with self.assertRaisesRegex(RuntimeError, "source PNG hash mismatch"):
                packer.validate_source_frame_hashes("idle", rendered, [frame])

    def test_evidence_tampering_and_transparent_rgb_overclaim_are_rejected(self):
        contract = packer.packing_contract()
        self.assertEqual(contract["sourceCanonicalization"]["stage"], "pre-encode")
        self.assertEqual(contract["decodedTransparentRGB"], "unspecified-for-lossy-webp")
        evidence = {
            "format": "WebP",
            "rgb": {"lossy": True, "quality": 86, "foregroundMAE": 2.0, "foregroundPSNR": 38.5},
            "alpha": {"lossless": True, "meanAbsoluteError": 0.0},
            "thresholds": {"foregroundMAEMax": 2.5, "foregroundPSNRMin": 38.0, "alphaMAE": 0.0},
            "selection": {
                "strategy": "lowest-passing-quality",
                "claim": "first-passing-declared-candidate",
                "candidateQualities": [85, 86, 100],
                "selectedQuality": 86,
                "predecessor": {
                    "quality": 85, "passes": False, "foregroundMAE": 2.7,
                    "foregroundPSNR": 37.8, "alphaMAE": 0.0, "failingFrames": [0],
                },
                "evaluatedQualities": [85, 86],
                "candidateProofs": [
                    {
                        "quality": 85, "passes": False, "foregroundMAE": 2.7,
                        "foregroundPSNR": 37.8, "alphaMAE": 0.0, "failingFrames": [0],
                    },
                    {
                        "quality": 86, "passes": True, "foregroundMAE": 2.0,
                        "foregroundPSNR": 38.5, "alphaMAE": 0.0, "failingFrames": [],
                    },
                ],
            },
            "frameGate": {
                "allFramesPassed": True,
                "frames": [
                    {"index": 0, "passes": True, "foregroundMAE": 2.0, "foregroundPSNR": 38.5, "alphaMAE": 0.0},
                ],
            },
        }
        packer.validate_encoding_evidence(evidence, 1)
        tampered = copy.deepcopy(evidence)
        tampered["frameGate"]["frames"][0]["passes"] = False
        with self.assertRaisesRegex(RuntimeError, "does not pass every frame"):
            packer.validate_encoding_evidence(tampered, 1)

    def test_mixed_predecessor_lineage_preserves_old_core_provenance(self):
        core_hashes = ["1" * 64, "2" * 64]
        semantic_hashes = ["3" * 64]
        old_provenance = {
            "master": "art/niumpi/blender/niumpi_master.blend",
            "masterSha256": "a" * 64,
            "generatorSha256": "b" * 64,
            "approvedArt": "public/assets/niumpi/stages/stage-1.webp",
            "approvedArtSha256": "c" * 64,
            "landmarksSha256": "d" * 64,
        }
        report = {
            "clips": {
                "idle": {"frameCount": 2, "frameHashes": core_hashes},
                "sad": {"frameCount": 1, "frameHashes": semantic_hashes},
            },
            "provenance": {
                "corePredecessor": {
                    "reportProvenance": old_provenance,
                    "clipFrameHashDigests": {"idle": packer.frame_hash_digest(core_hashes)},
                    "preservedClips": ["idle"],
                },
                "semanticBatch": {"clips": ["sad"], "frameCount": 1},
            },
        }
        self.assertEqual(
            packer.validate_report_lineage(report),
            {"idle": "corePredecessor", "sad": "current"},
        )
        tampered = copy.deepcopy(report)
        tampered["provenance"]["corePredecessor"]["clipFrameHashDigests"]["idle"] = "0" * 64
        with self.assertRaisesRegex(RuntimeError, "predecessor digest mismatch"):
            packer.validate_report_lineage(tampered)


if __name__ == "__main__":
    unittest.main()
