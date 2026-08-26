from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from scripts.niumpi import repage_lossless_atlas as repager


class LosslessAtlasRepagerTests(unittest.TestCase):
    def fixture(self, root: Path, *, lossless: bool = True) -> tuple[Path, list[bytes]]:
        public = root / "public"
        variant_root = public / "assets/niumpi/v2/sparkleap"
        atlas_root = variant_root / "atlases"
        atlas_root.mkdir(parents=True)

        frames: list[Image.Image] = []
        for index in range(6):
            image = Image.new("RGBA", (16, 16), (17 + index, 31, 71, 0))
            for y in range(3, 14):
                for x in range(2, 15):
                    image.putpixel(
                        (x, y),
                        (40 + index * 13, 90 + x, 180 - y, 60 + ((x + y + index) % 4) * 60),
                    )
            frames.append(image)

        source = Image.new("RGBA", (96, 16), (0, 0, 0, 0))
        for index, frame in enumerate(frames):
            source.paste(frame, (index * 16, 0))
        source_path = atlas_root / "idle-0-source.webp"
        source.save(
            source_path,
            "WEBP",
            lossless=lossless,
            quality=100 if lossless else 90,
            method=6,
            exact=True,
        )
        source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
        manifest = {
            "schemaVersion": 2,
            "variant": "sparkleap",
            "fps": 24,
            "canvas": {"width": 16, "height": 16},
            "anchor": {"x": 8, "y": 15},
            "clips": {
                "idle": {
                    "name": "idle",
                    "frameCount": 6,
                    "loop": True,
                    "atlas": {
                        "pages": [
                            {
                                "src": "/assets/niumpi/v2/sparkleap/atlases/idle-0-source.webp",
                                "width": 96,
                                "height": 16,
                            }
                        ]
                    },
                    "frames": [
                        {
                            "index": index,
                            "page": 0,
                            "x": index * 16,
                            "y": 0,
                            "w": 16,
                            "h": 16,
                            "anchorX": 8,
                            "anchorY": 15,
                            "durationMs": 41.667,
                        }
                        for index in range(6)
                    ],
                    "events": [{"frame": 2, "type": "pulse"}],
                    "rigProof": {
                        "animatedControls": ["root"],
                        "animatedChannels": ["root.location"],
                        "regions": ["body"],
                    },
                }
            },
            "rigProof": {
                "animatedControls": ["root"],
                "animatedChannels": ["root.location"],
                "regions": ["body"],
            },
            "provenance": {
                "master": "art/niumpi/blender/sparkleap_master.blend",
                "packerSha256": "a" * 64,
                "sha256": {"idle:0": source_hash},
            },
        }
        manifest_path = variant_root / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        return manifest_path, [frame.tobytes() for frame in frames]

    def test_repages_schema_v2_exactly_and_atomically(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, original_frame_pixels = self.fixture(root)
            original = json.loads(manifest_path.read_text())
            result = repager.build_repage_result(
                manifest_path,
                root / "public",
                max_page_bytes=1_000_000,
                max_page_dimension=32,
                requested_clips={"idle"},
            )

            self.assertEqual(result.manifest["schemaVersion"], 2)
            self.assertEqual(result.affected_clips, ("idle",))
            self.assertEqual(len(result.manifest["clips"]["idle"]["atlas"]["pages"]), 2)
            self.assertEqual(result.manifest["clips"]["idle"]["events"], original["clips"]["idle"]["events"])
            self.assertEqual(result.manifest["clips"]["idle"]["rigProof"], original["clips"]["idle"]["rigProof"])
            self.assertEqual(result.manifest["provenance"]["packerSha256"], "a" * 64)
            self.assertEqual(result.manifest["provenance"]["repage"]["sourceSchemaVersion"], 2)

            repager.publish_result(result, manifest_path)
            published = json.loads(manifest_path.read_text())
            self.assertFalse((manifest_path.parent / "atlases/idle-0-source.webp").exists())
            self.assertEqual(list(manifest_path.parent.glob(".atlas-repage-*")), [])

            reconstructed: list[bytes] = []
            pages: list[Image.Image] = []
            for page in published["clips"]["idle"]["atlas"]["pages"]:
                path = root / "public" / page["src"].lstrip("/")
                self.assertTrue(path.is_file())
                self.assertLessEqual(path.stat().st_size, 1_000_000)
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), page["sha256"])
                with Image.open(path) as opened:
                    pages.append(opened.convert("RGBA"))
            for frame in published["clips"]["idle"]["frames"]:
                page = pages[frame["page"]]
                reconstructed.append(
                    page.crop(
                        (
                            frame["x"],
                            frame["y"],
                            frame["x"] + frame["w"],
                            frame["y"] + frame["h"],
                        )
                    ).tobytes()
                )
            self.assertEqual(reconstructed, original_frame_pixels)

            noop = repager.build_repage_result(
                manifest_path,
                root / "public",
                max_page_bytes=1_000_000,
                max_page_dimension=32,
            )
            self.assertEqual(noop.affected_clips, ())

    def test_rejects_a_lossy_source_page(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, _ = self.fixture(root, lossless=False)
            with self.assertRaisesRegex(RuntimeError, "source page is not lossless WebP"):
                repager.build_repage_result(
                    manifest_path,
                    root / "public",
                    max_page_bytes=1_000_000,
                    max_page_dimension=32,
                    requested_clips={"idle"},
                )

    def test_rejects_a_source_page_that_does_not_match_manifest_provenance(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, _ = self.fixture(root)
            manifest = json.loads(manifest_path.read_text())
            manifest["provenance"]["sha256"]["idle:0"] = "0" * 64
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "does not match manifest provenance"):
                repager.build_repage_result(
                    manifest_path,
                    root / "public",
                    max_page_bytes=1_000_000,
                    max_page_dimension=32,
                    requested_clips={"idle"},
                )

    def test_refuses_to_invent_v3_codec_proofs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest_path, _ = self.fixture(root)
            manifest = json.loads(manifest_path.read_text())
            manifest["schemaVersion"] = 3
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "schemaVersion 2 only"):
                repager.build_repage_result(
                    manifest_path,
                    root / "public",
                    max_page_bytes=1_000_000,
                    max_page_dimension=32,
                    requested_clips={"idle"},
                )


if __name__ == "__main__":
    unittest.main()
