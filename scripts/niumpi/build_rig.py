#!/usr/bin/env python3
"""Build the canonical layered Niumpi baby rig in Blender.

Run with:
  blender --background --factory-startup --python scripts/niumpi/build_rig.py

The approved pearl-cloud illustration remains the visual source of truth, but it
is partitioned into independently deformable regions.  Images are packed into
the .blend so the master has no machine-specific texture paths.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector


REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "public/assets/niumpi/stages/stage-1.webp"
MASTER = REPO / "art/niumpi/blender/niumpi_master.blend"
CANVAS = 640
CANVAS_WIDTH = 640
CANVAS_HEIGHT = 640
PX = 0.01
SOURCE_ANCHOR = (330.0, 550.0)
CAMERA_Z = 2.7609375
RENDER_SIZE = 512


def xy_to_world(x: float, y: float) -> tuple[float, float]:
    return ((x - SOURCE_ANCHOR[0]) * PX, (SOURCE_ANCHOR[1] - y) * PX)


def ellipse(xx, yy, cx, cy, rx, ry):
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1.0


def polygon_mask(xx: np.ndarray, yy: np.ndarray, points: tuple[tuple[float, float], ...]) -> np.ndarray:
    inside = np.zeros_like(xx, dtype=bool)
    previous = points[-1]
    for current in points:
        x1, y1 = previous
        x2, y2 = current
        crossing = ((y1 > yy) != (y2 > yy)) & (xx < (x2 - x1) * (yy - y1) / (y2 - y1 + 1e-9) + x1)
        inside ^= crossing
        previous = current
    return inside


def read_source() -> np.ndarray:
    image = bpy.data.images.load(str(SOURCE), check_existing=False)
    image.colorspace_settings.name = "sRGB"
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    rgba = pixels.reshape((image.size[1], image.size[0], 4))
    # Blender's image rows are bottom-up; all authored coordinates are top-down.
    return np.flipud(rgba).copy()


def dilate(mask: np.ndarray, steps: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(steps):
        p = np.pad(out, 1)
        out = np.logical_or.reduce(
            [p[1:-1, 1:-1], p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]]
        )
    return out


def erode(mask: np.ndarray, steps: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(steps):
        p = np.pad(out, 1, constant_values=False)
        out = np.logical_and.reduce(
            [p[1:-1, 1:-1], p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]]
        )
    return out


def feather_inside(mask: np.ndarray, steps: int = 5) -> np.ndarray:
    """Return a soft inner edge without expanding a semantic part.

    Side-lobe arm crops overlap reconstructed pearl skin.  A binary crop edge
    becomes a dark horizontal hairline after a large arm rotation on dark game
    backgrounds.  Fading only the innermost edge rings keeps the approved rest
    pose visually unchanged while making that articulated overlap seamless.
    """
    weight = np.zeros(mask.shape, dtype=np.float32)
    current = mask.copy()
    for step in range(steps):
        weight[current] = max(weight[current].max(initial=0.0), (step + 1) / steps)
        current = erode(current, 1)
    weight[current] = 1.0
    return weight


def partition_layers(source: np.ndarray) -> dict[str, np.ndarray]:
    height, width, _ = source.shape
    yy, xx = np.mgrid[0:height, 0:width]
    alpha = source[..., 3] > 0.015
    rgb = source[..., :3]
    # The leaf is the cool green/cyan region above the body.
    # One continuous mask is critical: a colour-threshold mask dropped the gold
    # veins and pastel rim, causing the deformed leaf to tear into islands.
    leaf_shape = polygon_mask(xx, yy, ((318, 196), (326, 92), (365, 57), (455, 38), (461, 66), (418, 160), (343, 194)))
    leaf = dilate(alpha & leaf_shape, 1)
    eye_l_zone = ellipse(xx, yy, 232, 350, 35, 35)
    eye_r_zone = ellipse(xx, yy, 362, 348, 40, 35)
    # Move the complete inner iris, not just cyan/specular highlights.  This
    # keeps gaze shifts readable and leaves the stationary eye layer as a rim.
    pupil_l = alpha & ellipse(xx, yy, 232, 350, 22, 27)
    pupil_r = alpha & ellipse(xx, yy, 362, 348, 24, 27)
    eye_l = alpha & eye_l_zone & ~pupil_l
    eye_r = alpha & eye_r_zone & ~pupil_r
    mouth = alpha & ellipse(xx, yy, 298, 393, 34, 20) & (rgb[..., 2] < 0.42)
    # Blush only: the old hue-only threshold also captured dark magenta lash
    # pixels at the eye rim.  Moving the cheeks then pulled those lashes onto
    # the face as black tear-like marks during singing.
    # Keep the crop wholly below/outside the iris.  The broader historical
    # ellipses reached into the lower purple eye rims; cheek-puff then dragged
    # those few pixels across the face as dark "tears" during singing.
    cheek_l = (
        alpha
        & ellipse(xx, yy, 202, 404, 34, 18)
        & (rgb[..., 0] > 0.45)
        & (rgb[..., 0] > rgb[..., 1] * 1.13)
        & (rgb[..., 0] > rgb[..., 2] * 1.03)
    )
    cheek_r = (
        alpha
        & ellipse(xx, yy, 397, 400, 36, 19)
        & (rgb[..., 0] > 0.45)
        & (rgb[..., 0] > rgb[..., 1] * 1.13)
        & (rgb[..., 0] > rgb[..., 2] * 1.03)
    )
    arm_l = alpha & ellipse(xx, yy, 151, 405, 22, 48)
    arm_r = alpha & ellipse(xx, yy, 497, 399, 23, 49)
    # Keep only the actual lower foot lobes.  The upper half of the broad
    # ellipses also captured a disconnected strip of belly pixels; once the
    # foot rotated that strip appeared as a floating white crescent below the
    # character.  Excluded pixels naturally fall back into the body layer.
    foot_l = alpha & ellipse(xx, yy, 287, 540, 30, 26) & (yy > 515)
    foot_r = alpha & ellipse(xx, yy, 384, 540, 32, 27) & (yy > 513)

    ordered = {
        "leaf": leaf,
        "pupil.L": pupil_l,
        "pupil.R": pupil_r,
        "eye.L": eye_l,
        "eye.R": eye_r,
        "mouth": mouth,
        "cheek.L": cheek_l,
        "cheek.R": cheek_r,
        "arm.L": arm_l,
        "arm.R": arm_r,
        "foot.L": foot_l,
        "foot.R": foot_r,
    }
    claimed = np.zeros_like(alpha)
    masks: dict[str, np.ndarray] = {}
    for name, candidate in ordered.items():
        masks[name] = candidate & ~claimed
        claimed |= masks[name]
    remainder = alpha & ~claimed
    # A soft visual seam is unnecessary because the two layers meet exactly and
    # are composited without filtering gaps.  The cut follows the face/body fold.
    # Keep a generous painted overlap across the head/body fold.  The head can
    # rotate independently during eating and reactions; a hard one-pixel split
    # at y=407 otherwise opens into a dark horizontal crack on non-white game
    # backgrounds.  Both layers sample the exact approved art, so the overlap
    # is invisible at rest and provides real coverage while posed.
    head = remainder & (yy < 432)
    body = remainder & (yy >= 382)
    masks["head"] = head
    masks["body"] = body
    # Two-pixel overlap keeps bilinear sampling from drawing seams between
    # independently rendered parts.  It is narrow enough not to become a
    # visible static duplicate when the part moves.
    for name in tuple(masks):
        masks[name] = dilate(masks[name], 2) & alpha
    for name in ("arm.L", "arm.R"):
        masks[name] = dilate(masks[name], 2) & alpha
    return masks


def reconstruct_face_under_eyes(source: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Inpaint pearl skin beneath the removable eye layers.

    A low-order surface is fitted to real surrounding pearl pixels.  The fill
    therefore inherits local light/colour instead of reading as a white disc.
    """
    result = source.copy()
    height, width, _ = source.shape
    yy, xx = np.mgrid[0:height, 0:width]
    combined = np.zeros((height, width), dtype=bool)
    for cx, cy, rx, ry in ((232, 350, 39, 39), (362, 348, 43, 39)):
        dx = (xx - cx) / rx
        dy = (yy - cy) / ry
        radius = np.sqrt(dx * dx + dy * dy)
        saturation = source[..., :3].max(axis=2) - source[..., :3].min(axis=2)
        ring = (radius >= 1.08) & (radius <= 1.48) & (source[..., 3] > 0.8) & (saturation < 0.22)
        features = np.stack((np.ones_like(dx), dx, dy, dx * dx, dy * dy, dx * dy), axis=-1)
        for channel in range(3):
            coeffs, *_ = np.linalg.lstsq(features[ring], source[..., channel][ring], rcond=None)
            fitted = np.clip(np.sum(features * coeffs, axis=-1), 0, 1)
            core = radius <= 1.0
            feather = np.clip((1.08 - radius) / 0.12, 0, 1)
            result[..., channel] = np.where(core, fitted, result[..., channel] * (1 - feather) + fitted * feather)
        fill = radius <= 1.08
        result[..., 3] = np.where(fill, 1.0, result[..., 3])
        combined |= fill
    return result, combined


def reconstruct_pearl_under_limbs(source: np.ndarray, masks: dict[str, np.ndarray]) -> np.ndarray:
    """Clone nearby body pearl under moving side lobes, preserving silhouette."""
    result = source.copy()
    height, width, _ = source.shape
    yy, xx = np.mgrid[0:height, 0:width]
    for name in ("arm.L", "arm.R"):
        mask = masks[name]
        ys, xs = np.where(mask)
        cx, cy = float(xs.mean()), float(ys.mean())
        sample_x = np.clip(np.rint(330 + (xx - cx) * 0.48).astype(int), 0, width - 1)
        sample_y = np.clip(np.rint(450 + (yy - cy) * 0.46).astype(int), 0, height - 1)
        cloned = source[sample_y, sample_x, :3]
        weight = np.zeros(mask.shape, dtype=np.float32)
        for step in range(1, 11):
            weight[erode(mask, step)] = step / 10.0
        result[..., :3] = result[..., :3] * (1 - weight[..., None]) + cloned * weight[..., None]
    return result


def reconstruct_pearl_under_cheeks(
    source: np.ndarray, masks: dict[str, np.ndarray]
) -> tuple[np.ndarray, np.ndarray]:
    """Fit pearl skin below the two articulated blush patches.

    Cheeks are translated and puffed during singing.  Removing their texture
    from the head without an underlay exposed transparent, hook-shaped holes
    on dark backgrounds.  A local low-order fit keeps the hidden surface in
    the approved pearlescent palette without duplicating the painted blush.
    """
    result = source.copy()
    height, width, _ = source.shape
    yy, xx = np.mgrid[0:height, 0:width]
    saturation = source[..., :3].max(axis=2) - source[..., :3].min(axis=2)
    combined = np.zeros((height, width), dtype=bool)
    for name, cx, cy, rx, ry in (
        ("cheek.L", 202, 404, 34, 18),
        ("cheek.R", 397, 400, 36, 19),
    ):
        dx = (xx - cx) / rx
        dy = (yy - cy) / ry
        radius = np.sqrt(dx * dx + dy * dy)
        ring = (
            (radius >= 1.18)
            & (radius <= 1.72)
            & (source[..., 3] > 0.8)
            & (saturation < 0.18)
        )
        features = np.stack((np.ones_like(dx), dx, dy, dx * dx, dy * dy, dx * dy), axis=-1)
        fill = dilate(masks[name], 2)
        for channel in range(3):
            coeffs, *_ = np.linalg.lstsq(features[ring], source[..., channel][ring], rcond=None)
            fitted = np.clip(np.sum(features * coeffs, axis=-1), 0, 1)
            result[..., channel] = np.where(fill, fitted, result[..., channel])
        result[..., 3] = np.where(fill, 1.0, result[..., 3])
        combined |= fill
    return result, combined


def reconstruct_pearl_under_mouth(
    source: np.ndarray, mouth_mask: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Fit the hidden pearl face below the independently animated mouth.

    The production skin is continuous, so every removable facial overlay must
    reveal real fur rather than a second, baked copy of itself.  A small local
    polynomial fit preserves the approved iridescent shading around the lips.
    """

    result = source.copy()
    height, width, _ = source.shape
    yy, xx = np.mgrid[0:height, 0:width]
    cx, cy, rx, ry = 298.0, 393.0, 34.0, 20.0
    dx = (xx - cx) / rx
    dy = (yy - cy) / ry
    radius = np.sqrt(dx * dx + dy * dy)
    saturation = source[..., :3].max(axis=2) - source[..., :3].min(axis=2)
    ring = (
        (radius >= 1.25)
        & (radius <= 2.05)
        & (source[..., 3] > 0.8)
        & (saturation < 0.20)
    )
    features = np.stack((np.ones_like(dx), dx, dy, dx * dx, dy * dy, dx * dy), axis=-1)
    fill = dilate(mouth_mask, 3)
    for channel in range(3):
        coeffs, *_ = np.linalg.lstsq(features[ring], source[..., channel][ring], rcond=None)
        fitted = np.clip(np.sum(features * coeffs, axis=-1), 0, 1)
        result[..., channel] = np.where(fill, fitted, result[..., channel])
    result[..., 3] = np.where(fill, 1.0, result[..., 3])
    return result, fill


def reconstruct_hair_under_leaf(source: np.ndarray, leaf_mask: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    result = source.copy()
    height, width, _ = source.shape
    yy, xx = np.mgrid[0:height, 0:width]
    # A rounded hidden hair tuft sits behind the attachment.  Using a smooth
    # tuft instead of the leaf polygon avoids revealing a rectangular/polygonal
    # cutout when the blade bends away.
    # Cover the complete attachment sweep, not just the neutral stem.  The
    # semantic roll now gives the leaf a genuine delayed follow-through; the
    # old 39 px tuft exposed a triangular alpha gap as soon as the blade lagged
    # past the small core-animation range.  This remains a rounded, sampled
    # pearl tuft behind the approved blade rather than a rectangular crop.
    fill = ellipse(xx, yy, 342, 172, 64, 49) & (yy > 118)
    # Sample from the opaque pearl crown, never from transparent pixels beside
    # the approved hull.  Expanding the old clone with its fixed -68/+34
    # offset copied transparent black into the hidden tuft and turned it into
    # a dark crescent on checker/dark backgrounds.
    sample_x = np.clip(np.rint(330 + (xx - 342) * 0.45).astype(int), 0, width - 1)
    sample_y = np.clip(np.rint(220 + (yy - 172) * 0.35).astype(int), 0, height - 1)
    result[..., :3] = np.where(fill[..., None], source[sample_y, sample_x, :3], result[..., :3])
    result[..., 3] = np.where(fill, 1.0, result[..., 3])
    return result, fill


def packed_layer(name: str, source: np.ndarray, mask: np.ndarray) -> bpy.types.Image:
    layer = source.copy()
    layer[..., 3] *= mask.astype(np.float32)
    # Keep surrounding source RGB behind zero alpha so straight-alpha texture
    # filtering bleeds pearl colour rather than black at moving boundaries.
    variant = bpy.context.scene.get("variant", "baby")
    image = bpy.data.images.new(f"{variant}::{name}", width=CANVAS_WIDTH, height=CANVAS_HEIGHT, alpha=True)
    image.alpha_mode = "STRAIGHT"
    image.colorspace_settings.name = "sRGB"
    image.pixels.foreach_set(np.flipud(layer).reshape(-1))
    image.pack()
    return image


def material_for(name: str, image: bpy.types.Image) -> bpy.types.Material:
    mat = bpy.data.materials.new(f"mat::{name}")
    mat.use_nodes = True
    try:
        mat.surface_render_method = "BLENDED"
        mat.use_transparency_overlap = False
    except Exception:
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"
    mat.diffuse_color = (1, 1, 1, 1)
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    texture = nodes.new("ShaderNodeTexImage")
    emission = nodes.new("ShaderNodeEmission")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    texture.image = image
    emission.inputs["Strength"].default_value = 1.0
    mat.node_tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    mat.node_tree.links.new(texture.outputs["Alpha"], mix.inputs["Fac"])
    mat.node_tree.links.new(transparent.outputs["BSDF"], mix.inputs[1])
    mat.node_tree.links.new(emission.outputs["Emission"], mix.inputs[2])
    mat.node_tree.links.new(mix.outputs["Shader"], output.inputs["Surface"])
    return mat


def mask_bbox(mask: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.where(mask)
    if not len(xs):
        raise ValueError("empty layer mask")
    padding = 2
    return (
        max(0, int(xs.min()) - padding), max(0, int(ys.min()) - padding),
        min(CANVAS_WIDTH, int(xs.max()) + 1 + padding), min(CANVAS_HEIGHT, int(ys.max()) + 1 + padding),
    )


def create_canvas_mesh(name: str, material: bpy.types.Material, depth: float, bone: str, mask: np.ndarray):
    left, top, right, bottom = mask_bbox(mask)
    x0, z0 = xy_to_world(left, bottom)
    x1, z1 = xy_to_world(right, top)
    vertices = [(x0, depth, z0), (x1, depth, z0), (x1, depth, z1), (x0, depth, z1)]
    mesh = bpy.data.meshes.new(f"mesh::{name}")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.uv_layers.new(name="UVMap")
    u0, u1 = left / CANVAS_WIDTH, right / CANVAS_WIDTH
    v0, v1 = 1.0 - bottom / CANVAS_HEIGHT, 1.0 - top / CANVAS_HEIGHT
    uvs = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    for loop in mesh.loops:
        mesh.uv_layers[0].data[loop.index].uv = uvs[loop.vertex_index]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj["semantic_region"] = name
    obj["source_bbox"] = (left, top, right, bottom)
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(4)), 1.0, "REPLACE")
    return obj


def create_weighted_baby_master(
    source: np.ndarray,
    material: bpy.types.Material,
    masks: dict[str, np.ndarray],
    rig: bpy.types.Object,
):
    """Create one feather-weighted deformation skin from the approved art.

    The old baby master cut the cloud into opaque cards.  Large professional
    poses then exposed the card boundaries even though the artwork itself was
    correct.  This dense skin keeps the silhouette continuous while retaining
    independent body, head, side-lobe, feet and three-link leaf controls.
    """

    # Ninety-six cells keep the 640 px painting smooth at gameplay size while
    # avoiding the need to evaluate 16k quads for every atlas frame.
    cols = rows = 96
    x0, z0 = xy_to_world(0, CANVAS_HEIGHT)
    x1, z1 = xy_to_world(CANVAS_WIDTH, 0)
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
    obj["source_bbox"] = (0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    groups = {
        bone.name: obj.vertex_groups.new(name=bone.name)
        for bone in rig.data.bones
        if bone.use_deform
    }

    semantic_weights: dict[str, np.ndarray] = {}
    for name, feather_px in (
        # These are deformation fields, not cut-out part masks.  A narrow
        # falloff turned a 20--30 px pose into long one-pixel spikes at the
        # alpha silhouette.  The broad falloff makes the surrounding cloud
        # mass follow like soft tissue while the approved pixels stay intact.
        ("leaf", 104),
        ("arm.L", 82),
        ("arm.R", 82),
        ("foot.L", 72),
        ("foot.R", 72),
    ):
        mask = masks[name]
        weight = mask.astype(np.float32)
        previous = mask.copy()
        for step in range(1, feather_px + 1):
            expanded = dilate(mask, step)
            ring = expanded & ~previous
            linear = (feather_px + 1 - step) / (feather_px + 1)
            weight[ring] = linear * linear * (3.0 - 2.0 * linear)
            previous = expanded
        semantic_weights[name] = weight

    def add_base_weight(vertex_index: int, py: int, amount: float):
        if amount <= 1e-6:
            return
        # The broad blend is the deformation equivalent of soft tissue: the
        # belly can lag behind while the forehead follows without a hard fold.
        # A cloud has no hard neck joint.  Blend the face carrier through most
        # of the pearl torso so head nods read as volume, never a hinge.
        head_weight = float(np.clip((470.0 - py) / 156.0, 0.0, 1.0))
        body_weight = 1.0 - head_weight
        if head_weight > 1e-6:
            groups["head"].add([vertex_index], amount * head_weight, "REPLACE")
        if body_weight > 1e-6:
            groups["body"].add([vertex_index], amount * body_weight, "REPLACE")

    for index, vertex in enumerate(mesh.vertices):
        px = int(np.clip(round(SOURCE_ANCHOR[0] + vertex.co.x / PX), 0, CANVAS_WIDTH - 1))
        py = int(np.clip(round(SOURCE_ANCHOR[1] - vertex.co.z / PX), 0, CANVAS_HEIGHT - 1))
        semantic, semantic_weight = max(
            ((name, float(weight[py, px])) for name, weight in semantic_weights.items()),
            key=lambda item: item[1],
        )
        if semantic_weight <= 1e-6:
            add_base_weight(index, py, 1.0)
            continue
        if semantic == "leaf":
            progress = float(np.clip((297.0 - py) / 227.0, 0.0, 1.0))
            # Continuous three-link skinning.  The previous transition jumped
            # from (0.58, .42, 0) to (.18, .82, 0) at 42% of the leaf, which
            # folded a row of triangles into a visible filament.
            if progress < 0.42:
                local = progress / 0.42
                local = local * local * (3.0 - 2.0 * local)
                leaf_weights = (1.0 - local, local, 0.0)
            elif progress < 0.74:
                local = (progress - 0.42) / 0.32
                local = local * local * (3.0 - 2.0 * local)
                leaf_weights = (0.0, 1.0 - local, local)
            else:
                leaf_weights = (0.0, 0.0, 1.0)
            for name, amount in zip(("leaf_stem_01", "leaf_stem_02", "leaf"), leaf_weights):
                if amount > 1e-6:
                    groups[name].add([index], semantic_weight * amount, "REPLACE")
        else:
            groups[semantic].add([index], semantic_weight, "REPLACE")
        add_base_weight(index, py, 1.0 - semantic_weight)
    return obj


def create_leaf_mesh(material: bpy.types.Material, depth: float, mask: np.ndarray):
    # Full-canvas grid preserves exact reference pixels while the three weighted
    # stem regions produce a genuinely bending chain instead of a rigid plane.
    cols, rows = 10, 16
    left, top, right, bottom = mask_bbox(mask)
    x0, z0 = xy_to_world(left, bottom)
    x1, z1 = xy_to_world(right, top)
    verts = []
    for row in range(rows + 1):
        v = row / rows
        z = z0 + (z1 - z0) * v
        for col in range(cols + 1):
            u = col / cols
            x = x0 + (x1 - x0) * u
            verts.append((x, depth, z))
    faces = []
    for row in range(rows):
        for col in range(cols):
            a = row * (cols + 1) + col
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    mesh = bpy.data.meshes.new("mesh::leaf")
    mesh.from_pydata(verts, [], faces)
    mesh.uv_layers.new(name="UVMap")
    for loop in mesh.loops:
        vid = loop.vertex_index
        row, col = divmod(vid, cols + 1)
        u = (left + (right - left) * (col / cols)) / CANVAS
        source_y = bottom - (bottom - top) * (row / rows)
        mesh.uv_layers[0].data[loop.index].uv = (u, 1.0 - source_y / CANVAS)
    obj = bpy.data.objects.new("leaf", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj["semantic_region"] = "leaf"
    groups = {name: obj.vertex_groups.new(name=name) for name in ("leaf_stem_01", "leaf_stem_02", "leaf")}
    for i, vertex in enumerate(mesh.vertices):
        # source top coordinate reconstructed from world Z
        source_y = SOURCE_ANCHOR[1] - vertex.co.z / PX
        if source_y > 180:
            weights = (0.82, 0.18, 0.0)
        elif source_y > 105:
            t = (180 - source_y) / 75
            weights = (0.2 * (1 - t), 0.8 * (1 - t) + 0.2 * t, 0.8 * t)
        else:
            weights = (0.0, 0.12, 0.88)
        for group, weight in zip(groups.values(), weights):
            if weight > 0:
                group.add([i], weight, "REPLACE")
    return obj


def create_eyelid(name: str, cx: float, cy: float, rx: float, ry: float, depth: float, material, bone: str, edge: str, rig):
    obj = create_ellipse(name, cx, cy, rx, ry, depth, material, bone)
    original = [vertex.co.copy() for vertex in obj.data.vertices]
    add_shape_keys(obj, ["blink"])
    basis = obj.data.shape_keys.key_blocks["Basis"]
    blink = obj.data.shape_keys.key_blocks["blink"]
    collapse_y = cy - ry - 4 if edge == "upper" else cy + ry + 4
    _, collapse_z = xy_to_world(cx, collapse_y)
    for index, point in enumerate(basis.data):
        point.co.z = collapse_z
        blink.data[index].co = original[index]
    driver_shape(obj, "blink", rig, "blink")
    return obj


def solid_material(name: str, color: tuple[float, float, float, float]):
    mat = bpy.data.materials.new(f"mat::{name}")
    mat.diffuse_color = color
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = color
    emission.inputs["Strength"].default_value = 1.0
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    mix = nodes.new("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = color[3]
    mat.node_tree.links.new(transparent.outputs["BSDF"], mix.inputs[1])
    mat.node_tree.links.new(emission.outputs["Emission"], mix.inputs[2])
    mat.node_tree.links.new(mix.outputs["Shader"], output.inputs["Surface"])
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "BLENDED"
        mat.use_transparency_overlap = False
    return mat


def create_ellipse(name: str, cx: float, cy: float, rx: float, ry: float, depth: float, material, bone: str):
    wx, wz = xy_to_world(cx, cy)
    verts = [(wx, depth, wz)]
    segments = 40
    for i in range(segments):
        a = 2 * math.pi * i / segments
        verts.append((wx + rx * PX * math.cos(a), depth, wz + ry * PX * math.sin(a)))
    faces = [(0, i + 1, (i + 1) % segments + 1) for i in range(segments)]
    mesh = bpy.data.meshes.new(f"mesh::{name}")
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    group = obj.vertex_groups.new(name=bone)
    group.add(list(range(len(verts))), 1.0, "REPLACE")
    return obj


def create_armature():
    arm_data = bpy.data.armatures.new("NiumpiRigData")
    rig = bpy.data.objects.new("NiumpiRig", arm_data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    specs = {
        "root": ((330, 550), (330, 500), None),
        "body": ((330, 475), (330, 405), "root"),
        "body_squash": ((330, 465), (330, 385), "body"),
        "head": ((330, 385), (330, 290), "body_squash"),
        "arm.L": ((178, 412), (153, 382), "body_squash"),
        "arm.R": ((477, 408), (502, 378), "body_squash"),
        "foot.L": ((278, 526), (252, 529), "root"),
        "foot.R": ((382, 526), (408, 529), "root"),
        "eye.L": ((232, 350), (232, 326), "head"),
        "eye.R": ((362, 348), (362, 324), "head"),
        "pupil.L": ((232, 350), (232, 338), "eye.L"),
        "pupil.R": ((362, 348), (362, 336), "eye.R"),
        "eyelid_upper.L": ((232, 329), (232, 341), "eye.L"),
        "eyelid_upper.R": ((362, 327), (362, 339), "eye.R"),
        "eyelid_lower.L": ((232, 371), (232, 360), "eye.L"),
        "eyelid_lower.R": ((362, 369), (362, 358), "eye.R"),
        "mouth": ((298, 393), (298, 378), "head"),
        "cheek.L": ((210, 391), (210, 378), "head"),
        "cheek.R": ((382, 387), (382, 374), "head"),
        "leaf_stem_01": ((328, 297), (326, 225), "head"),
        "leaf_stem_02": ((326, 225), (330, 145), "leaf_stem_01"),
        "leaf": ((330, 145), (349, 70), "leaf_stem_02"),
        "shadow": ((330, 548), (330, 530), "root"),
    }
    for name, (head, tail, parent) in specs.items():
        bone = arm_data.edit_bones.new(name)
        hx, hz = xy_to_world(*head)
        tx, tz = xy_to_world(*tail)
        bone.head = (hx, 0, hz)
        bone.tail = (tx, 0, tz)
        bone.use_deform = True
        if parent:
            bone.parent = arm_data.edit_bones[parent]
            bone.use_connect = name in {"leaf_stem_02", "leaf"}
    # The tiny side-lobe arms need an explicit roll.  Blender's inferred roll
    # mixed their local X translation with camera depth, so a numerically large
    # "reach" vanished from the rendered sprite.  Align local Z with the world
    # camera-depth axis: local X/Y then remain entirely in the sprite plane and
    # local-Z rotation is a clean 2D swing.
    for name in ("arm.L", "arm.R", "foot.L", "foot.R", "shadow"):
        arm_data.edit_bones[name].align_roll(Vector((0.0, 1.0, 0.0)))
    arm_data.edit_bones["shadow"].parent = None
    bpy.ops.object.mode_set(mode="POSE")
    for name in ("pupil.L", "pupil.R"):
        constraint = rig.pose.bones[name].constraints.new("LIMIT_LOCATION")
        constraint.owner_space = "LOCAL"
        constraint.use_min_x = constraint.use_max_x = True
        constraint.use_min_z = constraint.use_max_z = True
        # The semantic reading clip needs a real three-pass gaze.  Twelve
        # horizontal pixels and eight vertical pixels remain inside the
        # painted sockets while allowing the approved iris layer to reach the
        # contract's mobile-readable displacement.
        constraint.min_x, constraint.max_x = -0.12, 0.12
        constraint.min_z, constraint.max_z = -0.08, 0.08
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)
    for prop in ("blink", "mouth_open", "cheek_puff", "body_squash", "body_stretch"):
        rig[prop] = 0.0
        ui = rig.id_properties_ui(prop)
        ui.update(min=0.0, max=1.0, soft_min=0.0, soft_max=1.0)
    rig["variant"] = "baby"
    rig["rig_version"] = 3
    rig["leaf_bone_sets"] = '[{"base":"leaf_stem_01","tip":"leaf_stem_02"}]'
    rig["secondary_leaf_bones"] = "[]"
    rig["accessory_bones"] = "[]"
    rig["accessory_specs"] = "[]"
    return rig


def armature_bind(obj, rig):
    mod = obj.modifiers.new("NiumpiArmature", "ARMATURE")
    mod.object = rig
    mod.use_vertex_groups = True


def add_shape_keys(obj, names):
    obj.shape_key_add(name="Basis")
    for name in names:
        obj.shape_key_add(name=name)


def driver_shape(obj, shape_name: str, rig, prop: str):
    block = obj.data.shape_keys.key_blocks[shape_name]
    driver = block.driver_add("value").driver
    driver.type = "SCRIPTED"
    variable = driver.variables.new()
    variable.name = "control"
    variable.type = "SINGLE_PROP"
    variable.targets[0].id = rig
    variable.targets[0].data_path = f'["{prop}"]'
    driver.expression = "control"


def deform_body_shapes(body, rig):
    add_shape_keys(body, ["body_squash", "body_stretch"])
    basis = body.data.shape_keys.key_blocks["Basis"]
    center = Vector(xy_to_world(330, 465))
    for name, sx, sz in (("body_squash", 1.055, 0.91), ("body_stretch", 0.965, 1.07)):
        key = body.data.shape_keys.key_blocks[name]
        for i, point in enumerate(key.data):
            original = basis.data[i].co.copy()
            source_y = SOURCE_ANCHOR[1] - original.z / PX
            weight = float(np.clip((source_y - 365.0) / 135.0, 0.0, 1.0))
            point.co.x = original.x + (center.x + (original.x - center.x) * sx - original.x) * weight
            point.co.z = original.z + (center.y + (original.z - center.y) * sz - original.z) * weight
        driver_shape(body, name, rig, name)


def add_blink_collapse(obj, rig, center_y: float):
    """Compress painted eye pixels to a crease while revealing pearl beneath."""
    add_shape_keys(obj, ["blink"])
    basis = obj.data.shape_keys.key_blocks["Basis"]
    blink = obj.data.shape_keys.key_blocks["blink"]
    _, center_z = xy_to_world(0, center_y)
    for index, point in enumerate(blink.data):
        point.co.z = center_z + (basis.data[index].co.z - center_z) * 0.035
    driver_shape(obj, "blink", rig, "blink")


def configure_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.image_settings.color_depth = "8"
    scene.render.fps = 24
    scene.render.fps_base = 1.0
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    world = bpy.data.worlds.new("NiumpiWorld")
    world.color = (1, 1, 1)
    scene.world = world
    camera_data = bpy.data.cameras.new("NiumpiCamera")
    camera = bpy.data.objects.new("NiumpiCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0, -12, CAMERA_Z)
    camera.rotation_euler = (math.pi / 2, 0, 0)
    camera_data.type = "ORTHO"
    # Keep a literal transparent safety border around every frame.  The
    # previous 6.4 framing was tuned to the neutral pose and let the largest
    # hops touch the 512px canvas.  A 7.2 preflight still left three core peaks
    # at only 0--4 px from the top edge.  A 7.55 targeted pass left the highest
    # happy pose at 6 px; 7.6 keeps the approved silhouette
    # large while leaving a measured safety border around the most extreme
    # core and semantic poses.  CAMERA_Z is paired with this scale so the root
    # continues to project to the canonical y=442 floor anchor.
    camera_data.ortho_scale = 7.6
    scene.camera = camera
    scene["variant"] = "baby"
    scene["source_art"] = "public/assets/niumpi/stages/stage-1.webp"
    scene["render_anchor_x"] = 256
    # Root projection for CAMERA_Z=2.7609375 at ortho_scale=7.6. Keeping it in
    # lockstep with the camera makes trimmed-atlas playback stable.
    scene["render_anchor_y"] = 442
    scene["pipeline_version"] = 2
    return scene


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source = read_source()
    masks = partition_layers(source)
    master_source, _ = reconstruct_face_under_eyes(source)
    master_source, _ = reconstruct_pearl_under_cheeks(master_source, masks)
    master_source, _ = reconstruct_pearl_under_mouth(master_source, masks["mouth"])
    configure_scene()
    rig = create_armature()
    depth_order = {
        "eye.L": 0.10, "eye.R": 0.10,
        "pupil.L": 0.075, "pupil.R": 0.075, "cheek.L": 0.065,
        "cheek.R": 0.065, "mouth": 0.055,
    }
    full_alpha = source[..., 3] > 0.015
    master_image = packed_layer("body", master_source, full_alpha)
    objects = {
        "body": create_weighted_baby_master(
            master_source, material_for("body", master_image), masks, rig
        )
    }
    armature_bind(objects["body"], rig)
    for name in ("eye.L", "eye.R", "pupil.L", "pupil.R", "cheek.L", "cheek.R", "mouth"):
        layer_mask = masks[name]
        image = packed_layer(name, source, layer_mask)
        obj = create_canvas_mesh(name, material_for(name, image), depth_order[name], name, layer_mask)
        armature_bind(obj, rig)
        objects[name] = obj
    yy, xx = np.mgrid[0:source.shape[0], 0:source.shape[1]]
    for name, center_y in (("eye.L", 350), ("eye.R", 348), ("pupil.L", 350), ("pupil.R", 348)):
        add_blink_collapse(objects[name], rig, center_y)

    # Backing shapes are hidden at the reference pose but prevent holes when the
    # separated source pixels move.  They use sampled pearl tones, not new art.
    sampled_pearl = tuple(float(value) for value in source[300, 300, :3]) + (1.0,)
    sampled_iris = tuple(float(value) for value in source[350, 232, :3]) + (1.0,)
    pearl = solid_material("pearl-underlay", sampled_pearl)
    # A translucent colour sampled from the approved lobe edge gives the tiny
    # baby arms enough separation when they move over the pearl torso, without
    # introducing a foreign outline or changing the reference silhouette.
    arm_rim = solid_material("arm-rim", (0.78, 0.75, 0.88, 0.22))
    iris = solid_material("iris-underlay", sampled_iris)
    eyelid = solid_material("eyelid", sampled_pearl)
    lash = solid_material("eyelash", (0.075, 0.02, 0.10, 1.0))
    underlays = {}
    for name, cx, cy, rx, ry, depth, mat, bone in (
        ("underlay.eye.L", 232, 350, 28, 28, 0.13, iris, "eye.L"),
        ("underlay.eye.R", 362, 348, 31, 29, 0.13, iris, "eye.R"),
        ("underlay.arm.L", 151, 405, 18, 40, 0.17, arm_rim, "arm.L"),
        ("underlay.arm.R", 497, 399, 18, 40, 0.17, arm_rim, "arm.R"),
        ("underlay.foot.L", 278, 529, 20, 8, 0.17, pearl, "root"),
        ("underlay.foot.R", 382, 527, 21, 8, 0.17, pearl, "root"),
    ):
        obj = create_ellipse(name, cx, cy, rx, ry, depth, mat, bone)
        # The reconstructed head already contains the exact pearl backing for
        # the baby side lobes.  The old procedural purple arm ellipses became
        # visible as rectangular music-note shapes under stronger semantic
        # poses, so keep them out of final pixels just like the foot helpers.
        obj.hide_render = name.startswith("underlay.foot") or name.startswith("underlay.arm")
        armature_bind(obj, rig)
        underlays[name] = obj
    add_blink_collapse(underlays["underlay.eye.L"], rig, 350)
    add_blink_collapse(underlays["underlay.eye.R"], rig, 348)

    # Procedural lids are real deformable objects controlled by a shape key.
    for side, cx, cy in (("L", 232, 350), ("R", 362, 348)):
        for edge, yoff, rx, ry, material, depth in (
            ("upper", 0, 26, 1.7, lash, 0.045),
            ("lower", 3, 21, 1.0, lash, 0.044),
        ):
            name = f"eyelid_{edge}.{side}"
            obj = create_eyelid(name, cx, cy + yoff, rx, ry, depth, material, name, edge, rig)
            armature_bind(obj, rig)
            objects[name] = obj
    # One true radial-alpha texture gives a soft contact shadow on every
    # background.  The shadow bone is rootless, so body squash/hops never drag
    # it into a hard line between the feet; only its authored horizontal scale
    # responds while the vertical gap follows character height naturally.
    shadow_radius = ((xx - 330) / 74) ** 2 + ((yy - 572) / 13) ** 2
    shadow_alpha = np.clip(1.0 - shadow_radius, 0.0, 1.0) ** 2 * 0.16
    shadow_source = np.zeros_like(source)
    shadow_source[..., :3] = (0.18, 0.11, 0.32)
    shadow_source[..., 3] = shadow_alpha
    shadow_mask = shadow_alpha > 0
    shadow_image = packed_layer("shadow", shadow_source, shadow_mask)
    shadow = create_canvas_mesh("shadow", material_for("shadow", shadow_image), 0.30, "shadow", shadow_mask)
    armature_bind(shadow, rig)
    objects["shadow"] = shadow
    oral = create_ellipse("oral_underlay", 298, 393, 22, 12, 0.085, solid_material("oral", (0.12, 0.025, 0.06, 1.0)), "mouth")
    armature_bind(oral, rig)

    deform_body_shapes(objects["body"], rig)
    add_shape_keys(objects["mouth"], ["mouth_open"])
    basis = objects["mouth"].data.shape_keys.key_blocks["Basis"]
    key = objects["mouth"].data.shape_keys.key_blocks["mouth_open"]
    for i, point in enumerate(key.data):
        point.co.z = basis.data[i].co.z + (0.018 if i >= 2 else -0.018)
    driver_shape(objects["mouth"], "mouth_open", rig, "mouth_open")
    for cheek in (objects["cheek.L"], objects["cheek.R"]):
        add_shape_keys(cheek, ["puff"])
        basis = cheek.data.shape_keys.key_blocks["Basis"]
        key = cheek.data.shape_keys.key_blocks["puff"]
        center_x = sum(p.co.x for p in basis.data) / len(basis.data)
        for i, point in enumerate(key.data):
            point.co.x = center_x + (basis.data[i].co.x - center_x) * 1.05
            point.co.z = basis.data[i].co.z * 1.01
        driver_shape(cheek, "puff", rig, "cheek_puff")

    bpy.context.scene["component_objects"] = ",".join(sorted(objects))
    MASTER.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(MASTER), compress=True)
    print(f"NIUMPI_RIG_OK master={MASTER.relative_to(REPO)} objects={len(bpy.data.objects)} packed={len(bpy.data.images)}")


def requested_variant() -> str:
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for index, value in enumerate(args):
        if value == "--variant" and index + 1 < len(args):
            return args[index + 1]
    return "baby"


if __name__ == "__main__":
    variant = requested_variant()
    if variant == "baby":
        main()
    else:
        script_directory = str(Path(__file__).resolve().parent)
        if script_directory not in sys.path:
            sys.path.insert(0, script_directory)
        from build_variant_rig import build_variant
        build_variant(variant)
