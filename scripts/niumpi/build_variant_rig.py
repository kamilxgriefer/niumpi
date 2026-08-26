#!/usr/bin/env python3
"""Build landmark-retargeted Niumpi rigs from approved variant artwork.

This module deliberately does not synthesize character pixels.  Every visible
layer is cropped from the approved WebP declared by ``variant-landmarks.json``;
only hidden attachment/face underlays are reconstructed from neighbouring
pixels of that same source.  The baby rig remains on its hand-authored path.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

import build_rig as core


REPO = Path(__file__).resolve().parents[2]
LANDMARKS = REPO / "art/niumpi/variant-landmarks.json"
SUPPORTED = (
    "stage-2", "stage-3", "stage-4", "stage-5", "moonveil",
    "bloomheart", "sparkleap", "mistwander", "prismatic",
)


def rect_mask(xx, yy, bbox, inset=0.0):
    x = float(bbox["x"]) + inset
    y = float(bbox["y"]) + inset
    w = max(1.0, float(bbox["width"]) - 2 * inset)
    h = max(1.0, float(bbox["height"]) - 2 * inset)
    return (xx >= x) & (xx < x + w) & (yy >= y) & (yy < y + h)


def ellipse_from_region(xx, yy, region, sx=0.5, sy=0.5, center=None):
    bbox = region["bboxPx"]
    point = center or region["center"]["px"]
    return core.ellipse(
        xx, yy, float(point["x"]), float(point["y"]),
        max(2.0, float(bbox["width"]) * sx),
        max(2.0, float(bbox["height"]) * sy),
    )


def segment_distance(xx, yy, start, end):
    x0, y0 = start
    x1, y1 = end
    dx, dy = x1 - x0, y1 - y0
    denom = max(1e-6, dx * dx + dy * dy)
    t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / denom, 0.0, 1.0)
    return np.sqrt((xx - (x0 + t * dx)) ** 2 + (yy - (y0 + t * dy)) ** 2), t


def fit_underlay(source, fill_mask, sample_radius=18):
    """Fit a local quadratic colour surface using real neighbouring pixels."""
    if not np.any(fill_mask):
        return source
    result = source.copy()
    alpha = source[..., 3] > 0.03
    ring = core.dilate(fill_mask, sample_radius) & ~core.dilate(fill_mask, 3) & alpha
    ys, xs = np.where(fill_mask)
    if np.count_nonzero(ring) < 30:
        return result
    cx, cy = float(xs.mean()), float(ys.mean())
    scale = max(12.0, float(max(xs.max() - xs.min(), ys.max() - ys.min())))
    yy, xx = np.mgrid[0:source.shape[0], 0:source.shape[1]]
    dx, dy = (xx - cx) / scale, (yy - cy) / scale
    features = np.stack((np.ones_like(dx), dx, dy, dx * dx, dy * dy, dx * dy), axis=-1)
    for channel in range(3):
        coefficients, *_ = np.linalg.lstsq(features[ring], source[..., channel][ring], rcond=None)
        fitted = np.clip(np.sum(features * coefficients, axis=-1), 0.0, 1.0)
        result[..., channel] = np.where(fill_mask, fitted, result[..., channel])
    result[..., 3] = np.where(fill_mask, 1.0, result[..., 3])
    return result


def variant_layers(source, profile, variant):
    height, width, _ = source.shape
    yy, xx = np.mgrid[0:height, 0:width]
    alpha = source[..., 3] > 0.015
    rgb = source[..., :3]
    saturation = rgb.max(axis=2) - rgb.min(axis=2)
    regions = profile["regions"]
    landmarks = profile["landmarks"]

    # Leaves are split by their own root→tip centreline, not alpha extrema.
    # This keeps five mature leaves and Mistwander's three visible crown leaves
    # as independently deformable semantic parts.
    root_point = landmarks["leafRoot"]["px"]
    root = (float(root_point["x"]), float(root_point["y"]))
    leaf_box = rect_mask(xx, yy, regions["leaves"]["bboxPx"])
    # Include pearlescent highlights/veins inside leaf silhouettes.  A strict
    # saturation threshold leaves those pixels behind on the static head and
    # creates black slashes when a leaf bends.  Above the head bbox the corridor
    # is sufficient; only the crowded attachment zone needs a mild colour gate.
    head_top = float(regions["head"]["bboxPx"]["y"])
    leaf_colour = (yy < head_top + 4) | (saturation > 0.022)
    distances = []
    corridors = []
    for item in profile["leafTips"]:
        tip = (float(item["px"]["x"]), float(item["px"]["y"]))
        distance, progress = segment_distance(xx, yy, root, tip)
        length = math.dist(root, tip)
        width_px = np.clip(length * (0.27 - 0.11 * progress), 13.0, 70.0)
        distances.append(distance / width_px)
        corridors.append(distance <= width_px)
    stack = np.stack(distances)
    nearest = np.argmin(stack, axis=0)
    leaf_candidate = alpha & leaf_box & leaf_colour & np.logical_or.reduce(corridors)
    leaf_masks = [core.dilate(leaf_candidate & (nearest == index), 1) & alpha for index in range(len(distances))]
    leaf_union = np.logical_or.reduce(leaf_masks)

    # Tight landmark-driven facial pieces.  Pupils own the iris interior while
    # the eye crop retains the painted socket/rim.
    pupil_l = alpha & ellipse_from_region(xx, yy, regions["pupil.L"], 0.44, 0.45, landmarks["pupil.L"]["px"])
    pupil_r = alpha & ellipse_from_region(xx, yy, regions["pupil.R"], 0.44, 0.45, landmarks["pupil.R"]["px"])
    eye_l_all = alpha & ellipse_from_region(xx, yy, regions["eye.L"], 0.55, 0.54)
    eye_r_all = alpha & ellipse_from_region(xx, yy, regions["eye.R"], 0.55, 0.54)
    eye_l, eye_r = eye_l_all & ~pupil_l, eye_r_all & ~pupil_r
    mouth_zone = alpha & ellipse_from_region(xx, yy, regions["mouth"], 0.56, 0.56)
    luminance = rgb[..., 0] * 0.30 + rgb[..., 1] * 0.59 + rgb[..., 2] * 0.11
    mouth = mouth_zone & ((luminance < 0.72) | ((rgb[..., 0] - rgb[..., 1]) > 0.10))
    cheek_l = alpha & ellipse_from_region(xx, yy, regions["cheek.L"], 0.48, 0.46) & (rgb[..., 0] > rgb[..., 1] * 1.025)
    cheek_r = alpha & ellipse_from_region(xx, yy, regions["cheek.R"], 0.48, 0.46) & (rgb[..., 0] > rgb[..., 1] * 1.025)

    head_center = regions["head"]["center"]["px"]
    head_width = float(regions["head"]["bboxPx"]["width"])
    if profile.get("accessories"):
        # Ornamented forms have large alpha hulls inside the coarse arm boxes.
        # A landmark-centred hand mask prevents petal/wing/aurora pixels from
        # being silently classified as limbs before their explicit polygons.
        arm_l = alpha & ellipse_from_region(xx, yy, regions["arm.L"], 0.50, 0.54, landmarks["arm.L"]["px"])
        arm_r = alpha & ellipse_from_region(xx, yy, regions["arm.R"], 0.50, 0.54, landmarks["arm.R"]["px"])
    else:
        arm_l = alpha & rect_mask(xx, yy, regions["arm.L"]["bboxPx"])
        arm_r = alpha & rect_mask(xx, yy, regions["arm.R"]["bboxPx"])
    arm_l &= xx < float(head_center["x"]) - head_width * 0.10
    arm_r &= xx > float(head_center["x"]) + head_width * 0.10
    body_region = regions["body"]
    foot_floor = float(body_region["center"]["px"]["y"]) + float(body_region["bboxPx"]["height"]) * 0.28
    foot_l = alpha & rect_mask(xx, yy, regions["foot.L"]["bboxPx"]) & (yy > foot_floor)
    foot_r = alpha & rect_mask(xx, yy, regions["foot.R"]["bboxPx"]) & (yy > foot_floor)

    # Decorative/tail pixels live outside the core semantic body envelope.
    # They remain approved-art crops and receive a dedicated accessory bone.
    core_cx = (float(head_center["x"]) + float(body_region["center"]["px"]["x"])) * 0.5
    core_cy = (float(head_center["y"]) + float(body_region["center"]["px"]["y"])) * 0.5
    core_rx = max(head_width, float(body_region["bboxPx"]["width"])) * 0.64
    core_ry = (float(body_region["center"]["px"]["y"]) - float(head_center["y"])) + float(body_region["bboxPx"]["height"]) * 0.72
    outside_core = alpha & ~core.ellipse(xx, yy, core_cx, core_cy, core_rx, core_ry)
    accessory_masks = {}
    accessory_profiles = profile.get("accessories", [])
    claimed_accessories = np.zeros_like(alpha)
    for item in accessory_profiles:
        name = f'accessory.{item["id"]}'
        polygons = item.get("maskPolygonsPx") or [item["maskPolygonPx"]]
        candidate = np.zeros_like(alpha)
        for polygon in polygons:
            points = tuple(tuple(float(value) for value in point) for point in polygon)
            candidate |= core.polygon_mask(xx, yy, points)
        candidate &= alpha
        if item.get("outsideCore", False):
            candidate &= outside_core
        # Semantic appendages never steal the authored crown, hands, or feet.
        # They are weighted on the same continuous skin, so their remaining
        # attachment boundary feathers into head/body instead of opening a cut.
        candidate &= ~leaf_union & ~arm_l & ~arm_r & ~foot_l & ~foot_r
        candidate &= ~claimed_accessories
        if np.count_nonzero(candidate) >= 8:
            accessory_masks[name] = candidate
            claimed_accessories |= candidate

    # Mistwander predates the explicit multi-accessory schema. Its approved
    # water-tail polygon still remains landmark-owned and gets a named region.
    if "tail" in regions and not accessory_profiles:
        # Variant-landmarks owns the explicit approved-art tail topology.  The
        # adapter consumes its polygon and never infers a form from alpha hulls.
        polygon = tuple(tuple(float(value) for value in point) for point in regions["tail"]["maskPolygonPx"])
        accessory_masks["accessory.tail"] = alpha & core.polygon_mask(xx, yy, polygon) & ~arm_r

    # Backwards-compatible fallback for already-approved form rigs. New Phase
    # 14 forms are required to declare every decorative semantic explicitly.
    if not accessory_profiles and "tail" not in regions and not variant.startswith("stage-"):
        accessory = outside_core & ~leaf_union & ~arm_l & ~arm_r & ~foot_l & ~foot_r
        if np.count_nonzero(accessory) >= 8:
            accessory_masks["accessory.01"] = accessory

    ordered = {
        **{f"leaf.{index + 1:02d}": mask for index, mask in enumerate(leaf_masks)},
        **accessory_masks,
        "pupil.L": pupil_l, "pupil.R": pupil_r,
        "eye.L": eye_l, "eye.R": eye_r,
        "mouth": mouth, "cheek.L": cheek_l, "cheek.R": cheek_r,
        "arm.L": arm_l, "arm.R": arm_r,
        "foot.L": foot_l, "foot.R": foot_r,
    }
    claimed = np.zeros_like(alpha)
    masks = {}
    for name, candidate in ordered.items():
        candidate = candidate & ~claimed
        if np.count_nonzero(candidate) >= 8:
            masks[name] = candidate
            claimed |= candidate

    expected_accessories = {f'accessory.{item["id"]}' for item in accessory_profiles}
    missing_accessories = sorted(expected_accessories - set(masks))
    if missing_accessories:
        raise RuntimeError(
            f"{variant}: explicit accessory masks produced no owned pixels: "
            + ", ".join(missing_accessories)
        )

    remainder = alpha & ~claimed
    split_y = (float(head_center["y"]) + float(body_region["center"]["px"]["y"])) * 0.5
    masks["head"] = remainder & (yy < split_y + 28)
    masks["body"] = remainder & (yy >= split_y - 28)

    # Reconstruct only hidden attachment zones, never an entire removed limb.
    reconstructed = source.copy()
    # Only eye layers require a hidden skin reconstruction.  Mouth/cheek
    # overlays are translucent local accents and may safely sit over the exact
    # approved base; inpainting their broad landmark boxes creates flat bands.
    face_fill = core.dilate(eye_l_all | eye_r_all, 3)
    reconstructed = fit_underlay(reconstructed, face_fill, 22)
    attachment_fill = np.zeros_like(alpha)
    # Shoulder underlays are rounded local tufts at the body-facing side of
    # each hand, never rectangular copies of the full arm crop.
    for arm_name, direction in (("arm.L", 1.0), ("arm.R", -1.0)):
        if arm_name in masks:
            center = landmarks[arm_name]["px"]
            arm_box = regions[arm_name]["bboxPx"]
            attach_x = float(center["x"]) + direction * float(arm_box["width"]) * 0.24
            attach_y = float(center["y"]) + float(arm_box["height"]) * 0.04
            tuft = core.ellipse(
                xx, yy, attach_x, attach_y,
                max(16.0, float(arm_box["width"]) * 0.22),
                max(14.0, float(arm_box["height"]) * 0.30),
            )
            attachment_fill |= tuft & core.dilate(masks[arm_name], 7)
    # The landmark root is the hidden crown attachment, not the visible stem
    # tip.  Reconstruct the lower ~85 px of every leaf crop as an organic tuft;
    # otherwise bending the leaf exposes transparent holes between hair lobes.
    leaf_root_fill = core.dilate(leaf_union & (yy > root[1] - 85.0), 3)
    attachment_fill |= leaf_root_fill
    reconstructed = fit_underlay(reconstructed, attachment_fill, 20)
    masks["head_underlay"] = face_fill | attachment_fill
    return masks, reconstructed


def create_weighted_master(source, material, masks, rig, leaf_sets, split_y):
    """Create one continuous approved-art skin with semantic vertex masks.

    The earlier crop-composite prototype could open transparent wedges between
    independently rotated opaque quads.  A continuous high-density skin is the
    production-safe equivalent of a 2D deform mesh: arms, feet, every leaf and
    accessories still have distinct vertex groups/bones, but shared boundaries
    stretch instead of tearing.
    """
    cols = 128
    rows = max(128, round(128 * core.CANVAS_HEIGHT / core.CANVAS_WIDTH))
    x0, z0 = core.xy_to_world(0, core.CANVAS_HEIGHT)
    x1, z1 = core.xy_to_world(core.CANVAS_WIDTH, 0)
    vertices = []
    for row in range(rows + 1):
        v = row / rows
        for col in range(cols + 1):
            u = col / cols
            vertices.append((x0 + (x1 - x0) * u, 0.20, z0 + (z1 - z0) * v))
    faces = []
    for row in range(rows):
        for col in range(cols):
            a = row * (cols + 1) + col
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    mesh = bpy.data.meshes.new("mesh::body")
    mesh.from_pydata(vertices, [], faces)
    mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        row, col = divmod(loop.vertex_index, cols + 1)
        mesh.uv_layers[0].data[loop.index].uv = (col / cols, row / rows)
    obj = bpy.data.objects.new("body", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj["semantic_region"] = "continuous-approved-art-skin"
    groups = {bone.name: obj.vertex_groups.new(name=bone.name) for bone in rig.data.bones if bone.use_deform}

    leaf_lookup = {item["mask"]: item for item in leaf_sets}
    semantic_order = [
        *[item["mask"] for item in leaf_sets],
        *sorted(name for name in masks if name.startswith("accessory.")),
        "arm.L", "arm.R", "foot.L", "foot.R",
    ]
    semantic_weights = {}
    for name in semantic_order:
        if name not in masks:
            continue
        mask = masks[name]
        weight = mask.astype(np.float32)
        previous = mask.copy()
        feather_px = 12 if name.startswith(("leaf.", "arm.")) else 9
        for step in range(1, feather_px + 1):
            expanded = core.dilate(mask, step)
            ring = expanded & ~previous
            weight[ring] = (feather_px + 1 - step) / (feather_px + 1)
            previous = expanded
        semantic_weights[name] = weight

    def add_base_weight(vertex_index, py, amount):
        if amount <= 1e-5:
            return
        # Blend the painted head/body fold across a 56 px band so squash/head
        # rotation bends the continuous skin rather than making a hard crease.
        head_weight = float(np.clip((split_y + 28.0 - py) / 56.0, 0.0, 1.0))
        if head_weight > 1e-5:
            groups["head"].add([vertex_index], amount * head_weight, "REPLACE")
        if head_weight < 1.0 - 1e-5:
            groups["body_squash"].add([vertex_index], amount * (1.0 - head_weight), "REPLACE")

    for index, vertex in enumerate(mesh.vertices):
        px = int(np.clip(round(core.SOURCE_ANCHOR[0] + vertex.co.x / core.PX), 0, core.CANVAS_WIDTH - 1))
        py = int(np.clip(round(core.SOURCE_ANCHOR[1] - vertex.co.z / core.PX), 0, core.CANVAS_HEIGHT - 1))
        candidates = [(float(weight[py, px]), name) for name, weight in semantic_weights.items()]
        semantic_weight, semantic = max(candidates, default=(0.0, None))
        if semantic_weight <= 1e-5:
            semantic = None
        if semantic in leaf_lookup:
            item = leaf_lookup[semantic]
            root = np.asarray(item["root"], dtype=float)
            tip = np.asarray(item["end"], dtype=float)
            direction = tip - root
            progress = float(np.clip((np.asarray((px, py)) - root) @ direction / max(1e-6, float(direction @ direction)), 0.0, 1.0))
            tip_weight = float(np.clip((progress - 0.28) / 0.72, 0.0, 1.0))
            groups[item["base"]].add([index], semantic_weight * (1.0 - tip_weight), "REPLACE")
            groups[item["tip"]].add([index], semantic_weight * tip_weight, "REPLACE")
            add_base_weight(index, py, 1.0 - semantic_weight)
        elif semantic and semantic in groups:
            groups[semantic].add([index], semantic_weight, "REPLACE")
            add_base_weight(index, py, 1.0 - semantic_weight)
        else:
            add_base_weight(index, py, 1.0)
    return obj


def create_part_mesh(name, material, depth, mask, bone_base, bone_tip, root, tip):
    cols, rows = 8, 10
    left, top, right, bottom = core.mask_bbox(mask)
    x0, z0 = core.xy_to_world(left, bottom)
    x1, z1 = core.xy_to_world(right, top)
    vertices = []
    for row in range(rows + 1):
        v = row / rows
        for col in range(cols + 1):
            u = col / cols
            vertices.append((x0 + (x1 - x0) * u, depth, z0 + (z1 - z0) * v))
    faces = []
    for row in range(rows):
        for col in range(cols):
            a = row * (cols + 1) + col
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    mesh = bpy.data.meshes.new(f"mesh::{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        row, col = divmod(loop.vertex_index, cols + 1)
        px = left + (right - left) * (col / cols)
        py = bottom - (bottom - top) * (row / rows)
        mesh.uv_layers[0].data[loop.index].uv = (px / core.CANVAS_WIDTH, 1.0 - py / core.CANVAS_HEIGHT)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj["semantic_region"] = "leaf" if name.startswith("leaf.") else "accessory"
    groups = (obj.vertex_groups.new(name=bone_base), obj.vertex_groups.new(name=bone_tip))
    root_xy, tip_xy = np.asarray(root), np.asarray(tip)
    direction = tip_xy - root_xy
    denominator = max(1e-6, float(direction @ direction))
    for index, vertex in enumerate(mesh.vertices):
        px = core.SOURCE_ANCHOR[0] + vertex.co.x / core.PX
        py = core.SOURCE_ANCHOR[1] - vertex.co.z / core.PX
        progress = float(np.clip((np.asarray((px, py)) - root_xy) @ direction / denominator, 0.0, 1.0))
        tip_weight = np.clip((progress - 0.32) / 0.68, 0.0, 1.0)
        groups[0].add([index], 1.0 - tip_weight, "REPLACE")
        groups[1].add([index], tip_weight, "REPLACE")
    return obj


def create_variant_armature(profile, masks, variant):
    landmarks = profile["landmarks"]
    regions = profile["regions"]
    point = lambda name: (float(landmarks[name]["px"]["x"]), float(landmarks[name]["px"]["y"]))
    body, head = point("body"), point("head")
    root = core.SOURCE_ANCHOR
    arm_data = bpy.data.armatures.new("NiumpiRigData")
    rig = bpy.data.objects.new("NiumpiRig", arm_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    specs = {
        "root": (root, (root[0], root[1] - 45), None),
        "body": (body, (body[0], body[1] - 70), "root"),
        "body_squash": (body, head, "body"),
        "head": (head, (head[0], head[1] - 85), "body_squash"),
        "arm.L": (point("arm.L"), (point("arm.L")[0] - 30, point("arm.L")[1] - 12), "body_squash"),
        "arm.R": (point("arm.R"), (point("arm.R")[0] + 30, point("arm.R")[1] - 12), "body_squash"),
        "foot.L": (point("foot.L"), (point("foot.L")[0] - 24, point("foot.L")[1]), "root"),
        "foot.R": (point("foot.R"), (point("foot.R")[0] + 24, point("foot.R")[1]), "root"),
        "eye.L": (point("eye.L"), (point("eye.L")[0], point("eye.L")[1] - 20), "head"),
        "eye.R": (point("eye.R"), (point("eye.R")[0], point("eye.R")[1] - 20), "head"),
        "pupil.L": (point("pupil.L"), (point("pupil.L")[0], point("pupil.L")[1] - 12), "eye.L"),
        "pupil.R": (point("pupil.R"), (point("pupil.R")[0], point("pupil.R")[1] - 12), "eye.R"),
        "mouth": (point("mouth"), (point("mouth")[0], point("mouth")[1] - 14), "head"),
        "cheek.L": (point("cheek.L"), (point("cheek.L")[0], point("cheek.L")[1] - 12), "head"),
        "cheek.R": (point("cheek.R"), (point("cheek.R")[0], point("cheek.R")[1] - 12), "head"),
        "shadow": ((body[0], core.SOURCE_ANCHOR[1] + 20), (body[0], core.SOURCE_ANCHOR[1] + 2), None),
    }
    leaf_sets = []
    leaf_root = point("leafRoot")
    tips = [(float(item["px"]["x"]), float(item["px"]["y"])) for item in profile["leafTips"]]
    primary_index = max(range(len(tips)), key=lambda i: math.dist(leaf_root, tips[i]))
    ordered_indices = [primary_index] + [i for i in range(len(tips)) if i != primary_index]
    for order, index in enumerate(ordered_indices):
        tip = tips[index]
        midpoint = ((leaf_root[0] + tip[0]) * 0.52, (leaf_root[1] + tip[1]) * 0.52)
        if order == 0:
            base_name, tip_name = "leaf_stem_01", "leaf_stem_02"
        else:
            base_name, tip_name = f"leaf.{index + 1:02d}.base", f"leaf.{index + 1:02d}.tip"
        specs[base_name] = (leaf_root, midpoint, "head")
        specs[tip_name] = (midpoint, tip, base_name)
        leaf_sets.append({"mask": f"leaf.{index + 1:02d}", "base": base_name, "tip": tip_name, "root": leaf_root, "end": tip})
    accessory_specs = []
    declared_accessories = profile.get("accessories", [])
    for index, item in enumerate(declared_accessories):
        name = f'accessory.{item["id"]}'
        if name not in masks:
            continue
        attach = tuple(float(value) for value in item["attachmentPx"])
        tip = tuple(float(value) for value in item["tipPx"])
        parent = str(item.get("parent", "body_squash"))
        specs[name] = (attach, tip, parent)
        accessory_specs.append({
            "bone": name,
            "semantic": str(item["semantic"]),
            "motionFactor": float(item.get("motionFactor", 0.10)),
            "motionSign": -1.0 if index % 2 else 1.0,
        })
    legacy_accessories = sorted(name for name in masks if name.startswith("accessory.") and name not in specs)
    for index, name in enumerate(legacy_accessories):
        accessory_center = regions["body"]["center"]["px"]
        ac = (float(accessory_center["x"]), float(accessory_center["y"]))
        specs[name] = (ac, (ac[0] + 45, ac[1] + 15), "body_squash")
        accessory_specs.append({
            "bone": name, "semantic": "legacy-accessory",
            "motionFactor": 0.0, "motionSign": -1.0 if index % 2 else 1.0,
        })

    for name, (bone_head, bone_tail, parent) in specs.items():
        bone = arm_data.edit_bones.new(name)
        hx, hz = core.xy_to_world(*bone_head)
        tx, tz = core.xy_to_world(*bone_tail)
        bone.head, bone.tail = (hx, 0, hz), (tx, 0, tz)
        bone.use_deform = True
        if parent:
            bone.parent = arm_data.edit_bones[parent]
            bone.use_connect = name.endswith(".tip") or name == "leaf_stem_02"
    for name in specs:
        arm_data.edit_bones[name].align_roll(Vector((0.0, 1.0, 0.0)))
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    for prop in ("blink", "mouth_open", "cheek_puff", "body_squash", "body_stretch"):
        rig[prop] = 0.0
        rig.id_properties_ui(prop).update(min=0.0, max=1.0, soft_min=0.0, soft_max=1.0)
    rig["variant"] = variant
    rig["rig_version"] = 3
    rig["leaf_bone_sets"] = json.dumps(leaf_sets, separators=(",", ":"))
    rig["secondary_leaf_bones"] = json.dumps([[item["base"], item["tip"]] for item in leaf_sets[1:]])
    rig["accessory_bones"] = json.dumps([item["bone"] for item in accessory_specs], separators=(",", ":"))
    rig["accessory_specs"] = json.dumps(accessory_specs, separators=(",", ":"))
    return rig, leaf_sets


def configure_variant_scene(profile, variant):
    scene = bpy.context.scene
    max_dimension = max(core.CANVAS_WIDTH, core.CANVAS_HEIGHT)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = core.RENDER_SIZE
    scene.render.resolution_y = core.RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = True
    scene.render.fps = 24
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    world = bpy.data.worlds.new("NiumpiWorld")
    world.color = (1, 1, 1)
    scene.world = world
    camera_data = bpy.data.cameras.new("NiumpiCamera")
    camera = bpy.data.objects.new("NiumpiCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    # Ten percent safety margin preserves mature crowns and aquatic tails
    # through the 42 px choreography-v2 hops without clipping the 512 canvas.
    camera_data.ortho_scale = max_dimension * core.PX * 1.20
    # Keep the authored scale and recover safety by moving unusually tall
    # ornamented silhouettes down inside the 512 canvas. Their lower margin is
    # large enough for this shift, so runtime size does not shrink.
    anchor_y = {
        "mistwander": 478,
        "moonveil": 473,
        "bloomheart": 468,
        "sparkleap": 476,
        "prismatic": 468,
    }.get(variant, 466)
    camera_z = (anchor_y - core.RENDER_SIZE / 2) * camera_data.ortho_scale / core.RENDER_SIZE
    camera.location = (0, -12, camera_z)
    camera.rotation_euler = (math.pi / 2, 0, 0)
    scene.camera = camera
    scene["variant"] = variant
    scene["source_art"] = profile["source"]
    scene["render_anchor_x"] = 256
    scene["render_anchor_y"] = anchor_y
    scene["pipeline_version"] = 3
    return scene


def deform_variant_body(body_object, rig, center_px):
    core.add_shape_keys(body_object, ["body_squash", "body_stretch"])
    basis = body_object.data.shape_keys.key_blocks["Basis"]
    center_x, center_z = core.xy_to_world(float(center_px["x"]), float(center_px["y"]))
    for name, scale_x, scale_z in (("body_squash", 1.055, 0.91), ("body_stretch", 0.965, 1.07)):
        key = body_object.data.shape_keys.key_blocks[name]
        for index, point in enumerate(key.data):
            original = basis.data[index].co.copy()
            point.co.x = center_x + (original.x - center_x) * scale_x
            point.co.z = center_z + (original.z - center_z) * scale_z
        core.driver_shape(body_object, name, rig, name)


def build_variant(variant):
    if variant not in SUPPORTED:
        raise SystemExit(f"Unsupported variant {variant!r}; expected one of {', '.join(SUPPORTED)}")
    dataset = json.loads(LANDMARKS.read_text(encoding="utf-8"))
    profile = dataset["variants"][variant]
    source_path = REPO / profile["source"]
    core.SOURCE = source_path
    core.MASTER = REPO / f"art/niumpi/blender/{variant}_master.blend"
    core.CANVAS_WIDTH = int(profile["canvas"]["width"])
    core.CANVAS_HEIGHT = int(profile["canvas"]["height"])
    core.CANVAS = core.CANVAS_WIDTH  # legacy helpers; variant helpers use both axes
    bbox = profile["alpha"]["bboxPx"]
    body_x = float(profile["landmarks"]["body"]["px"]["x"])
    anchor_y = min(core.CANVAS_HEIGHT - 4.0, float(bbox["y"] + bbox["height"]) - 26.0)
    core.SOURCE_ANCHOR = (body_x, anchor_y)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = core.read_source()
    if source.shape[:2] != (core.CANVAS_HEIGHT, core.CANVAS_WIDTH):
        raise RuntimeError(f"{variant}: source dimensions {source.shape[1]}x{source.shape[0]} disagree with landmarks")
    masks, reconstructed = variant_layers(source, profile, variant)
    configure_variant_scene(profile, variant)
    rig, leaf_sets = create_variant_armature(profile, masks, variant)

    depth = {"eye.L": 0.10, "eye.R": 0.10, "pupil.L": 0.075, "pupil.R": 0.075,
             "cheek.L": 0.065, "cheek.R": 0.065, "mouth": 0.055}
    objects = {}
    masks.pop("head_underlay")
    full_alpha = source[..., 3] > 0.015
    # A continuous skin must retain original limb/leaf pixels because those
    # regions deform in-place.  Only removable eye overlays need hidden pearl
    # skin; attachment inpaints belong exclusively to the older cutout path.
    eye_fill = np.zeros(full_alpha.shape, dtype=bool)
    for eye_part in ("eye.L", "eye.R", "pupil.L", "pupil.R"):
        if eye_part in masks:
            eye_fill |= masks[eye_part]
    master_source = fit_underlay(source, core.dilate(eye_fill, 3), 22)
    master_image = core.packed_layer("body", master_source, full_alpha)
    split_y = (float(profile["landmarks"]["head"]["px"]["y"]) + float(profile["landmarks"]["body"]["px"]["y"])) * 0.5
    objects["body"] = create_weighted_master(
        master_source, core.material_for("body", master_image), masks, rig, leaf_sets, split_y
    )
    core.armature_bind(objects["body"], rig)
    for name in ("eye.L", "eye.R", "pupil.L", "pupil.R", "cheek.L", "cheek.R", "mouth"):
        if name not in masks:
            continue
        layer_mask = masks[name]
        image = core.packed_layer(name, source, layer_mask)
        bone = name
        obj = core.create_canvas_mesh(name, core.material_for(name, image), depth[name], bone, layer_mask)
        core.armature_bind(obj, rig)
        objects[name] = obj

    for name in ("eye.L", "eye.R", "pupil.L", "pupil.R"):
        if name in objects:
            cy = float(profile["landmarks"][name]["px"]["y"])
            core.add_blink_collapse(objects[name], rig, cy)
    # The continuous mesh is already locally deformed by body/head/limb/leaf
    # bones.  Avoid a second global shape-key squash that would move detached
    # alpha islands and double the silhouette amplitude.
    if "mouth" in objects:
        core.add_shape_keys(objects["mouth"], ["mouth_open"])
        basis = objects["mouth"].data.shape_keys.key_blocks["Basis"]
        key = objects["mouth"].data.shape_keys.key_blocks["mouth_open"]
        for index, point in enumerate(key.data):
            point.co.z = basis.data[index].co.z + (0.045 if index >= 2 else -0.045)
        core.driver_shape(objects["mouth"], "mouth_open", rig, "mouth_open")
    for cheek_name in ("cheek.L", "cheek.R"):
        if cheek_name not in objects:
            continue
        cheek = objects[cheek_name]
        core.add_shape_keys(cheek, ["puff"])
        basis = cheek.data.shape_keys.key_blocks["Basis"]
        key = cheek.data.shape_keys.key_blocks["puff"]
        center_x = sum(point.co.x for point in basis.data) / len(basis.data)
        for index, point in enumerate(key.data):
            point.co.x = center_x + (basis.data[index].co.x - center_x) * 1.06
        core.driver_shape(cheek, "puff", rig, "cheek_puff")

    yy, xx = np.mgrid[0:core.CANVAS_HEIGHT, 0:core.CANVAS_WIDTH]
    shadow_cx = core.SOURCE_ANCHOR[0]
    shadow_cy = core.SOURCE_ANCHOR[1] + 20
    shadow_radius = ((xx - shadow_cx) / 82) ** 2 + ((yy - shadow_cy) / 14) ** 2
    shadow_alpha = np.clip(1.0 - shadow_radius, 0.0, 1.0) ** 2 * 0.14
    shadow_source = np.zeros_like(source)
    shadow_source[..., :3] = (0.18, 0.11, 0.32)
    shadow_source[..., 3] = shadow_alpha
    shadow_mask = shadow_alpha > 0
    shadow_image = core.packed_layer("shadow", shadow_source, shadow_mask)
    shadow = core.create_canvas_mesh("shadow", core.material_for("shadow", shadow_image), 0.30, "shadow", shadow_mask)
    core.armature_bind(shadow, rig)
    objects["shadow"] = shadow

    bpy.context.scene["component_objects"] = ",".join(sorted(objects))
    bpy.context.scene["leaf_count_visible"] = len(profile["leafTips"])
    bpy.context.scene["leaf_count_canonical"] = int(profile["topology"]["canonicalPrimaryLeaves"])
    core.MASTER.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(core.MASTER), compress=True)
    print(
        f"NIUMPI_VARIANT_RIG_OK variant={variant} master={core.MASTER.relative_to(REPO)} "
        f"objects={len(objects)} leaves={len(leaf_sets)} approved={profile['source']}"
    )
