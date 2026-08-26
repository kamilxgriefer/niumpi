#!/usr/bin/env python3
"""Split oversized, lossless sprite-atlas pages without changing frame pixels.

This is deliberately a layout-only migration tool.  It decodes frames from
the atlas referenced by an existing manifest, packs those exact RGBA crops on
smaller pages, encodes the pages as lossless WebP and proves byte-for-byte
frame reconstruction before an atomic manifest swap.

The tool preserves the manifest schema and every clip field except
``atlas.pages`` plus the frame ``page/x/y`` coordinates.  It is therefore
safe for the legacy schema-v2 variants that predate the trimmed schema-v3
packer and does not invent codec-selection evidence that was never recorded.
"""

from __future__ import annotations

import argparse
import copy
import fcntl
import hashlib
import io
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from PIL import Image


REPO = Path(__file__).resolve().parents[2]
PUBLIC_ROOT = REPO / "public"
DEFAULT_MANIFEST = PUBLIC_ROOT / "assets/niumpi/v2/sparkleap/manifest.json"
DEFAULT_MAX_PAGE_BYTES = 8_500_000
DEFAULT_MAX_PAGE_DIMENSION = 3_072
MAX_RUNTIME_PAGE_DIMENSION = 4_096
MAX_DECODED_PAGE_BYTES = 44_040_192


@dataclass(frozen=True)
class DecodedFrame:
    index: int
    image: Image.Image
    source_page: int
    source_rect: tuple[int, int, int, int]


@dataclass(frozen=True)
class PagePlan:
    image: Image.Image
    blob: bytes
    placements: tuple[tuple[int, int, int], ...]


@dataclass(frozen=True)
class RepageResult:
    manifest: dict[str, Any]
    pages: dict[str, bytes]
    removed_pages: tuple[Path, ...]
    affected_clips: tuple[str, ...]
    frame_digests: dict[str, str]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--public-root", type=Path, default=PUBLIC_ROOT)
    parser.add_argument("--max-page-bytes", type=int, default=DEFAULT_MAX_PAGE_BYTES)
    parser.add_argument("--max-page-dimension", type=int, default=DEFAULT_MAX_PAGE_DIMENSION)
    parser.add_argument(
        "--clips",
        nargs="*",
        help="Explicit clips to repage; by default only clips with an oversized page are selected",
    )
    parser.add_argument(
        "--publish",
        action="store_true",
        help="Atomically install the verified pages and manifest (default is a read-only plan)",
    )
    args = parser.parse_args()
    if args.max_page_bytes <= 0:
        parser.error("--max-page-bytes must be positive")
    if args.max_page_dimension <= 0:
        parser.error("--max-page-dimension must be positive")
    if args.max_page_dimension > MAX_RUNTIME_PAGE_DIMENSION:
        parser.error(f"--max-page-dimension must be <= {MAX_RUNTIME_PAGE_DIMENSION}")
    return args


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def bytes_sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def rgba_digest(frames: Iterable[DecodedFrame]) -> str:
    digest = hashlib.sha256()
    for frame in frames:
        digest.update(frame.index.to_bytes(4, "big"))
        digest.update(frame.image.width.to_bytes(4, "big"))
        digest.update(frame.image.height.to_bytes(4, "big"))
        digest.update(frame.image.tobytes())
    return digest.hexdigest()


def webp_is_lossless(blob: bytes) -> bool:
    """Return true only when the RIFF payload contains lossless VP8L data."""

    if len(blob) < 12 or blob[:4] != b"RIFF" or blob[8:12] != b"WEBP":
        return False
    cursor = 12
    while cursor + 8 <= len(blob):
        kind = blob[cursor : cursor + 4]
        size = int.from_bytes(blob[cursor + 4 : cursor + 8], "little")
        start = cursor + 8
        end = start + size
        if end > len(blob):
            return False
        if kind == b"VP8L":
            return True
        if kind == b"VP8 ":
            return False
        cursor = end + (size & 1)
    return False


def encode_lossless(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.save(output, "WEBP", lossless=True, quality=100, method=6, exact=True)
    blob = output.getvalue()
    if not webp_is_lossless(blob):
        raise RuntimeError("Pillow did not produce a lossless WebP page")
    return blob


def resolve_page_path(page: dict[str, Any], manifest_path: Path, public_root: Path) -> Path:
    source = page.get("src")
    if not isinstance(source, str) or not source:
        raise RuntimeError("atlas page has no src")
    if source.startswith("/"):
        path = (public_root / source[1:]).resolve()
    else:
        path = (manifest_path.parent / source).resolve()
    root = public_root.resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise RuntimeError(f"atlas page escapes public root or is missing: {source}")
    return path


def atlas_pages(clip: dict[str, Any]) -> list[dict[str, Any]]:
    atlas = clip.get("atlas")
    if not isinstance(atlas, dict):
        raise RuntimeError("clip has no atlas object")
    pages = atlas.get("pages")
    if not isinstance(pages, list) or not pages:
        raise RuntimeError("repage requires an atlas.pages manifest")
    if not all(isinstance(page, dict) for page in pages):
        raise RuntimeError("atlas.pages contains an invalid page")
    return pages


def decode_clip_frames(
    clip_name: str,
    clip: dict[str, Any],
    manifest_path: Path,
    public_root: Path,
) -> tuple[list[DecodedFrame], list[Path], list[dict[str, Any]]]:
    page_records = atlas_pages(clip)
    page_paths = [resolve_page_path(page, manifest_path, public_root) for page in page_records]
    decoded_pages: list[Image.Image] = []
    for page, path in zip(page_records, page_paths, strict=True):
        blob = path.read_bytes()
        if not webp_is_lossless(blob):
            raise RuntimeError(f"{clip_name}: source page is not lossless WebP: {path.name}")
        with Image.open(io.BytesIO(blob)) as opened:
            decoded = opened.convert("RGBA")
        declared = (int(page.get("width", -1)), int(page.get("height", -1)))
        if decoded.size != declared:
            raise RuntimeError(
                f"{clip_name}: page dimensions disagree for {path.name}: {decoded.size} != {declared}"
            )
        decoded_pages.append(decoded)

    frames = clip.get("frames")
    if not isinstance(frames, list) or len(frames) != clip.get("frameCount"):
        raise RuntimeError(f"{clip_name}: invalid frame list")
    result: list[DecodedFrame] = []
    for expected_index, frame in enumerate(frames):
        if not isinstance(frame, dict) or int(frame.get("index", -1)) != expected_index:
            raise RuntimeError(f"{clip_name}: non-sequential frame {expected_index}")
        page_index = int(frame.get("page", 0))
        if page_index < 0 or page_index >= len(decoded_pages):
            raise RuntimeError(f"{clip_name}: frame {expected_index} references missing page")
        x = int(frame.get("x", -1))
        y = int(frame.get("y", -1))
        width = int(frame.get("w", -1))
        height = int(frame.get("h", -1))
        page = decoded_pages[page_index]
        if width <= 0 or height <= 0 or x < 0 or y < 0 or x + width > page.width or y + height > page.height:
            raise RuntimeError(f"{clip_name}: frame {expected_index} lies outside its page")
        result.append(
            DecodedFrame(
                index=expected_index,
                image=page.crop((x, y, x + width, y + height)),
                source_page=page_index,
                source_rect=(x, y, width, height),
            )
        )
    return result, page_paths, page_records


def validate_source_page_provenance(
    clip_name: str,
    page_records: list[dict[str, Any]],
    page_paths: list[Path],
    manifest_hashes: dict[str, Any],
) -> None:
    for page_index, (page, path) in enumerate(zip(page_records, page_paths, strict=True)):
        actual = file_sha256(path)
        manifest_hash = manifest_hashes.get(f"{clip_name}:{page_index}")
        page_hash = page.get("sha256")
        if not isinstance(manifest_hash, str) or len(manifest_hash) != 64:
            raise RuntimeError(f"{clip_name}:{page_index}: source provenance sha256 is missing")
        if actual != manifest_hash:
            raise RuntimeError(
                f"{clip_name}:{page_index}: source page sha256 does not match manifest provenance"
            )
        if page_hash is not None and page_hash != actual:
            raise RuntimeError(f"{clip_name}:{page_index}: source page.sha256 mismatch")


def layout_prefix(
    frames: list[DecodedFrame],
    max_dimension: int,
) -> tuple[Image.Image, tuple[tuple[int, int, int], ...]]:
    """Pack a contiguous prefix in deterministic rows, preserving each crop."""

    if not frames:
        raise ValueError("cannot pack an empty frame list")
    page = Image.new("RGBA", (max_dimension, max_dimension), (0, 0, 0, 0))
    placements: list[tuple[int, int, int]] = []
    x = 0
    y = 0
    row_height = 0
    used_width = 0
    used_height = 0
    for frame in frames:
        width, height = frame.image.size
        if width > max_dimension or height > max_dimension:
            raise RuntimeError(
                f"frame {frame.index} ({width}x{height}) exceeds max page dimension {max_dimension}"
            )
        if x + width > max_dimension:
            x = 0
            y += row_height
            row_height = 0
        if y + height > max_dimension:
            raise RuntimeError("requested prefix does not fit the page dimension")
        page.paste(frame.image, (x, y))
        placements.append((frame.index, x, y))
        used_width = max(used_width, x + width)
        used_height = max(used_height, y + height)
        x += width
        row_height = max(row_height, height)
    return page.crop((0, 0, used_width, used_height)), tuple(placements)


def max_prefix_by_geometry(frames: list[DecodedFrame], max_dimension: int) -> int:
    x = 0
    y = 0
    row_height = 0
    count = 0
    for frame in frames:
        width, height = frame.image.size
        if width > max_dimension or height > max_dimension:
            raise RuntimeError(
                f"frame {frame.index} ({width}x{height}) exceeds max page dimension {max_dimension}"
            )
        if x + width > max_dimension:
            x = 0
            y += row_height
            row_height = 0
        if y + height > max_dimension:
            break
        x += width
        row_height = max(row_height, height)
        count += 1
    return count


def page_for_prefix(
    remaining: list[DecodedFrame],
    max_dimension: int,
    max_page_bytes: int,
) -> tuple[PagePlan, int]:
    maximum = max_prefix_by_geometry(remaining, max_dimension)
    if maximum <= 0:
        raise RuntimeError("no frame fits within the requested page dimension")
    for count in range(maximum, 0, -1):
        image, placements = layout_prefix(remaining[:count], max_dimension)
        if image.width * image.height * 4 > MAX_DECODED_PAGE_BYTES:
            continue
        blob = encode_lossless(image)
        if len(blob) <= max_page_bytes:
            return PagePlan(image=image, blob=blob, placements=placements), count
    single = remaining[0]
    raise RuntimeError(
        f"frame {single.index} cannot fit encoded byte cap {max_page_bytes}; "
        "increase --max-page-bytes"
    )


def pack_frames(
    frames: list[DecodedFrame],
    max_dimension: int,
    max_page_bytes: int,
) -> list[PagePlan]:
    pages: list[PagePlan] = []
    cursor = 0
    while cursor < len(frames):
        page, count = page_for_prefix(frames[cursor:], max_dimension, max_page_bytes)
        pages.append(page)
        cursor += count
    return pages


def verify_reconstruction(
    clip_name: str,
    source_frames: list[DecodedFrame],
    pages: list[PagePlan],
    frame_records: list[dict[str, Any]],
) -> None:
    decoded_pages: list[Image.Image] = []
    for page in pages:
        if len(page.blob) <= 0:
            raise RuntimeError(f"{clip_name}: zero-byte output page")
        with Image.open(io.BytesIO(page.blob)) as opened:
            decoded_pages.append(opened.convert("RGBA"))
    for source, record in zip(source_frames, frame_records, strict=True):
        page = decoded_pages[int(record["page"])]
        reconstructed = page.crop(
            (
                int(record["x"]),
                int(record["y"]),
                int(record["x"]) + int(record["w"]),
                int(record["y"]) + int(record["h"]),
            )
        )
        if reconstructed.size != source.image.size or reconstructed.tobytes() != source.image.tobytes():
            raise RuntimeError(
                f"{clip_name}: repaged frame {source.index} does not exactly reconstruct source RGBA"
            )


def build_repage_result(
    manifest_path: Path,
    public_root: Path,
    max_page_bytes: int,
    max_page_dimension: int,
    requested_clips: set[str] | None = None,
) -> RepageResult:
    manifest_path = manifest_path.resolve()
    public_root = public_root.resolve()
    original_bytes = manifest_path.read_bytes()
    original = json.loads(original_bytes)
    if original.get("schemaVersion") != 2:
        raise RuntimeError("this layout-only migration intentionally supports schemaVersion 2 only")
    if not isinstance(original.get("clips"), dict):
        raise RuntimeError("manifest has no clips object")

    if requested_clips is None:
        selected = {
            name
            for name, clip in original["clips"].items()
            if any(
                resolve_page_path(page, manifest_path, public_root).stat().st_size > max_page_bytes
                for page in atlas_pages(clip)
            )
        }
    else:
        unknown = requested_clips - set(original["clips"])
        if unknown:
            raise RuntimeError(f"unknown requested clips: {sorted(unknown)}")
        selected = set(requested_clips)
    if not selected:
        return RepageResult(
            manifest=original,
            pages={},
            removed_pages=(),
            affected_clips=(),
            frame_digests={},
        )

    updated = copy.deepcopy(original)
    page_blobs: dict[str, bytes] = {}
    removed_paths: set[Path] = set()
    frame_digests: dict[str, str] = {}
    source_page_proof: dict[str, list[dict[str, Any]]] = {}
    result_page_proof: dict[str, list[dict[str, Any]]] = {}
    original_hashes = original.get("provenance", {}).get("sha256")
    if not isinstance(original_hashes, dict):
        raise RuntimeError("manifest provenance.sha256 is not an object")
    manifest_hashes = updated.setdefault("provenance", {}).setdefault("sha256", {})
    if not isinstance(manifest_hashes, dict):
        raise RuntimeError("manifest provenance.sha256 is not an object")

    variant = updated.get("variant")
    if not isinstance(variant, str) or not variant:
        raise RuntimeError("manifest variant is missing")
    for clip_name in sorted(selected):
        source_clip = original["clips"][clip_name]
        frames, old_paths, old_page_records = decode_clip_frames(
            clip_name, source_clip, manifest_path, public_root
        )
        validate_source_page_provenance(
            clip_name, old_page_records, old_paths, original_hashes
        )
        frame_digest = rgba_digest(frames)
        frame_digests[clip_name] = frame_digest
        source_page_proof[clip_name] = [
            {
                "src": record["src"],
                "bytes": path.stat().st_size,
                "sha256": file_sha256(path),
            }
            for record, path in zip(old_page_records, old_paths, strict=True)
        ]
        page_records: list[dict[str, Any]] = []
        result_page_proof[clip_name] = []
        placement_by_frame: dict[int, tuple[int, int, int]] = {}
        output_plans: list[PagePlan] = []
        frames_by_source_page: dict[int, list[DecodedFrame]] = {
            page_index: [] for page_index in range(len(old_page_records))
        }
        for frame in frames:
            frames_by_source_page[frame.source_page].append(frame)

        for source_page_index, (old_record, old_path) in enumerate(
            zip(old_page_records, old_paths, strict=True)
        ):
            source_frames = sorted(
                frames_by_source_page[source_page_index], key=lambda frame: frame.index
            )
            force_page = requested_clips is not None
            should_repage = force_page or old_path.stat().st_size > max_page_bytes
            if should_repage:
                replacements = pack_frames(source_frames, max_page_dimension, max_page_bytes)
                removed_paths.add(old_path)
            else:
                blob = old_path.read_bytes()
                with Image.open(io.BytesIO(blob)) as opened:
                    image = opened.convert("RGBA")
                replacements = [PagePlan(image=image, blob=blob, placements=())]

            for replacement in replacements:
                output_page_index = len(page_records)
                content_hash = bytes_sha256(replacement.blob)
                if should_repage:
                    filename = f"{clip_name}-{output_page_index}-{content_hash[:12]}.webp"
                    relative_source = f"/assets/niumpi/v2/{variant}/atlases/{filename}"
                    page_blobs[filename] = replacement.blob
                    for frame_index, x, y in replacement.placements:
                        if frame_index in placement_by_frame:
                            raise RuntimeError(f"{clip_name}: frame {frame_index} was packed twice")
                        placement_by_frame[frame_index] = (output_page_index, x, y)
                else:
                    relative_source = str(old_record["src"])
                    for frame in source_frames:
                        x, y, _, _ = frame.source_rect
                        placement_by_frame[frame.index] = (output_page_index, x, y)

                decoded_bytes = replacement.image.width * replacement.image.height * 4
                if (
                    replacement.image.width > MAX_RUNTIME_PAGE_DIMENSION
                    or replacement.image.height > MAX_RUNTIME_PAGE_DIMENSION
                    or decoded_bytes > MAX_DECODED_PAGE_BYTES
                ):
                    raise RuntimeError(
                        f"{clip_name}: output page {output_page_index} exceeds runtime decode limits"
                    )
                if len(replacement.blob) > max_page_bytes:
                    raise RuntimeError(
                        f"{clip_name}: output page {output_page_index} exceeds encoded byte cap"
                    )
                record = {
                    "src": relative_source,
                    "width": replacement.image.width,
                    "height": replacement.image.height,
                    "decodedBytes": decoded_bytes,
                    "sha256": content_hash,
                }
                page_records.append(record)
                output_plans.append(replacement)
                result_page_proof[clip_name].append(
                    {
                        "src": relative_source,
                        "bytes": len(replacement.blob),
                        "sha256": content_hash,
                    }
                )

        for key in list(manifest_hashes):
            if key.startswith(f"{clip_name}:"):
                del manifest_hashes[key]
        for page_index, record in enumerate(page_records):
            manifest_hashes[f"{clip_name}:{page_index}"] = record["sha256"]

        target_clip = updated["clips"][clip_name]
        target_clip["atlas"] = {"pages": page_records}
        for frame in target_clip["frames"]:
            frame_index = int(frame["index"])
            page_index, x, y = placement_by_frame[frame_index]
            frame["page"] = page_index
            frame["x"] = x
            frame["y"] = y
        verify_reconstruction(clip_name, frames, output_plans, target_clip["frames"])
        if rgba_digest(frames) != frame_digest:
            raise RuntimeError(f"{clip_name}: source frame digest changed during repage")

    # Keep prior render/rig/source provenance intact and append a narrowly
    # scoped, reproducible layout migration record.
    tool_path = Path(__file__).resolve()
    updated["provenance"]["repage"] = {
        "tool": tool_path.relative_to(REPO).as_posix(),
        "toolSha256": file_sha256(tool_path),
        "sourceManifestSha256": bytes_sha256(original_bytes),
        "sourceSchemaVersion": original["schemaVersion"],
        "codec": "WebP lossless (Pillow method=6, exact=true)",
        "maxEncodedPageBytes": max_page_bytes,
        "maxPageDimension": max_page_dimension,
        "affectedClips": sorted(selected),
        "sourcePages": source_page_proof,
        "resultPages": result_page_proof,
        "decodedFrameRGBA": frame_digests,
    }

    # Verify every manifest hash, not only newly written pages.  New pages are
    # checked from memory; unchanged pages are checked on disk.
    for clip_name, clip in updated["clips"].items():
        for page_index, page in enumerate(atlas_pages(clip)):
            expected = manifest_hashes.get(f"{clip_name}:{page_index}")
            filename = Path(str(page["src"])).name
            if filename in page_blobs:
                actual = bytes_sha256(page_blobs[filename])
            else:
                actual = file_sha256(resolve_page_path(page, manifest_path, public_root))
            if expected != actual:
                raise RuntimeError(
                    f"{clip_name}:{page_index}: provenance sha256 mismatch after repage"
                )
            if page.get("sha256") is not None and page["sha256"] != actual:
                raise RuntimeError(f"{clip_name}:{page_index}: page sha256 mismatch after repage")
    return RepageResult(
        manifest=updated,
        pages=page_blobs,
        removed_pages=tuple(sorted(removed_paths)),
        affected_clips=tuple(sorted(selected)),
        frame_digests=frame_digests,
    )


def publish_result(result: RepageResult, manifest_path: Path) -> None:
    if not result.affected_clips:
        return
    manifest_path = manifest_path.resolve()
    atlas_root = manifest_path.parent / "atlases"
    atlas_root.mkdir(parents=True, exist_ok=True)
    new_names = set(result.pages)
    expected_manifest_hash = result.manifest.get("provenance", {}).get("repage", {}).get(
        "sourceManifestSha256"
    )
    if not isinstance(expected_manifest_hash, str):
        raise RuntimeError("repage provenance is missing the source manifest hash")
    lock_name = hashlib.sha256(str(manifest_path).encode("utf-8")).hexdigest()[:16]
    lock_path = Path(tempfile.gettempdir()) / f"niumpi-atlas-repage-{lock_name}.lock"
    with lock_path.open("a+b") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        if file_sha256(manifest_path) != expected_manifest_hash:
            raise RuntimeError("manifest changed after the repage plan was built; refusing stale publish")
        with tempfile.TemporaryDirectory(prefix=".atlas-repage-", dir=manifest_path.parent) as temporary:
            temp_root = Path(temporary)
            temp_atlas = temp_root / "atlases"
            temp_atlas.mkdir()
            for filename, blob in result.pages.items():
                path = temp_atlas / filename
                with path.open("wb") as handle:
                    handle.write(blob)
                    handle.flush()
                    os.fsync(handle.fileno())
                if path.stat().st_size != len(blob) or file_sha256(path) != bytes_sha256(blob):
                    raise RuntimeError(f"failed to stage verified page {filename}")
                destination = atlas_root / filename
                if destination.exists() and destination.read_bytes() != blob:
                    raise RuntimeError(f"content-address collision at {destination.name}")
            temp_manifest = temp_root / "manifest.json"
            with temp_manifest.open("w", encoding="utf-8") as handle:
                handle.write(json.dumps(result.manifest, indent=2) + "\n")
                handle.flush()
                os.fsync(handle.fileno())

            for filename in sorted(new_names):
                destination = atlas_root / filename
                if destination.exists():
                    (temp_atlas / filename).unlink()
                else:
                    os.replace(temp_atlas / filename, destination)
            os.replace(temp_manifest, manifest_path)

        referenced = {
            Path(str(page["src"])).name
            for clip in result.manifest["clips"].values()
            for page in atlas_pages(clip)
        }
        # The oversized predecessors must leave public/ or the Sites Git
        # source upload still rejects the repository even when they are no
        # longer referenced. Their exact source hashes remain in provenance.
        for old_path in result.removed_pages:
            if old_path.name not in referenced and old_path.exists():
                old_path.unlink()
    residue = list(manifest_path.parent.glob(".atlas-repage-*"))
    if residue:
        raise RuntimeError(f"temporary repage residue remains: {residue}")


def main() -> None:
    args = parse_args()
    requested = None if args.clips is None else set(args.clips)
    result = build_repage_result(
        args.manifest,
        args.public_root,
        max_page_bytes=args.max_page_bytes,
        max_page_dimension=args.max_page_dimension,
        requested_clips=requested,
    )
    if args.publish:
        publish_result(result, args.manifest)
    result_page_sizes = {
        Path(item["src"]).name: int(item["bytes"])
        for pages in result.manifest.get("provenance", {}).get("repage", {}).get(
            "resultPages", {}
        ).values()
        for item in pages
    }
    print(
        json.dumps(
            {
                "result": "NOOP" if not result.affected_clips else "READY",
                "published": bool(args.publish and result.affected_clips),
                "schemaVersion": result.manifest.get("schemaVersion"),
                "variant": result.manifest.get("variant"),
                "affectedClips": list(result.affected_clips),
                "pages": {
                    clip: [
                        {
                            "src": page["src"],
                            "bytes": result_page_sizes[Path(page["src"]).name],
                            "width": page["width"],
                            "height": page["height"],
                            "sha256": page["sha256"],
                        }
                        for page in result.manifest["clips"][clip]["atlas"]["pages"]
                    ]
                    for clip in result.affected_clips
                },
                "decodedFrameRGBA": result.frame_digests,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
