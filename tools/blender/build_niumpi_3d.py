"""Build the production Niumpi 3D rigs and browser-ready GLB assets.

Run with Blender, never the system Python:
    blender --background --factory-startup --python tools/blender/build_niumpi_3d.py

The artwork stays procedural and deterministic so every evolution stage shares
one visual language, one animation vocabulary and one reproducible source.
"""

from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = ROOT / "public" / "assets" / "niumpi" / "models"
PREVIEW_DIR = ROOT / "art" / "blender" / "previews"
SOURCE_DIR = ROOT / "art" / "blender"
FPS = 24


@dataclass(frozen=True)
class StageSpec:
    variant: str
    stage: int
    body_scale: tuple[float, float, float]
    arm: float
    feet: float
    leaves: int
    route: str = "neutral"


STAGES = [
    StageSpec("stage-1", 1, (0.88, 0.78, 0.86), 0.18, 0.72, 1),
    StageSpec("stage-2", 2, (0.95, 0.82, 0.94), 0.38, 0.82, 2),
    StageSpec("stage-3", 3, (1.02, 0.86, 1.02), 0.66, 0.90, 3),
    StageSpec("stage-4", 4, (1.08, 0.90, 1.08), 0.86, 0.97, 5),
    StageSpec("stage-5", 5, (1.13, 0.94, 1.13), 1.00, 1.00, 5),
    StageSpec("moonveil", 5, (1.15, 0.95, 1.16), 1.02, 1.00, 5, "moonveil"),
    StageSpec("bloomheart", 5, (1.15, 0.95, 1.16), 1.02, 1.00, 5, "bloomheart"),
    StageSpec("sparkleap", 5, (1.13, 0.93, 1.13), 1.00, 1.00, 5, "sparkleap"),
    StageSpec("mistwander", 5, (1.14, 0.93, 1.15), 1.01, 1.00, 5, "mistwander"),
    StageSpec("prismatic", 5, (1.16, 0.96, 1.17), 1.04, 1.00, 5, "prismatic"),
]


# One continuous Blender timeline. The web player seeks into these ranges and
# Blender's Bezier curves provide infinitely smooth in-between motion at 60 FPS.
CLIP_SPECS = [
    ("idle", 144, True),
    ("blink", 18, False),
    ("look", 48, False),
    ("tap_reaction", 42, False),
    ("happy", 60, False),
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


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.metaballs, bpy.data.materials,
                  bpy.data.cameras, bpy.data.lights, bpy.data.actions):
        for item in list(block):
            block.remove(item)


def rgba(hex_value: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    value = hex_value.removeprefix("#")
    return tuple(int(value[index:index + 2], 16) / 255 for index in (0, 2, 4)) + (alpha,)


def material(name: str, colour: str, *, roughness: float = 0.3, metallic: float = 0.0,
             emission: str | None = None, emission_strength: float = 0.0,
             alpha: float = 1.0, coat: float = 0.0) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba(colour, alpha)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba(colour, alpha)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = 0.14
    if emission and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = rgba(emission)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = "DITHERED"
    return mat


def smooth(obj: bpy.types.Object) -> None:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def uv_sphere(name: str, location: tuple[float, float, float], scale: tuple[float, float, float],
              mat: bpy.types.Material, *, segments: int = 32, rings: int = 20) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def meta_cloud(name: str, centres: list[tuple[tuple[float, float, float], float]],
               mat: bpy.types.Material) -> bpy.types.Object:
    data = bpy.data.metaballs.new(f"{name}Data")
    data.resolution = 0.075
    data.render_resolution = 0.035
    data.threshold = 0.63
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for centre, radius in centres:
        element = data.elements.new()
        element.co = centre
        element.radius = radius
        element.stiffness = 2.15
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.object
    obj.data.materials.append(mat)
    smooth(obj)
    return obj


def empty(name: str, location=(0.0, 0.0, 0.0), parent: bpy.types.Object | None = None) -> bpy.types.Object:
    obj = bpy.data.objects.new(name, None)
    obj.empty_display_type = "SPHERE"
    obj.empty_display_size = 0.12
    obj.location = location
    bpy.context.collection.objects.link(obj)
    if parent:
        obj.parent = parent
    return obj


def parent_keep(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def curve_line(name: str, points: list[tuple[float, float, float]], bevel: float,
               mat: bpy.types.Material, parent: bpy.types.Object | None = None) -> bpy.types.Object:
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = bevel
    data.bevel_resolution = 4
    data.resolution_u = 12
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    data.materials.append(mat)
    if parent:
        parent_keep(obj, parent)
    return obj


def leaf_mesh(name: str, location: tuple[float, float, float], scale: float,
              colour: bpy.types.Material, vein: bpy.types.Material, parent: bpy.types.Object) -> bpy.types.Object:
    # A glossy ellipsoid reads as a fleshy, living leaf under motion and avoids
    # the cardboard profile of a textured plane.  The controller sits at the
    # stem while the leaf volume grows upward from that pivot.
    obj = uv_sphere(name, (location[0], location[1], location[2] + .43 * scale),
                    (.31 * scale, .075 * scale, .54 * scale), colour, segments=28, rings=18)
    parent_keep(obj, parent)
    curve_line(f"{name}Vein", [location, (location[0], location[1] - 0.035, location[2] + 0.88 * scale)],
               0.012 * scale, vein, parent)
    return obj


def add_route_features(route: str, controls: dict[str, bpy.types.Object], mats: dict[str, bpy.types.Material]) -> None:
    body = controls["body"]
    if route == "moonveil":
        moon = mats["moon"]
        for side in (-1, 1):
            curve_line(f"MoonCrescent{side}", [
                (side * 0.98, -0.06, 1.95), (side * 1.28, -0.02, 2.28), (side * 1.06, -0.05, 2.58)
            ], 0.105, moon, body)
    elif route == "bloomheart":
        for side in (-1, 1):
            for index, angle in enumerate((-34, 0, 34)):
                petal = uv_sphere(f"HeartPetal{side}_{index}", (side * (0.92 + index * 0.08), -0.02, 1.55 + index * 0.18),
                                  (0.22, 0.13, 0.45), mats["bloom"], segments=24, rings=16)
                petal.rotation_euler.y = math.radians(side * angle)
                parent_keep(petal, body)
    elif route == "sparkleap":
        for side in (-1, 1):
            wing = leaf_mesh(f"Wing{side}", (side * 0.82, 0.12, 1.48), 1.05, mats["wing"], mats["vein"], body)
            wing.rotation_euler.y = math.radians(side * 58)
            wing.rotation_euler.z = math.radians(side * -24)
    elif route == "mistwander":
        curve_line("MistTail", [(0.72, 0.05, 1.02), (1.35, 0.12, 0.82), (1.62, 0.08, 1.08), (1.38, 0.04, 1.32)],
                   0.16, mats["mist"], body)
    elif route == "prismatic":
        for index, (x, z, size) in enumerate(((-1.15, 1.0, .18), (1.18, 1.18, .22), (-.86, 2.35, .15), (.96, 2.48, .17))):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size, location=(x, -0.02, z))
            crystal = bpy.context.object
            crystal.name = f"PrismCrystal{index}"
            crystal.scale.z = 1.8
            crystal.data.materials.append(mats["prism"])
            parent_keep(crystal, body)


def build_creature(spec: StageSpec) -> tuple[dict[str, bpy.types.Object], dict[str, tuple[Vector, Vector, Vector]]]:
    route_colours = {
        "neutral": ("#f8f4ff", "#9eeaff", "#31cdb6"),
        "moonveil": ("#d9dcff", "#8177ff", "#7f87ff"),
        "bloomheart": ("#fff0f7", "#ff83c7", "#6fe7bd"),
        "sparkleap": ("#f3f7ff", "#72d8ff", "#70f3d5"),
        "mistwander": ("#e8f1ff", "#8bbcf7", "#79dbd7"),
        "prismatic": ("#fff8ff", "#d08cff", "#66efe1"),
    }
    body_colour, accent, leaf_colour = route_colours[spec.route]
    mats = {
        "body": material("Pearl cloud", body_colour, roughness=0.23, coat=0.8,
                         emission=body_colour, emission_strength=0.035),
        "face": material("Face pearl", "#fffdfb", roughness=0.25, coat=0.65,
                         emission="#fff9ff", emission_strength=0.055),
        "eye": material("Iris glass", "#301d69", roughness=0.12, metallic=0.12, coat=1.0,
                        emission="#5656ff", emission_strength=0.12),
        "pupil": material("Deep pupil", "#140b2e", roughness=0.18, coat=0.8),
        "white": material("Eye sparkle", "#ffffff", roughness=0.08, emission="#ffffff", emission_strength=0.7),
        "cheek": material("Cheek glow", "#ff9ecf", roughness=0.35, emission="#ff7fbb", emission_strength=0.2, alpha=0.62),
        "mouth": material("Mouth", "#3b174f", roughness=0.3),
        "tongue": material("Tongue", "#ff8ba8", roughness=0.36),
        "leaf": material("Iridescent leaf", leaf_colour, roughness=0.16, metallic=0.12, coat=1.0,
                         emission=accent, emission_strength=0.055),
        "vein": material("Golden vein", "#fff2a4", roughness=0.23, metallic=0.55, emission="#fff5bd", emission_strength=0.12),
        "moon": material("Moonlight", "#918cff", roughness=0.18, emission="#b4b5ff", emission_strength=0.24, alpha=0.88),
        "bloom": material("Heart bloom", "#ff9ccf", roughness=0.22, coat=0.7),
        "wing": material("Sky wing", "#93efff", roughness=0.13, metallic=0.1, emission="#bcf7ff", emission_strength=0.16, alpha=0.72),
        "mist": material("Mist ribbon", "#98dcff", roughness=0.2, emission="#c2f0ff", emission_strength=0.18, alpha=0.72),
        "prism": material("Prismatic crystal", "#d9b2ff", roughness=0.08, metallic=0.25, emission="#aefaff", emission_strength=0.32, alpha=0.88),
    }

    root = empty("NiumpiRoot")
    body_ctrl = empty("BodyControl", (0, 0, 1.32), root)
    face_ctrl = empty("FaceControl", (0, -0.02, 0.23), body_ctrl)
    # The pivots sit just outside the cloud silhouette and toward camera. This
    # keeps every growing arm readable without ever making it look detached.
    left_arm = empty("LeftArmControl", (-1.04, -0.49, 0.10), body_ctrl)
    right_arm = empty("RightArmControl", (1.04, -0.49, 0.10), body_ctrl)
    left_foot = empty("LeftFootControl", (-0.38, 0, 0.42), root)
    right_foot = empty("RightFootControl", (0.38, 0, 0.42), root)
    leaf_controls = [empty(f"LeafControl{index}", (0, -0.24, 0.93), body_ctrl) for index in range(spec.leaves)]
    left_eye = empty("LeftEyeControl", (-0.35, -0.80, 0.03), face_ctrl)
    right_eye = empty("RightEyeControl", (0.35, -0.80, 0.03), face_ctrl)
    mouth_ctrl = empty("MouthControl", (0, -0.68, -0.39), face_ctrl)

    def world_location(obj: bpy.types.Object) -> tuple[float, float, float]:
        value = obj.matrix_world.translation
        return value.x, value.y, value.z

    sx, sy, sz = spec.body_scale
    # The central pearl and its overlapping lobes move under one controller.
    # They keep real volume and shared lighting, but never articulate as loose
    # puppet pieces; the silhouette reads as one soft cloud from every angle.
    core = uv_sphere("CloudBody", (0, 0, 1.38), (.91 * sx, .76 * sy, .94 * sz), mats["body"], segments=40, rings=28)
    parent_keep(core, body_ctrl)
    lobe_specs = [
        (-.72, .03, 1.48, .43, .34, .47), (.72, .03, 1.48, .43, .34, .47),
        (-.49, .05, 2.02, .42, .33, .40), (.49, .05, 2.02, .42, .33, .40),
        (0, .05, 2.19, .46, .35, .37),
        (-.57, .04, .88, .44, .34, .39), (.57, .04, .88, .44, .34, .39),
        (0, .05, .69, .49, .35, .36),
        (-.88, .07, 1.12, .32, .28, .39), (.88, .07, 1.12, .32, .28, .39),
        (-.22, -.18, 2.27, .30, .24, .27),
    ]
    for index, (x, y, z, lx, ly, lz) in enumerate(lobe_specs):
        lobe = uv_sphere(f"CloudLobe{index}", (x * sx, y, z), (lx * sx, ly * sy, lz * sz),
                         mats["body"], segments=28, rings=18)
        parent_keep(lobe, body_ctrl)
    face_pearl = uv_sphere("FacePearl", (0, -.60 * sy, 1.47), (.63 * sx, .075, .59 * sz),
                           mats["face"], segments=36, rings=24)
    parent_keep(face_pearl, face_ctrl)

    def make_arm(name: str, side: int, control: bpy.types.Object) -> None:
        size = spec.arm
        # Stage one is a true newborn: the arm controllers already exist in
        # the rig, but no visible paw has grown yet. This prevents the tiny
        # disconnected dots that made the baby look assembled from pieces.
        if spec.stage == 1:
            return
        control_world = world_location(control)
        arm = uv_sphere(name, control_world, (.36 * size, .25 * size, .31 * size), mats["body"], segments=24, rings=16)
        parent_keep(arm, control)
        if spec.stage >= 3:
            for finger in (-1, 0, 1):
                tip = uv_sphere(f"{name}Finger{finger}",
                                (control_world[0] + side * (.26 + abs(finger) * .015) * size,
                                 control_world[1] - .03, control_world[2] + finger * .11 * size),
                                (.10 * size, .09 * size, .16 * size), mats["body"], segments=20, rings=12)
                parent_keep(tip, control)

    make_arm("LeftCloudArm", -1, left_arm)
    make_arm("RightCloudArm", 1, right_arm)

    for name, control in (("LeftPearlFoot", left_foot), ("RightPearlFoot", right_foot)):
        foot = uv_sphere(name, control.location, (0.25 * spec.feet, 0.23 * spec.feet, 0.32 * spec.feet), mats["body"])
        parent_keep(foot, control)

    def eye(control: bpy.types.Object, side: int) -> None:
        x, y, z = world_location(control)
        iris = uv_sphere(f"Eye{side}", (x, y, z), (.28, .15, .38), mats["eye"], segments=36, rings=24)
        pupil = uv_sphere(f"Pupil{side}", (x, y - .18, z - .015), (.145, .055, .245), mats["pupil"], segments=28, rings=18)
        shine = uv_sphere(f"EyeShine{side}", (x - .08, y - .242, z + .14), (.064, .025, .082), mats["white"], segments=18, rings=12)
        tiny = uv_sphere(f"EyeSpark{side}", (x + .075, y - .24, z - .10), (.028, .018, .037), mats["white"], segments=14, rings=10)
        for obj in (iris, pupil, shine, tiny):
            parent_keep(obj, control)

    eye(left_eye, -1)
    eye(right_eye, 1)
    for side in (-1, 1):
        cheek = uv_sphere(f"Cheek{side}", (side * .59, -.67, 1.24), (.24, .045, .13), mats["cheek"], segments=24, rings=14)
        parent_keep(cheek, face_ctrl)

    mouth_world = world_location(mouth_ctrl)
    mouth = uv_sphere("HappyMouth", mouth_world, (.125, .038, .09), mats["mouth"], segments=28, rings=18)
    tongue = uv_sphere("Tongue", (mouth_world[0], mouth_world[1] - .045, mouth_world[2] - .048), (.058, .014, .026), mats["tongue"], segments=20, rings=12)
    parent_keep(mouth, mouth_ctrl)
    parent_keep(tongue, mouth_ctrl)
    curve_line("SmileLine", [(-.14, mouth_world[1] - .035, mouth_world[2] + .045),
                              (0, mouth_world[1] - .052, mouth_world[2] - .035),
                              (.14, mouth_world[1] - .035, mouth_world[2] + .045)],
               .022, mats["mouth"], mouth_ctrl)

    for side in (-1, 1):
        curve_line(f"Brow{side}", [
            (side * .48, -.695, 1.93), (side * .35, -.715, 1.98), (side * .22, -.695, 1.94)
        ], .018, mats["eye"], face_ctrl)

    leaf_angles = {1: [0], 2: [-20, 22], 3: [-33, 0, 34], 5: [-48, -24, 0, 25, 48]}[spec.leaves]
    for index, (control, angle) in enumerate(zip(leaf_controls, leaf_angles)):
        size = 0.76 if spec.stage == 1 else 0.72 + spec.stage * .035
        x = math.sin(math.radians(angle)) * .96
        control.location.x = x
        leaf_x, leaf_y, leaf_z = world_location(control)
        leaf_mesh(f"MoodLeaf{index}", (leaf_x, leaf_y - .03, leaf_z - abs(angle) * .0025), size, mats["leaf"], mats["vein"], control)
        control.rotation_euler.y = math.radians((-24 if angle == 0 else angle * .62))
        control.rotation_euler.z = math.radians((-16 if angle == 0 else -angle * .18))

    controls = {
        "root": root, "body": body_ctrl, "face": face_ctrl,
        "left_arm": left_arm, "right_arm": right_arm,
        "left_foot": left_foot, "right_foot": right_foot,
        "left_eye": left_eye, "right_eye": right_eye, "mouth": mouth_ctrl,
        **{f"leaf_{index}": control for index, control in enumerate(leaf_controls)},
    }
    add_route_features(spec.route, controls, mats)
    defaults = {name: (obj.location.copy(), obj.rotation_euler.copy(), obj.scale.copy()) for name, obj in controls.items()}
    return controls, defaults


def key(obj: bpy.types.Object, frame: int) -> None:
    obj.keyframe_insert("location", frame=frame)
    obj.keyframe_insert("rotation_euler", frame=frame)
    obj.keyframe_insert("scale", frame=frame)


def apply_pose(controls, defaults, frame: int, changes: dict[str, dict[str, tuple[float, float, float]]]) -> None:
    for name, obj in controls.items():
        base_location, base_rotation, base_scale = defaults[name]
        change = changes.get(name, {})
        location = change.get("location", (0, 0, 0))
        rotation = change.get("rotation", (0, 0, 0))
        scale = change.get("scale", (1, 1, 1))
        obj.location = base_location + Vector(location)
        obj.rotation_euler = tuple(base_rotation[index] + math.radians(rotation[index]) for index in range(3))
        obj.scale = Vector((base_scale.x * scale[0], base_scale.y * scale[1], base_scale.z * scale[2]))
        key(obj, frame)


def leaf_changes(controls, angle: float) -> dict[str, dict[str, tuple[float, float, float]]]:
    return {name: {"rotation": (0, angle * (1 if int(name.split("_")[-1]) % 2 == 0 else -0.72), angle * .22)}
            for name in controls if name.startswith("leaf_")}


def merge(*parts: dict) -> dict:
    result = {}
    for part in parts:
        for name, values in part.items():
            result.setdefault(name, {}).update(values)
    return result


def author_animation(controls, defaults) -> dict[str, dict]:
    clips = {}
    cursor = 1
    for name, duration, loop in CLIP_SPECS:
        start = cursor
        end = start + duration
        apply_pose(controls, defaults, start, {})

        if name == "idle":
            apply_pose(controls, defaults, start + 36, merge({"root": {"location": (-.025, 0, .045), "rotation": (0, -2.4, -1.5)}, "body": {"scale": (1.018, .99, .975)}, "face": {"rotation": (1.1, 0, 0)}}, leaf_changes(controls, 5)))
            apply_pose(controls, defaults, start + 72, merge({"root": {"location": (.018, 0, -.008), "rotation": (0, 1.8, 1.2)}, "body": {"scale": (.988, 1.01, 1.025)}}, leaf_changes(controls, -4)))
            apply_pose(controls, defaults, start + 108, merge({"root": {"location": (.022, 0, .035), "rotation": (0, 2.4, 1.0)}, "body": {"scale": (1.012, 1, .982)}}, leaf_changes(controls, 3)))
        elif name == "blink":
            eyes = {"left_eye": {"scale": (1, 1, .08)}, "right_eye": {"scale": (1, 1, .08)}, "body": {"scale": (1.006, 1, .992)}}
            apply_pose(controls, defaults, start + 8, eyes)
            apply_pose(controls, defaults, start + 11, eyes)
        elif name == "look":
            apply_pose(controls, defaults, start + 10, merge({"root": {"rotation": (-1, -7, -3)}, "face": {"rotation": (-2, -8, 0)}, "left_eye": {"location": (-.035, -.03, .045)}, "right_eye": {"location": (-.035, -.03, .045)}}, leaf_changes(controls, 8)))
            apply_pose(controls, defaults, start + 27, merge({"root": {"rotation": (1.5, 8, 3)}, "face": {"rotation": (1, 9, 0)}, "left_eye": {"location": (.04, -.03, -.015)}, "right_eye": {"location": (.04, -.03, -.015)}}, leaf_changes(controls, -9)))
            apply_pose(controls, defaults, start + 38, {"left_eye": {"scale": (1, 1, .12)}, "right_eye": {"scale": (1, 1, .12)}})
        elif name == "tap_reaction":
            apply_pose(controls, defaults, start + 6, merge({"root": {"location": (0, 0, -.12)}, "body": {"scale": (1.10, 1, .86)}, "left_arm": {"rotation": (0, 0, -15)}, "right_arm": {"rotation": (0, 0, 15)}}, leaf_changes(controls, 12)))
            apply_pose(controls, defaults, start + 15, merge({"root": {"location": (0, 0, .34), "rotation": (-3, 0, 4)}, "body": {"scale": (.91, .98, 1.14)}, "left_arm": {"rotation": (-12, 0, 58)}, "right_arm": {"rotation": (-12, 0, -58)}, "mouth": {"scale": (1.18, 1, 1.18)}}, leaf_changes(controls, -18)))
            apply_pose(controls, defaults, start + 27, merge({"root": {"location": (0, 0, -.06), "rotation": (2, 0, -2)}, "body": {"scale": (1.07, 1, .9)}, "left_arm": {"rotation": (0, 0, 25)}, "right_arm": {"rotation": (0, 0, -25)}}, leaf_changes(controls, 9)))
            apply_pose(controls, defaults, start + 35, {"root": {"location": (0, 0, .045)}, "body": {"scale": (.985, 1, 1.025)}})
        elif name == "happy":
            for offset, side in ((10, -1), (26, 1), (42, -1)):
                apply_pose(controls, defaults, start + offset, merge({"root": {"location": (.06 * side, 0, .22), "rotation": (-2, side * 5, side * 7)}, "body": {"scale": (.94, 1, 1.09)}, "left_arm": {"rotation": (0, 0, 54 + side * 10)}, "right_arm": {"rotation": (0, 0, -54 + side * 10)}, "mouth": {"scale": (1.18, 1, 1.2)}}, leaf_changes(controls, side * -14)))
                apply_pose(controls, defaults, start + offset + 7, {"root": {"location": (-.025 * side, 0, -.035)}, "body": {"scale": (1.055, 1, .91)}})
        elif name == "hatch_complete":
            apply_pose(controls, defaults, start, {"root": {"location": (0, 0, -.28)}, "body": {"scale": (.42, .5, .28)}, "left_eye": {"scale": (1, 1, .05)}, "right_eye": {"scale": (1, 1, .05)}})
            apply_pose(controls, defaults, start + 15, merge({"root": {"location": (0, 0, .3)}, "body": {"scale": (.86, .9, 1.22)}, "left_arm": {"rotation": (0, 0, 55)}, "right_arm": {"rotation": (0, 0, -55)}}, leaf_changes(controls, -16)))
            apply_pose(controls, defaults, start + 31, {"root": {"location": (0, 0, -.08)}, "body": {"scale": (1.13, 1, .82)}})
            apply_pose(controls, defaults, start + 46, {"root": {"location": (0, 0, .12)}, "body": {"scale": (.96, 1, 1.08)}})
            apply_pose(controls, defaults, start + 60, {"root": {"location": (0, 0, -.025)}, "body": {"scale": (1.025, 1, .97)}})
        elif name == "walk":
            for offset, side in ((12, -1), (24, 1), (36, -1)):
                apply_pose(controls, defaults, start + offset, merge({"root": {"location": (.045 * side, 0, .11), "rotation": (0, side * 2, side * 4)}, "left_foot": {"location": (0, 0, .12 if side < 0 else 0)}, "right_foot": {"location": (0, 0, .12 if side > 0 else 0)}, "left_arm": {"rotation": (0, 0, side * 22)}, "right_arm": {"rotation": (0, 0, side * 22)}}, leaf_changes(controls, side * -8)))
        elif name == "hover":
            apply_pose(controls, defaults, start + 18, merge({"root": {"location": (-.05, 0, .34), "rotation": (-3, -4, -3)}, "left_arm": {"rotation": (-8, 0, 28)}, "right_arm": {"rotation": (-8, 0, -28)}}, leaf_changes(controls, 12)))
            apply_pose(controls, defaults, start + 36, merge({"root": {"location": (.04, 0, .42), "rotation": (2, 5, 3)}, "body": {"scale": (.98, 1, 1.025)}}, leaf_changes(controls, -12)))
            apply_pose(controls, defaults, start + 54, merge({"root": {"location": (.02, 0, .31), "rotation": (-1, 2, 1)}}, leaf_changes(controls, 6)))
        elif name == "land":
            apply_pose(controls, defaults, start, {"root": {"location": (0, 0, .28)}, "body": {"scale": (.94, 1, 1.08)}})
            apply_pose(controls, defaults, start + 9, merge({"root": {"location": (0, 0, -.09)}, "body": {"scale": (1.14, 1, .79)}, "left_arm": {"rotation": (0, 0, -18)}, "right_arm": {"rotation": (0, 0, 18)}}, leaf_changes(controls, 15)))
            apply_pose(controls, defaults, start + 17, {"root": {"location": (0, 0, .06)}, "body": {"scale": (.97, 1, 1.05)}})
        elif name == "sad":
            apply_pose(controls, defaults, start + 20, merge({"root": {"location": (0, 0, -.09), "rotation": (4, -2, -2)}, "body": {"scale": (1.05, 1, .9)}, "face": {"rotation": (8, 0, 0)}, "left_eye": {"location": (0, 0, -.08)}, "right_eye": {"location": (0, 0, -.08)}, "left_arm": {"rotation": (0, 0, -28)}, "right_arm": {"rotation": (0, 0, 28)}, "mouth": {"scale": (.72, 1, .55)}}, leaf_changes(controls, 15)))
            apply_pose(controls, defaults, start + 48, merge({"root": {"location": (.015, 0, -.11)}, "body": {"scale": (1.06, 1, .88)}}, leaf_changes(controls, 12)))
        elif name == "sleep":
            closed = {"left_eye": {"scale": (1, 1, .06)}, "right_eye": {"scale": (1, 1, .06)}}
            apply_pose(controls, defaults, start + 24, merge({"root": {"location": (0, 0, -.14), "rotation": (5, -2, -6)}, "body": {"scale": (1.06, 1, .88)}, "left_arm": {"rotation": (0, 0, -25)}, "right_arm": {"rotation": (0, 0, 25)}}, closed, leaf_changes(controls, 10)))
            apply_pose(controls, defaults, start + 48, merge({"root": {"location": (0, 0, -.12), "rotation": (4, -2, -5)}, "body": {"scale": (1.025, 1, .93)}}, closed, leaf_changes(controls, 8)))
            apply_pose(controls, defaults, start + 72, merge({"root": {"location": (0, 0, -.14), "rotation": (5, -2, -6)}, "body": {"scale": (1.06, 1, .88)}}, closed, leaf_changes(controls, 10)))
        elif name == "dance":
            for offset, side in ((12, -1), (24, 1), (36, -1), (48, 1), (60, -1)):
                apply_pose(controls, defaults, start + offset, merge({"root": {"location": (.10 * side, 0, .13 if offset % 24 else .02), "rotation": (-2, side * 8, side * 12)}, "body": {"scale": (.96, 1, 1.07)}, "left_arm": {"rotation": (-8, 0, 60 * -side)}, "right_arm": {"rotation": (-8, 0, 60 * -side)}, "mouth": {"scale": (1.15, 1, 1.15)}}, leaf_changes(controls, side * -18)))
        elif name == "sing":
            for offset, amount in ((16, 1.35), (32, .72), (48, 1.5), (64, .82)):
                apply_pose(controls, defaults, start + offset, merge({"root": {"location": (0, 0, .08 if amount > 1 else .01), "rotation": (-2, 0, math.sin(offset) * 3)}, "mouth": {"scale": (amount, 1, amount)}, "left_arm": {"rotation": (-6, 0, 42)}, "right_arm": {"rotation": (-6, 0, -42)}}, leaf_changes(controls, (amount - 1) * -18)))
        elif name == "read":
            down = {"face": {"rotation": (9, 0, 0)}, "left_eye": {"location": (0, 0, -.07)}, "right_eye": {"location": (0, 0, -.07)}, "left_arm": {"rotation": (-18, 0, 38)}, "right_arm": {"rotation": (-18, 0, -38)}}
            apply_pose(controls, defaults, start + 24, merge({"root": {"location": (-.02, 0, -.04), "rotation": (3, -3, -2)}}, down, leaf_changes(controls, 6)))
            apply_pose(controls, defaults, start + 48, merge({"root": {"location": (.015, 0, -.03), "rotation": (2, 3, 2)}, "left_eye": {"location": (-.025, 0, -.07)}, "right_eye": {"location": (-.025, 0, -.07)}}, down, leaf_changes(controls, -5)))
            apply_pose(controls, defaults, start + 72, merge({"root": {"location": (-.01, 0, -.045), "rotation": (3, -2, -1)}}, down, leaf_changes(controls, 4)))
        elif name == "lamp":
            reach = {"root": {"rotation": (-1, 9, 4)}, "face": {"rotation": (-3, 12, 0)}, "left_eye": {"location": (.045, 0, .035)}, "right_eye": {"location": (.045, 0, .035)}, "right_arm": {"rotation": (-18, 0, -72)}}
            apply_pose(controls, defaults, start + 18, merge(reach, leaf_changes(controls, -12)))
            apply_pose(controls, defaults, start + 36, merge({**reach, "right_arm": {"rotation": (-25, 0, -84)}, "body": {"scale": (.98, 1, 1.03)}}, leaf_changes(controls, -16)))
            apply_pose(controls, defaults, start + 54, merge(reach, leaf_changes(controls, -10)))
        elif name == "roll":
            apply_pose(controls, defaults, start + 10, merge({"root": {"location": (-.12, 0, -.09), "rotation": (0, -6, -34)}, "body": {"scale": (1.08, 1, .88)}, "left_arm": {"rotation": (0, 0, -48)}, "right_arm": {"rotation": (0, 0, 48)}}, leaf_changes(controls, 18)))
            apply_pose(controls, defaults, start + 25, merge({"root": {"location": (.02, .08, .06), "rotation": (-9, 18, 32)}, "body": {"scale": (.94, 1, 1.08)}, "left_foot": {"rotation": (0, 0, 42)}, "right_foot": {"rotation": (0, 0, -42)}}, leaf_changes(controls, -22)))
            apply_pose(controls, defaults, start + 42, merge({"root": {"location": (.10, 0, -.05), "rotation": (3, -8, -18)}, "body": {"scale": (1.06, 1, .91)}}, leaf_changes(controls, 12)))

        apply_pose(controls, defaults, end, {})
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
    # Blender 5 stores the generated F-curves inside layered Action slots.
    # keyframe_insert already authors Bezier interpolation, which the glTF
    # exporter samples every frame below; no legacy action.fcurves mutation is
    # needed here (and using it would break Blender 5.2 LTS).
    return clips


def setup_preview() -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"

    def aim(obj: bpy.types.Object, target=(0, 0, 1.45)) -> None:
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()

    bpy.ops.object.light_add(type="AREA", location=(-3.5, -4.5, 6.0))
    key_light = bpy.context.object
    key_light.name = "PreviewKey"
    key_light.data.energy = 700
    key_light.data.shape = "DISK"
    key_light.data.size = 4.0
    aim(key_light)
    bpy.ops.object.light_add(type="AREA", location=(3.2, -3.8, 2.8))
    fill = bpy.context.object
    fill.name = "PreviewFill"
    fill.data.energy = 640
    fill.data.color = (0.72, 0.82, 1.0)
    fill.data.size = 3.0
    aim(fill)
    bpy.ops.object.light_add(type="AREA", location=(0, 2.4, 4.5))
    rim = bpy.context.object
    rim.name = "PreviewRim"
    rim.data.energy = 550
    rim.data.color = (0.74, 0.5, 1.0)
    rim.data.size = 3.0
    aim(rim)

    bpy.ops.object.camera_add(location=(0, -7.4, 2.0))
    camera = bpy.context.object
    camera.name = "PreviewCamera"
    camera.data.lens = 58
    camera.data.sensor_width = 36
    direction = Vector((0, 0, 1.48)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera
    return camera


def export_variant(spec: StageSpec, clips: dict[str, dict]) -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    filepath = MODEL_DIR / f"{spec.variant}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        use_visible=True,
        export_cameras=False,
        export_lights=False,
        export_animations=True,
        export_animation_mode="SCENE",
        export_nla_strips_merged_animation_name="NiumpiPerformance",
        export_force_sampling=True,
        export_frame_step=1,
        export_optimize_animation_size=True,
        export_materials="EXPORT",
        export_extras=True,
        export_yup=True,
    )
    print(f"NIUMPI_EXPORTED {spec.variant} {filepath.stat().st_size}")


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    requested = {value.strip() for value in os.getenv("NIUMPI_VARIANTS", "").split(",") if value.strip()}
    variants = [spec for spec in STAGES if not requested or spec.variant in requested]
    shared_clips = None
    for spec in variants:
        clear_scene()
        controls, defaults = build_creature(spec)
        clips = author_animation(controls, defaults)
        shared_clips = clips
        setup_preview()
        # A lively neutral frame is a more honest QA render than a T-pose.
        preview_frame = clips["happy"]["startFrame"] + 18
        bpy.context.scene.frame_set(preview_frame)
        bpy.context.scene.render.filepath = str(PREVIEW_DIR / f"{spec.variant}.png")
        bpy.ops.render.render(write_still=True)
        export_variant(spec, clips)
        if spec.variant == "stage-5":
            bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_DIR / "niumpi-master.blend"))

    if shared_clips:
        manifest = {
            "version": 1,
            "renderer": "blender-gltf",
            "blenderVersion": bpy.app.version_string,
            "fps": FPS,
            "variants": [spec.variant for spec in STAGES],
            "clips": shared_clips,
        }
        (MODEL_DIR / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"NIUMPI_MANIFEST {MODEL_DIR / 'manifest.json'}")


if __name__ == "__main__":
    main()
