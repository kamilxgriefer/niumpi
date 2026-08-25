"""Build reference-locked Niumpi rigs from the approved pearl-cloud artwork.

The old procedural model approximated the illustration with visible spheres.
This pipeline keeps the approved painted character intact on one dense mesh and
uses Blender-authored lattice-like shape keys for continuous deformation. The
result is a cohesive 2.5D performance: no seams, no detached puppet parts and
no reinterpretation of the face or materials.

Run with Blender:
    blender --background --factory-startup --python tools/blender/build_niumpi_reference_rig.py
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "public" / "assets" / "niumpi" / "models"
PREVIEW_DIR = ROOT / "art" / "blender" / "previews-v2"
SOURCE_DIR = ROOT / "art" / "blender"
FPS = 24
GRID = 32
PLANE_SIZE = 3.9
PLANE_BOTTOM = -0.34

VARIANTS = [
    "stage-1", "stage-2", "stage-3", "stage-4", "stage-5",
    "moonveil", "bloomheart", "sparkleap", "mistwander", "prismatic",
]

CLIP_SPECS = [
    ("idle", 144, True),
    ("blink", 18, False),
    ("look", 48, False),
    ("tap_reaction", 42, False),
    ("happy", 60, False),
    ("eat", 72, False),
    ("eat_favorite", 96, False),
    ("hatch_complete", 72, False),
    ("walk", 48, True),
    ("hover", 72, True),
    ("land", 24, False),
    ("sad", 72, True),
    ("sleep", 96, True),
    ("dance", 72, True),
    ("sing", 72, True),
    ("read", 96, True),
    ("lamp", 72, True),
    ("roll", 60, False),
]

SHAPES = (
    "soft_squash", "soft_stretch", "lean_left", "lean_right",
    "puff", "curl", "wave_left", "wave_right", "blink_soft",
)


def artwork_path(variant: str) -> Path:
    group = "stages" if variant.startswith("stage-") else "forms"
    return ROOT / "public" / "assets" / "niumpi" / group / f"{variant}.webp"


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocks in (
        bpy.data.meshes, bpy.data.materials, bpy.data.images,
        bpy.data.cameras, bpy.data.lights, bpy.data.actions,
    ):
        for block in list(blocks):
            blocks.remove(block)


def create_grid() -> bpy.types.Object:
    vertices = []
    faces = []
    uv_values = []
    for row in range(GRID + 1):
        v = row / GRID
        z = PLANE_BOTTOM + v * PLANE_SIZE
        for col in range(GRID + 1):
            u = col / GRID
            x = (u - 0.5) * PLANE_SIZE
            vertices.append((x, 0.0, z))
    for row in range(GRID):
        for col in range(GRID):
            a = row * (GRID + 1) + col
            b = a + 1
            d = (row + 1) * (GRID + 1) + col
            c = d + 1
            faces.append((a, b, c, d))
            uv_values.append(((col / GRID, row / GRID), ((col + 1) / GRID, row / GRID),
                              ((col + 1) / GRID, (row + 1) / GRID), (col / GRID, (row + 1) / GRID)))

    mesh = bpy.data.meshes.new("NiumpiReferenceMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon, face_uvs in zip(mesh.polygons, uv_values):
        for loop_index, uv in zip(polygon.loop_indices, face_uvs):
            uv_layer.data[loop_index].uv = uv

    obj = bpy.data.objects.new("NiumpiArtwork", mesh)
    bpy.context.collection.objects.link(obj)
    obj["niumpi_reference_locked"] = True
    return obj


def create_material(variant: str) -> bpy.types.Material:
    image = bpy.data.images.load(str(artwork_path(variant)), check_existing=False)
    image.name = f"Niumpi_{variant}_Artwork"
    image.colorspace_settings.name = "sRGB"

    mat = bpy.data.materials.new(f"ReferenceArtwork_{variant}")
    mat.use_nodes = True
    mat.surface_render_method = "DITHERED"
    mat.use_transparency_overlap = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    for node in list(nodes):
        nodes.remove(node)

    output = nodes.new("ShaderNodeOutputMaterial")
    surface = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Linear"
    surface.inputs["Roughness"].default_value = 0.95
    surface.inputs["Metallic"].default_value = 0.0
    if "Emission Strength" in surface.inputs:
        surface.inputs["Emission Strength"].default_value = 0.25
        links.new(texture.outputs["Color"], surface.inputs["Emission Color"])
    links.new(texture.outputs["Color"], surface.inputs["Base Color"])
    links.new(texture.outputs["Alpha"], surface.inputs["Alpha"])
    links.new(surface.outputs["BSDF"], output.inputs["Surface"])
    return mat


def gaussian(value: float, centre: float, spread: float) -> float:
    return math.exp(-((value - centre) / spread) ** 2)


def create_shape_keys(obj: bpy.types.Object) -> None:
    basis = obj.shape_key_add(name="Basis")
    for name in SHAPES:
        shape = obj.shape_key_add(name=name)
        for index, point in enumerate(shape.data):
            original = basis.data[index].co
            x, y, z = original.x, original.y, original.z
            u = x / PLANE_SIZE + 0.5
            v = (z - PLANE_BOTTOM) / PLANE_SIZE
            body_weight = gaussian(u, 0.5, 0.37) * gaussian(v, 0.50, 0.42)
            top_weight = max(0.0, min(1.0, (v - 0.18) / 0.68))

            if name == "soft_squash":
                point.co.x = x * (1.0 + 0.075 * body_weight)
                point.co.z = 1.52 + (z - 1.52) * (1.0 - 0.10 * body_weight)
            elif name == "soft_stretch":
                point.co.x = x * (1.0 - 0.055 * body_weight)
                point.co.z = 1.48 + (z - 1.48) * (1.0 + 0.085 * body_weight)
            elif name == "lean_left":
                point.co.x = x - 0.16 * top_weight * body_weight
                point.co.z = z + 0.018 * (0.5 - u) * body_weight
            elif name == "lean_right":
                point.co.x = x + 0.16 * top_weight * body_weight
                point.co.z = z + 0.018 * (u - 0.5) * body_weight
            elif name == "puff":
                point.co.x = x * (1.0 + 0.045 * body_weight)
                point.co.z = 1.52 + (z - 1.52) * (1.0 + 0.04 * body_weight)
            elif name == "curl":
                point.co.x = x * (1.0 + 0.08 * (1.0 - top_weight) * body_weight)
                point.co.z = z - 0.16 * body_weight + 0.05 * abs(x) * body_weight
            elif name in {"wave_left", "wave_right"}:
                side = -1 if name == "wave_left" else 1
                arm_x = 0.27 if side < 0 else 0.73
                arm_weight = gaussian(u, arm_x, 0.11) * gaussian(v, 0.48, 0.16)
                point.co.x = x + side * 0.13 * arm_weight
                point.co.z = z + 0.22 * arm_weight
            elif name == "blink_soft":
                left = gaussian(u, 0.34, 0.085) * gaussian(v, 0.53, 0.095)
                right = gaussian(u, 0.64, 0.085) * gaussian(v, 0.53, 0.095)
                eye_weight = max(left, right)
                eye_centre_z = PLANE_BOTTOM + 0.53 * PLANE_SIZE
                point.co.z = z + (eye_centre_z - z) * 0.72 * eye_weight


def key_transform(root: bpy.types.Object, frame: int, *, x: float = 0.0, z: float = 0.0,
                  rotate: float = 0.0, sx: float = 1.0, sz: float = 1.0) -> None:
    root.location = (x, 0.0, z)
    root.rotation_euler = (0.0, math.radians(rotate), 0.0)
    root.scale = (sx, 1.0, sz)
    root.keyframe_insert("location", frame=frame)
    root.keyframe_insert("rotation_euler", frame=frame)
    root.keyframe_insert("scale", frame=frame)


def key_shapes(obj: bpy.types.Object, frame: int, **values: float) -> None:
    keys = obj.data.shape_keys.key_blocks
    for name in SHAPES:
        keys[name].value = max(0.0, min(1.0, values.get(name, 0.0)))
        keys[name].keyframe_insert("value", frame=frame)


def pose(root: bpy.types.Object, artwork: bpy.types.Object, frame: int, *,
         x: float = 0.0, z: float = 0.0, rotate: float = 0.0,
         sx: float = 1.0, sz: float = 1.0, **shapes: float) -> None:
    key_transform(root, frame, x=x, z=z, rotate=rotate, sx=sx, sz=sz)
    key_shapes(artwork, frame, **shapes)


def author_animation(root: bpy.types.Object, artwork: bpy.types.Object) -> dict[str, dict]:
    clips: dict[str, dict] = {}
    cursor = 1
    for name, duration, loop in CLIP_SPECS:
        start, end = cursor, cursor + duration
        pose(root, artwork, start)
        if name == "idle":
            pose(root, artwork, start + 36, x=-0.018, z=0.045, rotate=-0.8, soft_stretch=.18, lean_left=.14)
            pose(root, artwork, start + 72, x=0.012, z=-0.008, rotate=.55, soft_squash=.10, lean_right=.10)
            pose(root, artwork, start + 108, x=.015, z=.032, rotate=.6, soft_stretch=.12, lean_right=.12)
        elif name == "blink":
            pose(root, artwork, start + 7, blink_soft=.92, soft_squash=.06)
            pose(root, artwork, start + 11, blink_soft=.92, soft_squash=.06)
        elif name == "look":
            pose(root, artwork, start + 12, x=-.04, rotate=-2.4, lean_left=.48)
            pose(root, artwork, start + 28, x=.04, rotate=2.2, lean_right=.46)
            pose(root, artwork, start + 38, x=.01, rotate=.6, blink_soft=.7)
        elif name == "tap_reaction":
            pose(root, artwork, start + 6, z=-.10, sx=1.06, sz=.91, soft_squash=.9)
            pose(root, artwork, start + 15, z=.31, rotate=2.4, sx=.94, sz=1.07, soft_stretch=1, puff=.28)
            pose(root, artwork, start + 27, z=-.035, rotate=-1.1, sx=1.035, sz=.96, soft_squash=.55)
            pose(root, artwork, start + 35, z=.035, soft_stretch=.22)
        elif name == "happy":
            for offset, side in ((10, -1), (26, 1), (42, -1)):
                pose(root, artwork, start + offset, x=.055 * side, z=.18, rotate=3.7 * side,
                     sx=.965, sz=1.04, soft_stretch=.65,
                     wave_left=.7 if side < 0 else .2, wave_right=.7 if side > 0 else .2,
                     lean_left=.22 if side < 0 else 0, lean_right=.22 if side > 0 else 0)
                pose(root, artwork, start + offset + 7, x=-.018 * side, z=-.02, sx=1.025, sz=.975, soft_squash=.42)
        elif name == "eat":
            # Notice/sniff, lean toward the offered treat, three soft chews,
            # swallow, then a small satisfied lift.
            pose(root, artwork, start + 10, x=-.025, z=.025, rotate=-1.4, lean_left=.30, puff=.08)
            pose(root, artwork, start + 20, x=.035, z=-.045, rotate=1.8, curl=.24, lean_right=.42)
            for offset, squash in ((30, .68), (40, .52), (50, .62)):
                pose(root, artwork, start + offset, z=-.025, sx=1.018, sz=.975,
                     soft_squash=squash, puff=.22, blink_soft=.32 if offset == 50 else 0)
                pose(root, artwork, start + offset + 5, z=.018, sx=.99, sz=1.018, soft_stretch=.32)
            pose(root, artwork, start + 62, z=.105, sx=.975, sz=1.035, soft_stretch=.55, puff=.38)
        elif name == "eat_favorite":
            # The same readable eating grammar, followed by an unmistakable
            # delighted double bounce for a remembered favourite.
            pose(root, artwork, start + 9, x=-.035, z=.035, rotate=-2.0, lean_left=.42, puff=.12)
            pose(root, artwork, start + 20, x=.045, z=-.04, rotate=2.1, curl=.28, lean_right=.46)
            for offset, side in ((31, -1), (42, 1), (53, -1)):
                pose(root, artwork, start + offset, x=.018 * side, z=-.02, rotate=1.0 * side,
                     sx=1.025, sz=.97, soft_squash=.68, puff=.30)
                pose(root, artwork, start + offset + 5, x=-.01 * side, z=.025, sx=.985, sz=1.025, soft_stretch=.42)
            pose(root, artwork, start + 68, x=-.05, z=.18, rotate=-4.2, soft_stretch=.72,
                 wave_left=.85, wave_right=.28, lean_left=.28)
            pose(root, artwork, start + 81, x=.05, z=.21, rotate=4.5, soft_stretch=.78,
                 wave_left=.28, wave_right=.85, lean_right=.30, puff=.35)
            pose(root, artwork, start + 90, z=-.018, sx=1.02, sz=.985, soft_squash=.32)
        elif name == "hatch_complete":
            pose(root, artwork, start, z=-.22, sx=.55, sz=.35, soft_squash=1, blink_soft=1)
            pose(root, artwork, start + 16, z=.28, sx=.90, sz=1.09, soft_stretch=1, puff=.65)
            pose(root, artwork, start + 32, z=-.06, sx=1.07, sz=.91, soft_squash=.85)
            pose(root, artwork, start + 48, z=.10, sx=.98, sz=1.035, soft_stretch=.5)
            pose(root, artwork, start + 61, z=-.018, sx=1.01, sz=.99, soft_squash=.2)
        elif name == "walk":
            for offset, side in ((12, -1), (24, 1), (36, -1)):
                pose(root, artwork, start + offset, x=.06 * side, z=.08, rotate=2.8 * side,
                     soft_stretch=.35, lean_left=.34 if side < 0 else 0, lean_right=.34 if side > 0 else 0)
        elif name == "hover":
            pose(root, artwork, start + 18, x=-.035, z=.27, rotate=-1.7, soft_stretch=.38, lean_left=.2)
            pose(root, artwork, start + 36, x=.03, z=.37, rotate=1.5, soft_stretch=.5, lean_right=.22)
            pose(root, artwork, start + 54, x=.015, z=.28, rotate=.5, soft_stretch=.31)
        elif name == "land":
            pose(root, artwork, start, z=.25, soft_stretch=.58)
            pose(root, artwork, start + 9, z=-.085, sx=1.08, sz=.89, soft_squash=1)
            pose(root, artwork, start + 17, z=.045, sx=.98, sz=1.03, soft_stretch=.48)
        elif name == "sad":
            pose(root, artwork, start + 22, z=-.075, rotate=-1.3, sx=1.025, sz=.94, curl=.72, lean_left=.16)
            pose(root, artwork, start + 50, z=-.09, rotate=1.0, sx=1.035, sz=.925, curl=.84, lean_right=.12)
        elif name == "sleep":
            pose(root, artwork, start + 24, z=-.12, rotate=-4.0, sx=1.035, sz=.91, curl=.8, blink_soft=1)
            pose(root, artwork, start + 48, z=-.10, rotate=-3.6, sx=1.018, sz=.94, curl=.68, blink_soft=1)
            pose(root, artwork, start + 72, z=-.12, rotate=-4.0, sx=1.035, sz=.91, curl=.8, blink_soft=1)
        elif name == "dance":
            for offset, side in ((12, -1), (24, 1), (36, -1), (48, 1), (60, -1)):
                pose(root, artwork, start + offset, x=.09 * side, z=.12 if offset % 24 else .02,
                     rotate=7.5 * side, soft_stretch=.45,
                     wave_left=.9 if side < 0 else .28, wave_right=.9 if side > 0 else .28,
                     lean_left=.38 if side < 0 else 0, lean_right=.38 if side > 0 else 0)
        elif name == "sing":
            for offset, amount in ((16, .62), (32, .20), (48, .8), (64, .26)):
                pose(root, artwork, start + offset, z=.06 if amount > .5 else .01, rotate=math.sin(offset) * 1.6,
                     puff=amount, soft_stretch=amount * .35, wave_left=.48, wave_right=.48)
        elif name == "read":
            pose(root, artwork, start + 24, x=-.018, z=-.035, rotate=-1.2, curl=.35, lean_left=.18)
            pose(root, artwork, start + 48, x=.012, z=-.025, rotate=1.0, curl=.31, lean_right=.16)
            pose(root, artwork, start + 72, x=-.008, z=-.04, rotate=-.7, curl=.37, blink_soft=.55)
        elif name == "lamp":
            pose(root, artwork, start + 18, x=.04, rotate=2.3, lean_right=.55, wave_right=.62)
            pose(root, artwork, start + 36, x=.065, rotate=3.1, lean_right=.72, wave_right=1)
            pose(root, artwork, start + 54, x=.035, rotate=1.8, lean_right=.42, wave_right=.48)
        elif name == "roll":
            pose(root, artwork, start + 10, x=-.12, z=-.07, rotate=-12, sx=1.04, sz=.93, soft_squash=.65)
            pose(root, artwork, start + 25, x=.02, z=.07, rotate=20, sx=.96, sz=1.04, soft_stretch=.6, puff=.25)
            pose(root, artwork, start + 42, x=.10, z=-.045, rotate=-9, sx=1.035, sz=.95, soft_squash=.5)

        pose(root, artwork, end)
        clips[name] = {
            "startFrame": start,
            "endFrame": end,
            "startSeconds": start / FPS,
            "durationSeconds": duration / FPS,
            "loop": loop,
        }
        cursor = end + 2

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = cursor
    return clips


def configure_interpolation() -> None:
    # Blender 5 stores keyframes in layered actions. The exporter samples the
    # evaluated result every frame; AUTO_CLAMPED keeps the soft mesh from
    # overshooting between anticipation and recovery poses.
    for action in bpy.data.actions:
        for layer in getattr(action, "layers", []):
            for strip in getattr(layer, "strips", []):
                for channelbag in getattr(strip, "channelbags", []):
                    for curve in channelbag.fcurves:
                        for point in curve.keyframe_points:
                            point.interpolation = "BEZIER"
                            point.handle_left_type = "AUTO_CLAMPED"
                            point.handle_right_type = "AUTO_CLAMPED"


def setup_preview() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.object.camera_add(location=(0, -7.8, 1.52))
    camera = bpy.context.object
    camera.name = "PreviewCamera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 4.1
    camera.rotation_euler = (math.radians(90), 0.0, 0.0)
    scene.camera = camera


def export_variant(variant: str) -> None:
    filepath = MODEL_DIR / f"{variant}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(filepath), export_format="GLB", use_visible=True,
        export_cameras=False, export_lights=False, export_animations=True,
        export_animation_mode="SCENE",
        export_nla_strips_merged_animation_name="NiumpiReferencePerformance",
        export_force_sampling=True, export_frame_step=1,
        export_optimize_animation_size=True, export_materials="EXPORT",
        export_extras=True, export_yup=True,
    )
    print(f"NIUMPI_REFERENCE_EXPORTED {variant} {filepath.stat().st_size}")


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    requested = {item.strip() for item in os.getenv("NIUMPI_VARIANTS", "").split(",") if item.strip()}
    variants = [variant for variant in VARIANTS if not requested or variant in requested]
    shared_clips = None
    for variant in variants:
        clear_scene()
        root = bpy.data.objects.new("NiumpiRoot", None)
        bpy.context.collection.objects.link(root)
        artwork = create_grid()
        artwork.data.materials.append(create_material(variant))
        artwork.parent = root
        create_shape_keys(artwork)
        clips = author_animation(root, artwork)
        configure_interpolation()
        shared_clips = clips
        setup_preview()
        bpy.context.scene.frame_set(clips["happy"]["startFrame"] + 18)
        bpy.context.scene.render.filepath = str(PREVIEW_DIR / f"{variant}.png")
        bpy.ops.render.render(write_still=True)
        export_variant(variant)
        if variant == "stage-5":
            bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR / "niumpi-reference-rig-v2.blend"))

    if shared_clips:
        manifest = {
            "version": 2,
            "renderer": "blender-gltf",
            "artDirection": "reference-locked-pearl-cloud",
            "blenderVersion": bpy.app.version_string,
            "fps": FPS,
            "variants": VARIANTS,
            "clips": shared_clips,
        }
        (MODEL_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
