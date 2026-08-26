#!/usr/bin/env python3
"""Independent Gate A verifier for every production Niumpi Blender rig.

Run from the repository root:

    blender --background art/niumpi/blender/niumpi_master.blend \
      --python scripts/niumpi/verify_rig.py -- --variant baby

The verifier is deliberately independent from the rig/action builders.  It
reads the saved Blender data, evaluates every production action in background
mode and writes manifest-compatible ``rigProof`` fields for each clip.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from variant_clip_contract import (  # noqa: E402
    ALL_KNOWN_CLIPS,
    ALL_KNOWN_CORE_CLIPS,
    BABY_REQUIRED_CLIPS,
    NON_BABY_REQUIRED_CLIPS,
    SEMANTIC_REQUIRED_CLIPS,
    required_clips_for_variant,
    semantic_contract,
    semantic_features_for_variant,
    validate_semantic_clip_metadata,
    validate_semantic_fingerprints,
)
from gaze_contract import (  # noqa: E402
    MIN_GAZE_DIRECTION_COSINE,
    MIN_PUPIL_GAZE_RATIO,
    equivalent_diameter,
    evaluate_pupil_gaze_tracks,
)

try:
    import bpy
    from bpy_extras.object_utils import world_to_camera_view
except ModuleNotFoundError:  # Pure resolver/schema tests run outside Blender.
    bpy = None  # type: ignore[assignment]
    world_to_camera_view = None  # type: ignore[assignment]


REPO = Path(__file__).resolve().parents[2]
LANDMARKS = REPO / "art/niumpi/variant-landmarks.json"
EPSILON = 1e-5
APPROVED_PIXEL_WORLD_SIZE = 0.01

PRODUCTION_VARIANTS = (
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
)
VARIANT_ALIASES = {"stage-1": "baby"}

# Complete vocabulary understood by action discovery. Required publication
# clips are variant-specific: only the baby is ever shown hatching.
NON_BABY_CORE_CLIPS = NON_BABY_REQUIRED_CLIPS
BABY_CORE_CLIPS = BABY_REQUIRED_CLIPS
CORE_CLIPS = ALL_KNOWN_CORE_CLIPS
KNOWN_CLIPS = ALL_KNOWN_CLIPS

BABY_REQUIRED_BONES = {
    "root",
    "body",
    "body_squash",
    "head",
    "arm.L",
    "arm.R",
    "foot.L",
    "foot.R",
    "eye.L",
    "eye.R",
    "pupil.L",
    "pupil.R",
    "eyelid_upper.L",
    "eyelid_upper.R",
    "eyelid_lower.L",
    "eyelid_lower.R",
    "mouth",
    "cheek.L",
    "cheek.R",
    "leaf_stem_01",
    "leaf_stem_02",
    "leaf",
    "shadow",
}

BABY_REQUIRED_MESHES = {
    "body",
    "eye.L",
    "eye.R",
    "pupil.L",
    "pupil.R",
    "eyelid_upper.L",
    "eyelid_upper.R",
    "eyelid_lower.L",
    "eyelid_lower.R",
    "mouth",
    "cheek.L",
    "cheek.R",
    "shadow",
}

BABY_EXPECTED_BONE_PARENTS = {
    "body": "root",
    "body_squash": "body",
    "head": "body_squash",
    "arm.L": "body_squash",
    "arm.R": "body_squash",
    "foot.L": "root",
    "foot.R": "root",
    "eye.L": "head",
    "eye.R": "head",
    "pupil.L": "eye.L",
    "pupil.R": "eye.R",
    "eyelid_upper.L": "eye.L",
    "eyelid_upper.R": "eye.R",
    "eyelid_lower.L": "eye.L",
    "eyelid_lower.R": "eye.R",
    "mouth": "head",
    "cheek.L": "head",
    "cheek.R": "head",
    "leaf_stem_01": "head",
    "leaf_stem_02": "leaf_stem_01",
    "leaf": "leaf_stem_02",
    # The contact shadow is deliberately world-anchored.  Parenting it to root
    # drags it into a clipped line between the feet during hops.
    "shadow": None,
}

BABY_REQUIRED_SHAPES = {
    "body": {"body_squash", "body_stretch"},
    "mouth": {"mouth_open"},
    "cheek.L": {"puff"},
    "cheek.R": {"puff"},
    "eyelid_upper.L": {"blink"},
    "eyelid_upper.R": {"blink"},
    "eyelid_lower.L": {"blink"},
    "eyelid_lower.R": {"blink"},
}

VARIANT_BASE_BONE_PARENTS = {
    "body": "root",
    "body_squash": "body",
    "head": "body_squash",
    "arm.L": "body_squash",
    "arm.R": "body_squash",
    "foot.L": "root",
    "foot.R": "root",
    "eye.L": "head",
    "eye.R": "head",
    "pupil.L": "eye.L",
    "pupil.R": "eye.R",
    "mouth": "head",
    "cheek.L": "head",
    "cheek.R": "head",
    "leaf_stem_01": "head",
    "leaf_stem_02": "leaf_stem_01",
    "shadow": None,
}

VARIANT_REQUIRED_MESHES = {
    "body",
    "eye.L",
    "eye.R",
    "pupil.L",
    "pupil.R",
    "mouth",
    "cheek.L",
    "cheek.R",
    "shadow",
}

VARIANT_REQUIRED_SHAPES = {
    "eye.L": {"blink"},
    "eye.R": {"blink"},
    "pupil.L": {"blink"},
    "pupil.R": {"blink"},
    "mouth": {"mouth_open"},
    "cheek.L": {"puff"},
    "cheek.R": {"puff"},
}

# Per-action semantic gates.  Blink is intentionally separate: a blink does
# not need to wave the arms, but both eyes must genuinely close.
REQUIRED_FEATURES = {
    "idle": {"body", "arms", "pupils", "leaf"},
    "look_left": {"body", "arms", "pupils", "leaf"},
    "look_right": {"body", "arms", "pupils", "leaf"},
    "tap_reaction": {"body", "arms", "pupils", "leaf"},
    "happy": {"body", "arms", "pupils", "leaf"},
    "eat": {"body", "arms", "pupils", "leaf", "mouth"},
    "hatch_complete": {"body", "arms", "pupils", "leaf"},
    "blink": {"eyelids"},
}

MINIMUMS = {
    "idle": {"controls": 4, "channels": 6, "regions": 4},
    "tap_reaction": {"controls": 6, "channels": 10, "regions": 6},
    "happy": {"controls": 6, "channels": 10, "regions": 6},
    "eat": {"controls": 6, "channels": 10, "regions": 6},
}

BONE_PATH = re.compile(r'^pose\.bones\["([^"]+)"\]\.([A-Za-z0-9_]+)$')
PROPERTY_PATH = re.compile(r'^\["([^"]+)"\]$')
SHAPE_PATH = re.compile(r'^key_blocks\["([^"]+)"\]\.value$')


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_variant_landmarks(path: Path = LANDMARKS) -> dict[str, Any]:
    if not path.exists():
        raise AssertionError(f"variant landmarks do not exist: {path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    variants = payload.get("variants")
    if not isinstance(variants, dict):
        raise AssertionError("variant-landmarks variants must be an object")
    expected = {"stage-1", *PRODUCTION_VARIANTS[1:]}
    missing = sorted(expected - set(variants))
    if missing:
        raise AssertionError("variant-landmarks is missing variants: " + ", ".join(missing))
    return payload


def _variant_leaf_bones(profile: dict[str, Any]) -> tuple[list[tuple[str, str]], int]:
    tips = profile.get("leafTips")
    landmarks = profile.get("landmarks")
    topology = profile.get("topology")
    if not isinstance(tips, list) or not tips:
        raise AssertionError("variant has no leafTips")
    if not isinstance(landmarks, dict) or not isinstance(landmarks.get("leafRoot"), dict):
        raise AssertionError("variant has no leafRoot landmark")
    if not isinstance(topology, dict):
        raise AssertionError("variant has no topology")
    detected = int(topology.get("detectedPrimaryLeaves", -1))
    if detected != len(tips):
        raise AssertionError(f"detectedPrimaryLeaves {detected} disagrees with {len(tips)} leafTips")
    root = landmarks["leafRoot"]["px"]
    root_xy = (float(root["x"]), float(root["y"]))
    points = [(float(item["px"]["x"]), float(item["px"]["y"])) for item in tips]
    primary = max(range(len(points)), key=lambda index: math.dist(root_xy, points[index]))
    pairs: list[tuple[str, str]] = [("leaf_stem_01", "leaf_stem_02")]
    pairs.extend(
        (f"leaf.{index + 1:02d}.base", f"leaf.{index + 1:02d}.tip")
        for index in range(len(points))
        if index != primary
    )
    return pairs, detected


def resolve_variant(
    requested_variant: str,
    *,
    repo: Path = REPO,
    landmarks_path: Path | None = None,
    manifest_override: Path | None = None,
    require_semantic: bool = False,
) -> dict[str, Any]:
    """Resolve paths and topology without importing or reading Blender state."""

    canonical = VARIANT_ALIASES.get(requested_variant, requested_variant)
    if canonical not in PRODUCTION_VARIANTS:
        accepted = sorted({*PRODUCTION_VARIANTS, *VARIANT_ALIASES})
        raise AssertionError(f"unsupported variant {requested_variant!r}; expected one of {', '.join(accepted)}")
    landmark_id = "stage-1" if canonical == "baby" else canonical
    landmarks_file = landmarks_path or repo / "art/niumpi/variant-landmarks.json"
    dataset = load_variant_landmarks(landmarks_file)
    profile = dataset["variants"][landmark_id]
    approved = repo / str(profile.get("source", ""))
    expected_sha = str(profile.get("sha256", ""))
    if canonical == "baby":
        master = repo / "art/niumpi/blender/niumpi_master.blend"
        report = repo / "art/niumpi/motion-proof/baby-rig-report.json"
        required_bones = set(BABY_REQUIRED_BONES)
        required_meshes = set(BABY_REQUIRED_MESHES)
        expected_parents = dict(BABY_EXPECTED_BONE_PARENTS)
        required_shapes = {name: set(values) for name, values in BABY_REQUIRED_SHAPES.items()}
        driver_minimums = {"blink": 4, "body_squash": 1, "body_stretch": 1, "mouth_open": 1, "cheek_puff": 2}
        leaf_pairs = [("leaf_stem_01", "leaf_stem_02")]
        visible_leaves = 1
        continuous_skin = True
        skin_ignored_bones = {
            "root", "body_squash", "shadow", "eye.L", "eye.R", "pupil.L", "pupil.R",
            "eyelid_upper.L", "eyelid_upper.R", "eyelid_lower.L", "eyelid_lower.R",
            "mouth", "cheek.L", "cheek.R",
        }
        required_clips = required_clips_for_variant(canonical, require_semantic)
    else:
        master = repo / f"art/niumpi/blender/{canonical}_master.blend"
        report = repo / f"art/niumpi/motion-proof/{canonical}-rig-report.json"
        leaf_pairs, visible_leaves = _variant_leaf_bones(profile)
        expected_parents = dict(VARIANT_BASE_BONE_PARENTS)
        for base, tip in leaf_pairs[1:]:
            expected_parents[base] = "head"
            expected_parents[tip] = base
        required_bones = {"root", *expected_parents}
        required_meshes = set(VARIANT_REQUIRED_MESHES)
        required_shapes = {name: set(values) for name, values in VARIANT_REQUIRED_SHAPES.items()}
        driver_minimums = {"blink": 4, "mouth_open": 1, "cheek_puff": 2}
        continuous_skin = True
        skin_ignored_bones = {
            "root", "body", "shadow", "eye.L", "eye.R", "pupil.L", "pupil.R",
            "mouth", "cheek.L", "cheek.R",
        }
        required_clips = required_clips_for_variant(canonical, require_semantic)
    manifest = manifest_override or repo / f"public/assets/niumpi/v2/{canonical}/manifest.json"
    if not manifest.is_absolute():
        manifest = repo / manifest
    return {
        "requestedVariant": requested_variant,
        "variant": canonical,
        "landmarkVariant": landmark_id,
        "profile": profile,
        "landmarksPath": landmarks_file,
        "master": master,
        "report": report,
        "manifest": manifest,
        "approvedArt": approved,
        "approvedArtSha256": expected_sha,
        "requiredBones": required_bones,
        "requiredMeshes": required_meshes,
        "expectedParents": expected_parents,
        "requiredShapes": required_shapes,
        "driverMinimums": driver_minimums,
        "leafBonePairs": leaf_pairs,
        "visibleLeaves": visible_leaves,
        "armsPresent": bool(profile["topology"].get("armsPresent")),
        "continuousSkin": continuous_skin,
        "skinIgnoredBones": skin_ignored_bones,
        "requiredClips": required_clips,
        "requireSemantic": require_semantic,
    }


def static_input_errors(config: dict[str, Any]) -> list[str]:
    """Return deterministic pre-Blender failures for one resolved variant."""

    reasons: list[str] = []
    if not config["master"].exists():
        reasons.append(f"expected master does not exist: {config['master']}")
    if not config["manifest"].exists():
        reasons.append(f"manifest does not exist: {config['manifest']}")
    approved = config["approvedArt"]
    if not approved.exists():
        reasons.append(f"approved art does not exist: {approved}")
    else:
        actual_sha = file_sha256(approved)
        if not config["approvedArtSha256"]:
            reasons.append("approved art has no sha256 in variant-landmarks")
        elif actual_sha != config["approvedArtSha256"]:
            reasons.append(
                f"approved art sha256 {actual_sha} does not match landmarks {config['approvedArtSha256']}"
            )
    return reasons


def all_fcurves(action: bpy.types.Action) -> Iterable[bpy.types.FCurve]:
    """Yield curves from legacy and Blender 4.4+ layered actions."""

    legacy = getattr(action, "fcurves", None)
    if legacy is not None:
        yield from legacy
        return
    for layer in getattr(action, "layers", []):
        for strip in getattr(layer, "strips", []):
            for channelbag in getattr(strip, "channelbags", []):
                yield from channelbag.fcurves


def clip_name(action: bpy.types.Action) -> str | None:
    declared = action.get("clip")
    if isinstance(declared, str) and declared in KNOWN_CLIPS:
        return declared
    lowered = action.name.lower()
    for candidate in sorted(KNOWN_CLIPS, key=len, reverse=True):
        if lowered == candidate or lowered.endswith(f"::{candidate}") or lowered.endswith(f"_{candidate}"):
            return candidate
    return None


def frame_range(action: bpy.types.Action) -> range:
    count = int(action.get("frame_count", 0))
    if count > 0:
        return range(1, count + 1)
    start = max(1, int(math.floor(action.frame_range[0])))
    end = max(start, int(math.ceil(action.frame_range[1])))
    return range(start, end + 1)


def curve_varies(curve: bpy.types.FCurve, frames: range) -> bool:
    values = [float(curve.evaluate(frame)) for frame in frames]
    return bool(values) and max(values) - min(values) > EPSILON


def channel_name(control: str, path: str, array_index: int) -> str:
    suffix = f"[{array_index}]" if path in {"location", "rotation_euler", "rotation_quaternion", "scale"} else ""
    return f"{control}.{path}{suffix}"


def region_for_control(control: str) -> str | None:
    if control in {"root", "shadow"} or control.lower().startswith("camera"):
        return None
    if control in {"body", "body_squash"}:
        return "body"
    if control == "head":
        return "head"
    if control.startswith("arm."):
        return control
    if control.startswith("foot."):
        return control
    if control.startswith("pupil."):
        return control
    if control.startswith("eye."):
        return control
    if control.startswith("eyelid_"):
        return control
    if control.startswith("cheek."):
        return control
    if control == "leaf" or control.startswith("leaf_stem_") or control.startswith("leaf."):
        return "leaf"
    if control.startswith("accessory."):
        return "accessory"
    if control == "mouth":
        return "mouth"
    return control


def feature_state(
    controls: set[str],
    config: dict[str, Any],
    root_channels: list[str] | None = None,
) -> dict[str, bool]:
    if config["continuousSkin"]:
        eyelids = {"eye.L", "eye.R", "pupil.L", "pupil.R"}.issubset(controls)
    else:
        eyelids = {"eyelid_upper.L", "eyelid_upper.R"}.issubset(controls)
    return {
        "body": bool(controls & {"body", "body_squash"}),
        "head": "head" in controls,
        "arms": {"arm.L", "arm.R"}.issubset(controls),
        "feet": {"foot.L", "foot.R"}.issubset(controls),
        "pupils": {"pupil.L", "pupil.R"}.issubset(controls),
        "leaf": any(region_for_control(control) == "leaf" for control in controls),
        "mouth": "mouth" in controls,
        "cheeks": {"cheek.L", "cheek.R"}.issubset(controls),
        "eyelids": eyelids,
        "shadow": any(channel.startswith("shadow.") for channel in (root_channels or [])),
        "accessory": any(control.startswith("accessory.") for control in controls),
        # Mistwander's water tail is represented by the semantic accessory
        # chain in the continuous skin; no other route may satisfy `tail` this
        # way because the variant check is explicit.
        "tail": config["variant"] == "mistwander"
        and any(control == "tail" or control.startswith("accessory.") for control in controls),
    }


def action_motion_fingerprint(
    action: bpy.types.Action,
    window: tuple[int, int] | None = None,
) -> str:
    """Hash normalised non-constant F-curve trajectories, excluding names."""

    available = frame_range(action)
    if window is None:
        start, stop = available.start, available.stop
    else:
        start = available.start + int(window[0])
        stop = min(available.stop, available.start + int(window[1]))
    if stop <= start:
        return ""
    sample_count = 24
    positions = [start + (stop - start - 1) * index / max(1, sample_count - 1) for index in range(sample_count)]
    trajectories = []
    for curve in sorted(all_fcurves(action), key=lambda item: (item.data_path, item.array_index)):
        values = [float(curve.evaluate(position)) for position in positions]
        if max(values) - min(values) <= EPSILON:
            continue
        origin = values[0]
        trajectories.append({
            "channel": f"{curve.data_path}[{curve.array_index}]",
            "values": [round(value - origin, 6) for value in values],
        })
    if not trajectories:
        return ""
    return hashlib.sha256(json.dumps(trajectories, sort_keys=True).encode("utf-8")).hexdigest()


def shape_displacement(obj: bpy.types.Object, shape_name: str) -> float:
    keys = getattr(obj.data, "shape_keys", None)
    if not keys or "Basis" not in keys.key_blocks or shape_name not in keys.key_blocks:
        return 0.0
    basis = keys.key_blocks["Basis"]
    shape = keys.key_blocks[shape_name]
    return max((shape.data[index].co - basis.data[index].co).length for index in range(len(basis.data)))


def driver_targets(rig: bpy.types.Object) -> tuple[dict[str, list[tuple[str, str]]], list[str]]:
    """Map rig custom properties to the effective driven shape-key channels."""

    targets: dict[str, list[tuple[str, str]]] = defaultdict(list)
    errors: list[str] = []
    for obj in bpy.data.objects:
        keys = getattr(getattr(obj, "data", None), "shape_keys", None)
        animation = getattr(keys, "animation_data", None)
        for curve in getattr(animation, "drivers", []) if animation else []:
            shape_match = SHAPE_PATH.match(curve.data_path)
            if not shape_match:
                continue
            matched_property = False
            for variable in curve.driver.variables:
                for target in variable.targets:
                    property_match = PROPERTY_PATH.match(target.data_path or "")
                    if target.id == rig and property_match:
                        targets[property_match.group(1)].append((obj.name, shape_match.group(1)))
                        matched_property = True
            if not matched_property:
                errors.append(f"{obj.name}:{shape_match.group(1)} driver is not connected to {rig.name}")
    return targets, errors


def inspect_hierarchy(config: dict[str, Any]) -> tuple[bpy.types.Object | None, dict[str, Any]]:
    reasons: list[str] = []
    required_bones = config["requiredBones"]
    required_meshes = config["requiredMeshes"]
    expected_parents = config["expectedParents"]
    required_shapes = config["requiredShapes"]

    reasons.extend(static_input_errors(config))

    armatures = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = bpy.data.objects.get("NiumpiRig")
    if rig is None or rig.type != "ARMATURE":
        reasons.append("missing ARMATURE object NiumpiRig")
        rig = armatures[0] if len(armatures) == 1 else None
    if len(armatures) != 1:
        reasons.append(f"expected exactly one armature, found {len(armatures)}")

    bones = set(rig.data.bones.keys()) if rig else set()
    missing_bones = sorted(required_bones - bones)
    if missing_bones:
        reasons.append(f"missing required bones: {', '.join(missing_bones)}")
    wrong_parents: list[str] = []
    if rig:
        for name, expected in expected_parents.items():
            bone = rig.data.bones.get(name)
            actual = bone.parent.name if bone and bone.parent else None
            if bone and actual != expected:
                wrong_parents.append(f"{name}->{actual or 'none'} (expected {expected or 'none'})")
    if wrong_parents:
        reasons.append("invalid bone hierarchy: " + ", ".join(wrong_parents))

    missing_meshes = sorted(name for name in required_meshes if bpy.data.objects.get(name) is None)
    if missing_meshes:
        reasons.append(f"missing separate component meshes: {', '.join(missing_meshes)}")

    binding: dict[str, Any] = {}
    if rig:
        for name in sorted(required_meshes):
            obj = bpy.data.objects.get(name)
            if obj is None or obj.type != "MESH":
                continue
            modifiers = [modifier for modifier in obj.modifiers if modifier.type == "ARMATURE" and modifier.object == rig]
            enabled = any(modifier.show_render for modifier in modifiers)
            weighted_groups = []
            for group in obj.vertex_groups:
                total = 0.0
                for vertex in obj.data.vertices:
                    try:
                        total += group.weight(vertex.index)
                    except RuntimeError:
                        pass
                if total > EPSILON:
                    weighted_groups.append(group.name)
            binding[name] = {"armatureModifier": enabled, "weightedGroups": sorted(weighted_groups)}
            if not enabled:
                reasons.append(f"{name} has no enabled NiumpiRig armature modifier")
            if not weighted_groups:
                reasons.append(f"{name} has no non-zero vertex weights")

    if rig:
        rig_variant = rig.get("variant")
        if rig_variant != config["variant"]:
            reasons.append(f"NiumpiRig variant is {rig_variant!r}, expected {config['variant']!r}")
        scene_variant = bpy.context.scene.get("variant")
        if scene_variant != config["variant"]:
            reasons.append(f"scene variant is {scene_variant!r}, expected {config['variant']!r}")
        expected_source = str(config["profile"]["source"])
        scene_source = bpy.context.scene.get("source_art")
        if scene_source != expected_source:
            reasons.append(f"scene source_art is {scene_source!r}, expected {expected_source!r}")

        if config["continuousSkin"]:
            body_groups = set(binding.get("body", {}).get("weightedGroups", []))
            non_skin = set(config["skinIgnoredBones"])
            expected_groups = set(required_bones) - non_skin
            missing_groups = sorted(expected_groups - body_groups)
            if missing_groups:
                reasons.append("continuous body has no weights for: " + ", ".join(missing_groups))

            try:
                declared_leaf_sets = json.loads(rig.get("leaf_bone_sets", "[]"))
                declared_pairs = {(item["base"], item["tip"]) for item in declared_leaf_sets}
            except (TypeError, ValueError, KeyError, json.JSONDecodeError):
                declared_pairs = set()
            expected_pairs = set(config["leafBonePairs"])
            if declared_pairs != expected_pairs:
                reasons.append(
                    "leaf_bone_sets disagree with landmarks: "
                    f"declared={sorted(declared_pairs)}, expected={sorted(expected_pairs)}"
                )
            if len(declared_pairs) != config["visibleLeaves"]:
                reasons.append(
                    f"leaf rig count {len(declared_pairs)} does not match visible topology {config['visibleLeaves']}"
                )
            try:
                accessory_bones = set(json.loads(rig.get("accessory_bones", "[]")))
            except (TypeError, ValueError, json.JSONDecodeError):
                accessory_bones = set()
                reasons.append("accessory_bones is not valid JSON")
            undeclared_accessories = sorted(name for name in bones if name.startswith("accessory.") and name not in accessory_bones)
            missing_accessories = sorted(accessory_bones - bones)
            if undeclared_accessories:
                reasons.append("undeclared accessory bones: " + ", ".join(undeclared_accessories))
            if missing_accessories:
                reasons.append("declared accessory bones are missing: " + ", ".join(missing_accessories))
            missing_accessory_weights = sorted(accessory_bones - body_groups)
            if missing_accessory_weights:
                reasons.append("continuous body has no accessory weights for: " + ", ".join(missing_accessory_weights))

    shapes: dict[str, Any] = {}
    for object_name, required in required_shapes.items():
        obj = bpy.data.objects.get(object_name)
        available = set()
        if obj and getattr(obj.data, "shape_keys", None):
            available = set(obj.data.shape_keys.key_blocks.keys())
        missing = sorted(required - available)
        displacement = {name: round(shape_displacement(obj, name), 6) for name in required} if obj else {}
        shapes[object_name] = {"required": sorted(required), "missing": missing, "maxDisplacement": displacement}
        if missing:
            reasons.append(f"{object_name} missing shape keys: {', '.join(missing)}")
        for name, amount in displacement.items():
            if amount <= EPSILON:
                reasons.append(f"{object_name}:{name} does not deform geometry")

    targets: dict[str, list[tuple[str, str]]] = {}
    driver_errors: list[str] = []
    if rig:
        targets, driver_errors = driver_targets(rig)
        reasons.extend(driver_errors)
        for prop, minimum in config["driverMinimums"].items():
            if len(set(targets.get(prop, []))) < minimum:
                reasons.append(f'{rig.name}["{prop}"] drives {len(set(targets.get(prop, [])))} shape channels; expected {minimum}')

    return rig, {
        "armature": rig.name if rig else None,
        "armatureCount": len(armatures),
        "bones": sorted(bones),
        "missingBones": missing_bones,
        "separateMeshCount": sum(1 for name in required_meshes if bpy.data.objects.get(name) is not None),
        "missingMeshes": missing_meshes,
        "binding": binding,
        "shapeKeys": shapes,
        "driverTargets": {key: [f"{obj}.{shape}" for obj, shape in sorted(set(value))] for key, value in sorted(targets.items())},
        "result": "PASS" if not reasons else "FAIL",
        "reasons": reasons,
    }


def effective_motion(
    action: bpy.types.Action,
    targets: dict[str, list[tuple[str, str]]],
) -> tuple[set[str], set[str], list[str]]:
    controls: set[str] = set()
    channels: set[str] = set()
    root_channels: list[str] = []
    frames = frame_range(action)
    for curve in all_fcurves(action):
        if not curve_varies(curve, frames):
            continue
        bone_match = BONE_PATH.match(curve.data_path)
        if bone_match:
            control, path = bone_match.groups()
            named = channel_name(control, path, curve.array_index)
            if control in {"root", "shadow"} or control.lower().startswith("camera"):
                root_channels.append(named)
            else:
                controls.add(control)
                channels.add(named)
            continue
        property_match = PROPERTY_PATH.match(curve.data_path)
        if property_match:
            prop = property_match.group(1)
            resolved = targets.get(prop, [])
            if not resolved:
                root_channels.append(f'NiumpiRig["{prop}"]')
            for object_name, shape_name in resolved:
                controls.add(object_name)
                channels.add(f'{object_name}.shape_keys["{shape_name}"].value')
            continue
        # An unknown curve must remain visible in the report.  Do not let it
        # silently inflate qualifying non-root counts.
        root_channels.append(f"unclassified:{curve.data_path}[{curve.array_index}]")
    return controls, channels, sorted(root_channels)


def blink_closure(
    rig: bpy.types.Object,
    action: bpy.types.Action,
    config: dict[str, Any],
) -> tuple[float, dict[str, float]]:
    lids = (
        ("eye.L", "eye.R", "pupil.L", "pupil.R")
        if config["continuousSkin"]
        else ("eyelid_upper.L", "eyelid_upper.R", "eyelid_lower.L", "eyelid_lower.R")
    )
    maxima = {name: 0.0 for name in lids}
    rig.animation_data_create()
    rig.animation_data.action = action
    for frame in frame_range(action):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        for name in lids:
            obj = bpy.data.objects.get(name)
            keys = getattr(getattr(obj, "data", None), "shape_keys", None) if obj else None
            value = float(keys.key_blocks["blink"].value) if keys and "blink" in keys.key_blocks else 0.0
            maxima[name] = max(maxima[name], value)
    closure = min(maxima.values()) if maxima else 0.0
    return closure, {name: round(value, 6) for name, value in maxima.items()}


def action_events(action: bpy.types.Action) -> list[dict[str, Any]]:
    """Read authored event metadata without trusting malformed JSON."""

    raw = action.get("events", "[]")
    try:
        payload = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError):
        return []
    return [event for event in payload if isinstance(event, dict)] if isinstance(payload, list) else []


def camera_relative_px(
    pupil_view: tuple[float, float],
    head_view: tuple[float, float],
    resolution: tuple[float, float],
) -> tuple[float, float]:
    """Convert camera-view pupil/head points to render-canvas relative pixels."""

    return (
        (float(pupil_view[0]) - float(head_view[0])) * float(resolution[0]),
        (float(head_view[1]) - float(pupil_view[1])) * float(resolution[1]),
    )


def rig_pupil_gaze_evidence(
    rig: bpy.types.Object,
    action: bpy.types.Action,
    config: dict[str, Any],
) -> dict[str, Any]:
    """Measure evaluated pre-bite pupil travel relative to the head.

    Raw F-curve amplitude is not enough: parent rotation can move a pupil even
    when its local gaze is static.  Evaluated pupil-minus-head positions remove
    that shared choreography, then the orthographic camera converts world
    units to rendered pixels.  Approved semantic eye bboxes provide the
    anatomy-specific denominator used by the shared gaze contract.
    """

    bite_frames = sorted(
        int(event["frame"])
        for event in action_events(action)
        if event.get("type") == "bite" and isinstance(event.get("frame"), (int, float))
    )
    scene = bpy.context.scene
    camera = scene.camera
    if not bite_frames:
        return {
            "unit": "camera-projected pupil-relative-to-head displacement / rendered eye diameter",
            "result": "FAIL",
            "reasons": ["eat action has no bite event for pre-bite gaze validation"],
            "perEye": {},
        }
    if camera is None or camera.type != "CAMERA" or camera.data.type != "ORTHO":
        return {
            "unit": "camera-projected pupil-relative-to-head displacement / rendered eye diameter",
            "result": "FAIL",
            "reasons": ["eat gaze validation requires an orthographic render camera"],
            "perEye": {},
        }
    first_bite = bite_frames[0]
    resolution_x = float(scene.render.resolution_x) * float(scene.render.resolution_percentage) / 100.0
    resolution_y = float(scene.render.resolution_y) * float(scene.render.resolution_percentage) / 100.0
    pixels_per_world = resolution_x / float(camera.data.ortho_scale)
    approved_to_render = pixels_per_world * APPROVED_PIXEL_WORLD_SIZE
    diameters: dict[str, float] = {}
    approved_boxes: dict[str, list[float]] = {}
    for pupil, eye in (("pupil.L", "eye.L"), ("pupil.R", "eye.R")):
        bbox = config["profile"]["regions"][eye]["bboxPx"]
        width = float(bbox["width"])
        height = float(bbox["height"])
        diameters[pupil] = equivalent_diameter(width, height) * approved_to_render
        approved_boxes[pupil] = [width, height]

    rig.animation_data_create()
    rig.animation_data.action = action
    frames = frame_range(action)
    start = frames.start
    baseline: dict[str, tuple[float, float]] = {}
    tracks: dict[str, list[tuple[int, float, float]]] = {"pupil.L": [], "pupil.R": []}
    direction_tracks: dict[str, list[tuple[int, float, float]]] = {"pupil.L": [], "pupil.R": []}
    for frame in range(start, min(first_bite, frames.stop)):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        evaluated = rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
        head = evaluated.pose.bones.get("head")
        if head is None:
            return {
                "unit": "camera-projected pupil-relative-to-head displacement / rendered eye diameter",
                "result": "FAIL",
                "reasons": ["eat gaze validation requires head pose bone"],
                "perEye": {},
            }
        head_world = evaluated.matrix_world @ head.matrix.translation
        head_view = world_to_camera_view(scene, camera, head_world)
        for pupil in tracks:
            bone = evaluated.pose.bones.get(pupil)
            if bone is None:
                return {
                    "unit": "camera-projected pupil-relative-to-head displacement / rendered eye diameter",
                    "result": "FAIL",
                    "reasons": [f"eat gaze validation requires {pupil} pose bone"],
                    "perEye": {},
                }
            pupil_world = evaluated.matrix_world @ bone.matrix.translation
            pupil_view = world_to_camera_view(scene, camera, pupil_world)
            # `world_to_camera_view` grows upward; render-canvas Y grows down.
            relative = camera_relative_px(
                (pupil_view.x, pupil_view.y),
                (head_view.x, head_view.y),
                (resolution_x, resolution_y),
            )
            if frame == start:
                baseline[pupil] = relative
            origin = baseline[pupil]
            dx = relative[0] - origin[0]
            dy = relative[1] - origin[1]
            tracks[pupil].append((
                frame,
                dx,
                dy,
            ))
            # Parent rotation creates anatomy-dependent vertical motion in the
            # evaluated pupil-minus-head vector. The food-side contract is the
            # signed screen-horizontal component; total 2D displacement above
            # still supplies the magnitude ratio.
            direction_tracks[pupil].append((
                frame,
                dx,
                0.0,
            ))
    evidence = evaluate_pupil_gaze_tracks(
        tracks,
        diameters,
        first_bite_frame=first_bite,
        # The runtime food enters from screen-right. Screen-space direction is
        # invariant to the legacy baby's opposite bone basis.
        expected_direction=(1.0, 0.0),
        direction_tracks=direction_tracks,
    )
    evidence["unit"] = "camera-projected pupil-relative-to-head displacement / rendered eye diameter"
    evidence["directionUnit"] = "signed camera-screen horizontal displacement"
    evidence["pixelsPerWorldUnit"] = round(pixels_per_world, 6)
    for pupil, box in approved_boxes.items():
        evidence["perEye"].setdefault(pupil, {})["approvedEyeBBoxPx"] = box
    return evidence


def inspect_action(
    name: str,
    action: bpy.types.Action | None,
    rig: bpy.types.Object,
    targets: dict[str, list[tuple[str, str]]],
    config: dict[str, Any],
) -> dict[str, Any]:
    reasons: list[str] = []
    if action is None:
        return {
            "animatedControls": [],
            "animatedChannels": [],
            "regions": [],
            "blinkClosure": 0.0,
            "result": "FAIL",
            "reasons": [f"missing Blender action for {name}"],
        }

    declared_variant = action.get("variant")
    if declared_variant != config["variant"]:
        reasons.append(
            f"action variant is {declared_variant!r}, expected {config['variant']!r}"
        )

    controls, channels, root_channels = effective_motion(action, targets)
    regions = {region for control in controls if (region := region_for_control(control))}
    features = feature_state(controls, config, root_channels)
    if not controls or not channels:
        reasons.append("only root/camera/shadow channels are animated")

    semantic_spec = semantic_contract(name) if name in SEMANTIC_REQUIRED_CLIPS else None
    minimums = semantic_spec["minimums"] if semantic_spec else MINIMUMS.get(name)
    if minimums:
        if len(controls) < minimums["controls"]:
            reasons.append(f"animated non-root controls {len(controls)} < {minimums['controls']}")
        if len(channels) < minimums["channels"]:
            reasons.append(f"animated non-root channels {len(channels)} < {minimums['channels']}")
        if len(regions) < minimums["regions"]:
            reasons.append(f"animated non-root regions {len(regions)} < {minimums['regions']}")

    required_features = (
        semantic_features_for_variant(name, config["variant"], config["armsPresent"])
        if semantic_spec else set(REQUIRED_FEATURES[name])
    )
    # The approved first-stage cloud has no arms. Treating its painted side
    # lobes as mandatory limbs recreates the cut-out puppet motion forbidden
    # by the topology metadata. Later forms with real arms keep this gate.
    if not config["armsPresent"]:
        required_features.discard("arms")
    for feature in sorted(required_features):
        if not features[feature]:
            reasons.append(f"required {feature} motion is absent")

    if semantic_spec:
        actual_frame_count = len(frame_range(action))
        expected_frame_count = int(semantic_spec["frameCount"])
        if actual_frame_count != expected_frame_count:
            reasons.append(f"action frame count {actual_frame_count} != {expected_frame_count}")
        if name == "roll":
            has_local_rotation = any(
                channel.startswith(("body.rotation_", "body_squash.rotation_", "head.rotation_"))
                for channel in channels
            )
            if not has_local_rotation:
                reasons.append("roll has no local body/head rotation channel")

    closure = 0.0
    lid_maxima: dict[str, float] = {}
    if name in {"blink", "sleep", "cozy"}:
        closure, lid_maxima = blink_closure(rig, action, config)
        if name == "blink" and closure < 0.8:
            reasons.append(f"bilateral blink closure {closure:.3f} < 0.8")
        elif name == "sleep" and closure < float(semantic_spec["eyeClosure"]):
            reasons.append(f"sleep eye closure {closure:.3f} < {semantic_spec['eyeClosure']:.2f}")
        elif name == "cozy":
            minimum, maximum = semantic_spec["eyeClosureRange"]
            if not minimum <= closure <= maximum:
                reasons.append(f"cozy eye closure {closure:.3f} outside {minimum:.2f}..{maximum:.2f}")

    pupil_gaze = rig_pupil_gaze_evidence(rig, action, config) if name == "eat" else None
    if pupil_gaze and pupil_gaze["result"] != "PASS":
        reasons.extend(f"eat gaze: {reason}" for reason in pupil_gaze["reasons"])

    motion_fingerprint = action_motion_fingerprint(action)
    subloop_fingerprint = (
        action_motion_fingerprint(action, tuple(semantic_spec["fingerprintRange"]))
        if semantic_spec and "fingerprintRange" in semantic_spec else None
    )
    return {
        # These three arrays intentionally match SpriteRigProof in
        # app/anim/NiumpiSpriteRuntime.ts and can be copied into the manifest.
        "animatedControls": sorted(controls),
        "animatedChannels": sorted(channels),
        "regions": sorted(regions),
        "counts": {
            "animatedControls": len(controls),
            "animatedChannels": len(channels),
            "regions": len(regions),
            "rootCameraShadowChannels": len(root_channels),
        },
        "rootCameraShadowChannels": root_channels,
        "featureMotion": features,
        "requiredFeatures": sorted(required_features),
        "motionFingerprint": motion_fingerprint,
        "subloopFingerprint": subloop_fingerprint,
        "blinkClosure": round(closure, 6),
        "eyelidMaxima": lid_maxima,
        "pupilGaze": pupil_gaze,
        "frameRange": [frame_range(action).start, frame_range(action).stop - 1],
        "action": action.name,
        "result": "PASS" if not reasons else "FAIL",
        "reasons": reasons,
    }


def script_arguments() -> argparse.Namespace:
    """Parse arguments following Blender's conventional ``--`` separator."""

    arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description="Verify the Niumpi Blender rig and enrich its sprite manifest")
    parser.add_argument(
        "--variant",
        default="baby",
        choices=sorted({*PRODUCTION_VARIANTS, *VARIANT_ALIASES}),
        help="production variant to verify; stage-1 is an alias for baby",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="existing v2/v3 manifest to enrich after Gate A passes (defaults to the selected variant)",
    )
    parser.add_argument(
        "--require-semantic",
        action="store_true",
        help="final gate: require the nine semantic clips in addition to the Phase 14 core",
    )
    return parser.parse_args(arguments)


def enrich_manifest(
    path: Path,
    clips: dict[str, dict[str, Any]],
    *,
    expected_variant: str,
    required_clips: tuple[str, ...],
) -> dict[str, Any]:
    """Validate then atomically add measured per-clip rigProof objects."""

    path = path if path.is_absolute() else REPO / path
    if not path.exists():
        raise AssertionError(f"manifest does not exist: {path}")

    manifest = json.loads(path.read_text(encoding="utf-8"))
    schema_version = manifest.get("schemaVersion")
    if schema_version not in (2, 3):
        raise AssertionError(
            f"manifest schemaVersion is {schema_version!r}, expected 2 or 3"
        )
    if manifest.get("variant") != expected_variant:
        raise AssertionError(f"manifest variant is {manifest.get('variant')!r}, expected {expected_variant!r}")
    manifest_clips = manifest.get("clips")
    if not isinstance(manifest_clips, dict):
        raise AssertionError("manifest clips must be an object")
    missing = [name for name in required_clips if not isinstance(manifest_clips.get(name), dict)]
    if missing:
        raise AssertionError("manifest is missing clips: " + ", ".join(missing))

    for name in required_clips:
        result = clips[name]
        if result.get("result") != "PASS":
            raise AssertionError(f"refusing to publish failed rig proof for {name}")
        if name in SEMANTIC_REQUIRED_CLIPS:
            metadata_reasons = validate_semantic_clip_metadata(name, manifest_clips[name])
            if metadata_reasons:
                raise AssertionError(f"{name} manifest contract failed: " + "; ".join(metadata_reasons))
        manifest_clips[name]["rigProof"] = {
            "animatedControls": list(result["animatedControls"]),
            "animatedChannels": list(result["animatedChannels"]),
            "regions": list(result["regions"]),
            "blinkClosure": float(result["blinkClosure"]),
        }

    temporary = path.with_name(f".{path.name}.gate-a-{os.getpid()}.tmp")
    try:
        temporary.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        # Parse the complete temporary file before replacing the known-good
        # manifest.  A partial write or non-serialisable value cannot corrupt it.
        json.loads(temporary.read_text(encoding="utf-8"))
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return {
        "result": "UPDATED",
        "path": str(path.relative_to(REPO)) if path.is_relative_to(REPO) else str(path),
        "clips": list(required_clips),
    }


def main() -> None:
    if bpy is None:
        raise SystemExit("Gate A must run inside Blender; resolver tests may import this module with Python")
    arguments = script_arguments()
    config = resolve_variant(
        arguments.variant,
        manifest_override=arguments.manifest,
        require_semantic=arguments.require_semantic,
    )
    report_path = config["report"]
    report_path.parent.mkdir(parents=True, exist_ok=True)
    master_path = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    try:
        loaded_blend = str(master_path.relative_to(REPO)) if master_path else None
    except ValueError:
        loaded_blend = str(master_path)
    rig, hierarchy = inspect_hierarchy(config)
    report: dict[str, Any] = {
        "schemaVersion": 1,
        "gate": "A",
        "variant": config["variant"],
        "requestedVariant": config["requestedVariant"],
        "landmarkVariant": config["landmarkVariant"],
        "sourceBlend": str(config["master"].relative_to(REPO)),
        "loadedBlend": loaded_blend,
        "approvedArt": str(config["approvedArt"].relative_to(REPO)),
        "approvedArtSha256": config["approvedArtSha256"],
        "requiredClips": list(config["requiredClips"]),
        "mode": "final-semantic" if config["requireSemantic"] else "phase14-core",
        "topology": {
            "visibleLeaves": config["visibleLeaves"],
            "armsPresentInApprovedArt": config["armsPresent"],
            "continuousSkin": config["continuousSkin"],
            "leafBonePairs": [list(pair) for pair in config["leafBonePairs"]],
        },
        "blenderVersion": bpy.app.version_string,
        "thresholds": {
            "idle": MINIMUMS["idle"],
            "tap_reaction": MINIMUMS["tap_reaction"],
            "happy": MINIMUMS["happy"],
            "eat": MINIMUMS["eat"],
            "blinkClosure": 0.8,
            "eatPupilDisplacementPerEyeDiameter": MIN_PUPIL_GAZE_RATIO,
            "eatPupilDirectionCosine": MIN_GAZE_DIRECTION_COSINE,
        },
        "hierarchy": hierarchy,
        "clips": {},
    }

    if master_path != config["master"].resolve():
        hierarchy["result"] = "FAIL"
        hierarchy["reasons"].append(
            f"wrong source blend loaded: {master_path}; expected {config['master'].resolve()}"
        )

    actions: dict[str, bpy.types.Action] = {}
    duplicates: list[str] = []
    for action in bpy.data.actions:
        name = clip_name(action)
        if not name or name not in config["requiredClips"]:
            continue
        if name in actions:
            duplicates.append(name)
        else:
            actions[name] = action
    if duplicates:
        hierarchy["result"] = "FAIL"
        hierarchy["reasons"].append("duplicate actions: " + ", ".join(sorted(set(duplicates))))

    if rig:
        targets, _ = driver_targets(rig)
        previous_action = rig.animation_data.action if rig.animation_data else None
        previous_frame = bpy.context.scene.frame_current
        for name in config["requiredClips"]:
            report["clips"][name] = inspect_action(name, actions.get(name), rig, targets, config)
        rig.animation_data.action = previous_action
        bpy.context.scene.frame_set(previous_frame)
        bpy.context.view_layer.update()
    else:
        for name in config["requiredClips"]:
            report["clips"][name] = {
                "animatedControls": [], "animatedChannels": [], "regions": [],
                "blinkClosure": 0.0, "result": "FAIL", "reasons": ["no usable armature"],
            }

    semantic_fingerprint_reasons: list[str] = []
    if config["requireSemantic"]:
        semantic_fingerprint_reasons = validate_semantic_fingerprints(
            report["clips"],
            idle_fingerprint=report["clips"].get("idle", {}).get("motionFingerprint"),
        )
        if semantic_fingerprint_reasons:
            hierarchy["result"] = "FAIL"
            hierarchy["reasons"].extend(semantic_fingerprint_reasons)
    report["semanticFingerprintReasons"] = semantic_fingerprint_reasons
    failed_clips = [name for name, result in report["clips"].items() if result["result"] != "PASS"]
    report["failedClips"] = failed_clips
    report["result"] = "PASS" if hierarchy["result"] == "PASS" and not failed_clips else "FAIL"
    if report["result"] == "PASS":
        try:
            report["manifest"] = enrich_manifest(
                config["manifest"],
                report["clips"],
                expected_variant=config["variant"],
                required_clips=config["requiredClips"],
            )
        except (AssertionError, json.JSONDecodeError, OSError) as error:
            report["manifest"] = {"result": "FAIL", "path": str(config["manifest"]), "reason": str(error)}
            report["result"] = "FAIL"
    else:
        if not config["manifest"].exists():
            report["manifest"] = {
                "result": "FAIL",
                "path": str(config["manifest"]),
                "reason": "manifest does not exist",
            }
        else:
            report["manifest"] = {"result": "NOT_WRITTEN", "reason": "Gate A failed"}
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "gate": "A",
        "result": report["result"],
        "failedClips": failed_clips,
        "manifest": report["manifest"]["result"],
        "variant": config["variant"],
        "report": str(report_path.relative_to(REPO)),
    }, indent=2))
    if report["result"] != "PASS":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
