#!/usr/bin/env python3
"""Author deterministic 24 FPS actions on the canonical Niumpi rig."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from variant_clip_contract import SEMANTIC_CLIP_CONTRACT


REPO = Path(__file__).resolve().parents[2]
MASTER = REPO / "art/niumpi/blender/niumpi_master.blend"
FPS = 24

CORE_CLIPS = {
    "idle": (72, True, (0, 72, 0)),
    "blink": (12, False, (2, 6, 4)),
    "look_left": (24, False, (6, 10, 8)),
    "look_right": (24, False, (6, 10, 8)),
    "tap_reaction": (40, False, (8, 18, 14)),
    "happy": (56, False, (8, 34, 14)),
    "eat": (84, False, (12, 58, 14)),
    "hatch_complete": (84, False, (20, 48, 16)),
}

SEMANTIC_CLIPS = {
    name: (int(spec["frameCount"]), bool(spec["loop"]), tuple(spec["transition"]))
    for name, spec in SEMANTIC_CLIP_CONTRACT.items()
}

# The semantic repertoire is currently authored and gated only for the baby.
# Later anatomies keep their already-published core masters unchanged until
# their own explicit retargeting phase.
CLIPS = {**CORE_CLIPS, **SEMANTIC_CLIPS}

SEMANTIC_PLAYBACK = {
    "sad": (4, 6, 18),
    "travel": (4, 6, 7),
    "sleep": (8, 8, 12),
    "read": (6, 8, 34),
    "lamp": (4, 6, 18),
    "dance": (4, 6, 24),
    "sing": (4, 8, 56),
    "roll": (4, 8, 8),
    "cozy": (6, 8, 36),
}

CONTROL_DEFAULTS = {
    "blink": 0.0,
    "mouth_open": 0.0,
    "cheek_puff": 0.0,
    "body_squash": 0.0,
    "body_stretch": 0.0,
}


def reset_pose(rig):
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0, 0, 0)
        bone.scale = (1, 1, 1)
    for prop, value in CONTROL_DEFAULTS.items():
        rig[prop] = value


def bone_key(rig, name: str, frame: int, *, x=None, z=None, rot=None, sx=None, sy=None, sz=None):
    bone = rig.pose.bones[name]
    if rot is not None and name in {"arm.L", "arm.R"}:
        rot *= 0.55 if rig.get("variant", "baby") == "baby" else 0.35
    if rot is not None and (name in {"leaf_stem_01", "leaf_stem_02", "leaf"} or name.startswith("leaf.")):
        rot *= 0.35
    if x is not None:
        bone.location.x = x
    if z is not None:
        # Every authored deform bone points along local Y in Blender.  The
        # sprite itself lies in world X/Z, so local Z is camera depth and was
        # effectively invisible.  Keep ``z`` as the animation-facing vertical
        # API, but write it to the bone's local Y axis so hops, gaze and
        # secondary overlap are real rendered motion.
        bone.location.y = z
    if rot is not None:
        # The armature bones lie in world X/Z and their local Y follows the
        # bone length.  Local-Y rotation twists the flat artwork edge-on toward
        # the camera (the old dark "arm line" / rectangular leaf artifact).
        # Local Z is the bone-normal axis, so it produces the intended 2D
        # in-plane swing without changing the sprite's apparent thickness.
        bone.rotation_euler.z = math.radians(rot)
    if sx is not None:
        bone.scale.x = sx
    if sy is not None:
        bone.scale.y = sy
    if sz is not None:
        bone.scale.z = sz
    bone.keyframe_insert("location", frame=frame, group=name)
    bone.keyframe_insert("rotation_euler", frame=frame, group=name)
    bone.keyframe_insert("scale", frame=frame, group=name)


def prop_key(rig, prop: str, frame: int, value: float):
    rig[prop] = value
    rig.keyframe_insert(data_path=f'["{prop}"]', frame=frame, group="controls")


def pose(rig, frame: int, bones=None, props=None):
    authored = bones or {}
    for name, values in authored.items():
        if name in rig.pose.bones:
            bone_key(rig, name, frame, **values)
    # Retarget the canonical leaf follow-through onto every independently
    # layered crown leaf.  Alternating signs keep multi-leaf silhouettes from
    # moving as one rigid fan while retaining the baby choreography timing.
    secondary = json.loads(rig.get("secondary_leaf_bones", "[]"))
    leaf_value = authored.get("leaf_stem_02") or authored.get("leaf")
    if leaf_value and leaf_value.get("rot") is not None:
        for index, pair in enumerate(secondary):
            sign = -1.0 if index % 2 else 1.0
            scale = max(0.45, 0.82 - index * 0.08)
            bone_key(rig, pair[0], frame, rot=leaf_value["rot"] * sign * scale * 0.58)
            bone_key(rig, pair[1], frame, rot=leaf_value["rot"] * sign * scale)
    # Explicit decorative regions inherit the body/root choreography and add
    # only a very small authored follow-through. The shared continuous mesh
    # keeps this local motion attached; Mistwander's legacy water tail declares
    # a zero factor and therefore never opens a disconnected gap.
    if leaf_value and leaf_value.get("rot") is not None:
        for item in json.loads(rig.get("accessory_specs", "[]")):
            factor = float(item.get("motionFactor", 0.0))
            if factor and item.get("bone") in rig.pose.bones:
                bone_key(
                    rig, item["bone"], frame,
                    rot=leaf_value["rot"] * factor * float(item.get("motionSign", 1.0)),
                )
    for prop, value in (props or {}).items():
        prop_key(rig, prop, frame, value)


def idle(rig):
    # Closed loop, delayed leaf chain and asymmetric arm drift make the local
    # motion legible even when the root stays fixed.
    keys = [
        (1, 0.00, 0.0, 0, 0, 0, 0),
        (12, 0.045, 1.0, -4.5, 2.8, 5.0, 7.0),
        (24, 0.080, 1.7, -6.5, 4.0, 7.5, 12.0),
        (36, 0.030, 0.5, -2.8, 1.8, 3.0, 4.0),
        (48, -0.035, -1.2, 5.0, -3.0, -6.5, -9.0),
        (60, -0.060, -1.6, 6.5, -4.0, -8.0, -12.5),
        (72, 0.00, 0.0, 0, 0, 0, 0),
    ]
    for frame, lift, head, arm_l, arm_r, leaf1, leaf2 in keys:
        pose(rig, frame, {
            "body_squash": {"z": lift * 0.35, "rot": head * 0.20},
            "head": {"z": lift, "rot": head},
            # Stage-1 has no separate arms.  The side lobes remain welded to
            # the cloud; the hop, face and leaf carry the reaction.
            "arm.L": {"rot": 0}, "arm.R": {"rot": 0},
            "foot.L": {"sx": 1.0 - abs(lift) * 0.22, "sy": 1.0 + abs(lift) * 0.28},
            "foot.R": {"sx": 1.0 - abs(lift) * 0.18, "sy": 1.0 + abs(lift) * 0.24},
            "pupil.L": {"x": head * 0.022, "z": lift * 0.16},
            "pupil.R": {"x": head * 0.020, "z": lift * 0.13},
            "leaf_stem_01": {"rot": leaf1}, "leaf_stem_02": {"rot": leaf2},
            "leaf": {"rot": leaf2 * 0.65}, "shadow": {"sx": 1.0 - lift * 0.18},
        }, {"body_stretch": min(0.16, abs(lift) * 2.2)})
    for frame, value in ((1, 0), (28, 0), (30, 0.25), (32, 0), (72, 0)):
        prop_key(rig, "blink", frame, value)


def blink(rig):
    sequence = ((1, 0, 0), (2, 0.06, 0.004), (3, 0.52, 0.018), (4, 1, 0.035),
                (5, 0.91, 0.030), (6, 1, 0.042), (7, 0.84, 0.028),
                (8, 0.55, 0.019), (9, 0.24, 0.010), (10, 0.09, 0.005),
                (11, 0.025, 0.002), (12, 0, 0))
    for frame, amount, squash in sequence:
        pose(rig, frame, {
            # Closure lives in the eyes/cheeks/leaf.  Translating or squashing
            # the painted head against the torso opens the same alpha seam that
            # dark QA guards against, so the silhouette remains contiguous.
            "head": {"z": 0.0, "rot": 0.0},
            "cheek.L": {"z": amount * 0.01}, "cheek.R": {"z": amount * 0.01},
            "leaf_stem_02": {"rot": amount * 1.2 + frame * 0.035},
        }, {"blink": amount, "body_squash": 0.0})


def look(rig, direction: int):
    # Eyes lead the thought, head follows, leaf settles last.
    for frame, gaze, head, leaf in ((1, 0, 0, 0), (4, 0.075, 0, 0), (8, 0.085, 2.5, 1), (13, 0.085, 4.3, 3.8), (17, 0.055, 2.0, 5.0), (21, 0.012, 0.5, 2), (24, 0, 0, 0)):
        pose(rig, frame, {
            "pupil.L": {"x": direction * gaze, "z": 0.018 if frame in (8, 13) else 0},
            "pupil.R": {"x": direction * gaze, "z": 0.018 if frame in (8, 13) else 0},
            "head": {"rot": direction * head, "x": direction * head * 0.006},
            "body_squash": {"rot": direction * head * 0.18},
            "arm.L": {"rot": 0},
            "arm.R": {"rot": 0},
            "leaf_stem_01": {"rot": direction * leaf * 0.55},
            "leaf_stem_02": {"rot": direction * leaf},
            "leaf": {"rot": direction * leaf * 0.75},
        })


def tap_reaction(rig):
    poses = [
        # frame, lift, horizontal/vertical body scale, arm L/R, leaf lag, blink
        (1, 0.00, 1.00, 1.00, 0, 0, 0, 0.00),
        (5, -0.025, 1.04, 0.96, 12, -10, -3, 0.08),
        (9, -0.105, 1.10, 0.89, 30, -27, -8, 0.42),
        (12, -0.045, 1.03, 0.98, 8, -6, -12, 0.10),
        (15, 0.24, 0.95, 1.07, -48, 44, 9, 0.00),
        (20, 0.46, 0.93, 1.10, -66, 61, 20, 0.00),
        (24, 0.38, 0.96, 1.06, -54, 49, 24, 0.00),
        (29, 0.10, 1.00, 1.00, -20, 18, -11, 0.06),
        (32, -0.085, 1.11, 0.88, 17, -15, -16, 0.28),
        (35, 0.035, 0.97, 1.04, -9, 8, 8, 0.05),
        (38, -0.012, 1.02, 0.98, 4, -4, -4, 0.02),
        (40, 0.00, 1.00, 1.00, 0, 0, 0, 0.00),
    ]
    for frame, lift, scale_x, scale_y, arm_l, arm_r, leaf, blink_value in poses:
        airborne = max(0.0, lift)
        squash = max(0.0, scale_x - 1.0)
        pose(rig, frame, {
            "root": {"z": lift},
            "body": {"sx": scale_x, "sy": scale_y},
            "body_squash": {"rot": arm_l * 0.045},
            "head": {"rot": -arm_r * 0.045},
            "arm.L": {"rot": 0}, "arm.R": {"rot": 0},
            "foot.L": {"sx": 1.0 - squash * 0.65 + airborne * 0.06, "sy": 1.0 + squash * 0.85 - airborne * 0.05},
            "foot.R": {"sx": 1.0 - squash * 0.55 + airborne * 0.05, "sy": 1.0 + squash * 0.75 - airborne * 0.04},
            "pupil.L": {"z": 0.055 if 15 <= frame <= 24 else -0.018 if frame == 9 else 0},
            "pupil.R": {"z": 0.052 if 15 <= frame <= 24 else -0.018 if frame == 9 else 0},
            "leaf_stem_01": {"rot": leaf * 0.35}, "leaf_stem_02": {"rot": leaf},
            "leaf": {"rot": leaf * 1.25}, "shadow": {"sx": 1 - airborne * 0.82},
        }, {"body_squash": min(0.72, squash * 5.4), "body_stretch": min(0.65, max(0, scale_y - 1) * 6),
            "blink": blink_value, "mouth_open": min(0.9, airborne * 2.2),
            "cheek_puff": min(1, airborne * 2.4)})


def happy(rig):
    sequence = [
        # Two asymmetrical hops with a readable crouch, airborne hold and land.
        (1, 0.00, 1.00, 1.00, 0, 0, 0),
        (6, -0.10, 1.11, 0.89, 28, -22, -8),
        (10, -0.035, 1.02, 0.99, 6, -5, -14),
        (14, 0.30, 0.95, 1.07, -57, 42, 12),
        (20, 0.52, 0.92, 1.11, -85, 35, 24),
        (25, 0.35, 0.95, 1.07, -72, 54, 28),
        (30, -0.075, 1.10, 0.90, 22, -17, -18),
        (34, 0.08, 0.98, 1.03, -26, 34, 7),
        (39, 0.39, 0.94, 1.09, -35, 85, 22),
        (44, 0.24, 0.97, 1.05, -52, 74, 25),
        (48, -0.06, 1.09, 0.91, 18, -14, -15),
        (52, 0.025, 0.98, 1.02, -8, 10, 7),
        (56, 0.00, 1.00, 1.00, 0, 0, 0),
    ]
    for frame, lift, scale_x, scale_y, arm_l, arm_r, leaf in sequence:
        airborne = max(0.0, lift)
        squash = max(0.0, scale_x - 1.0)
        pose(rig, frame, {
            "root": {"z": lift}, "body": {"sx": scale_x, "sy": scale_y},
            "body_squash": {"rot": (arm_l + arm_r) * 0.065},
            "head": {"rot": (arm_r - arm_l) * 0.045},
            "arm.L": {"rot": 0}, "arm.R": {"rot": 0},
            "foot.L": {"sx": 1.0 - squash * 0.70 + airborne * 0.07, "sy": 1.0 + squash * 0.90 - airborne * 0.06},
            "foot.R": {"sx": 1.0 - squash * 0.60 + airborne * 0.06, "sy": 1.0 + squash * 0.80 - airborne * 0.05},
            "pupil.L": {"z": min(0.06, airborne * 0.17), "x": -0.018 if 34 <= frame <= 44 else 0},
            "pupil.R": {"z": min(0.06, airborne * 0.16), "x": 0.016 if 34 <= frame <= 44 else 0},
            "leaf_stem_01": {"rot": leaf * 0.16}, "leaf_stem_02": {"rot": leaf * 0.42},
            "leaf": {"rot": leaf * 0.60}, "shadow": {"sx": 1 - airborne * 0.88},
        }, {"body_squash": min(0.75, squash * 5.5), "body_stretch": min(0.7, max(0, scale_y - 1) * 6),
            "mouth_open": min(1, airborne * 3.0), "cheek_puff": min(1, airborne * 2.6)})
    for frame, amount in ((1, 0), (15, 0), (17, 1), (20, 0.12), (23, 0), (35, 0), (37, 0.85), (40, 0), (56, 0)):
        prop_key(rig, "blink", frame, amount)


def eat(rig):
    # Notice -> lean -> exactly three bite cycles -> swallow -> warm recovery.
    # The legacy baby rig predates the continuous-mesh variant rigs and its
    # pupil bones use the opposite local X basis.  Keep the choreography
    # semantic (look toward the food on screen) while adapting only that
    # legacy basis; later variants already project the canonical negative X
    # gaze toward the food side.
    gaze_basis = 1.0 if str(rig.get("variant", "baby")) == "baby" else -1.0
    keyframes = [
        (1, 0.00, 0.00, 0, 0, 0, 0.00),
        (7, 0.015, -3, 12, -14, 0, 0.00),
        (14, 0.045, -8, 35, -40, 0, 0.00),
        (22, 0.065, -12, 56, -63, 0, 0.00),
        (29, 0.045, -10, 64, -70, 0, 0.00),
        # Three unmistakable open/close cycles around the runtime bite events.
        (32, 0.015, -9, 58, -64, 0, 0.08), (34, -0.055, -7, 62, -68, 1, 0.48),
        (37, 0.035, -10, 66, -72, 0, 0.12),
        (46, 0.015, -9, 76, -53, 0, 0.10), (48, -0.060, -7, 82, -58, 1, 0.52),
        (51, 0.040, -10, 67, -73, 0, 0.14),
        (60, 0.012, -8, 51, -78, 0, 0.12), (62, -0.065, -6, 56, -84, 1, 0.58),
        (65, 0.045, -9, 64, -70, 0, 0.16),
        (71, -0.085, -4, 48, -52, 0, 0.66),
        (75, 0.045, -2, 28, -31, 0, 0.18),
        (80, 0.012, -1, 10, -12, 0, 0.05),
        (84, 0.00, 0.00, 0, 0, 0, 0.00),
    ]
    for frame, z, head, arm_l, arm_r, mouth, squash in keyframes:
        gaze_x = 0.0 if frame in (1, 84) else gaze_basis * (0.055 if frame < 72 else 0.018)
        gaze_z = -0.025 if mouth else -0.012 if 1 < frame < 72 else 0.0
        lobe_lift_l = min(0.18, abs(arm_l) / 82.0 * 0.18)
        lobe_lift_r = min(0.18, abs(arm_r) / 82.0 * 0.18)
        pose(rig, frame, {
            # Lean the complete silhouette for food anticipation.  Moving the
            # head alone opens the painted head/body fold into a one-pixel
            # alpha seam on dark backgrounds; root motion preserves the same
            # readable lean while arms, eyes, mouth and leaf remain local.
            "root": {"z": z, "rot": head * 0.52, "x": -abs(head) * 0.010},
            # A small whole-body squash is keyed on the actual body bone.  It
            # keeps every child layer contiguous while providing measurable,
            # local anticipation at each bite (Gate A body feature).
            "body": {"sx": 1.0 + squash * 0.10, "sy": 1.0 - squash * 0.12},
            "body_squash": {"z": 0.0, "rot": 0.0},
            "head": {"z": 0.0, "rot": 0.0},
            "arm.L": {"z": lobe_lift_l * 0.22, "rot": arm_l * 0.08},
            "arm.R": {"z": lobe_lift_r * 0.22, "rot": arm_r * 0.08},
            "foot.L": {"sx": 1.0 - squash * 0.12, "sy": 1.0 + squash * 0.18},
            "foot.R": {"sx": 1.0 - squash * 0.10, "sy": 1.0 + squash * 0.16},
            "pupil.L": {"x": gaze_x, "z": gaze_z},
            "pupil.R": {"x": gaze_x, "z": gaze_z},
            # Bone-local Y follows the mouth's vertical axis in the X/Z sprite
            # plane, so it is the visible height scale (local Z is depth).
            "mouth": {"sx": 1.0 + mouth * 0.12, "sy": 1.0 + mouth * 0.32},
            "leaf_stem_01": {"rot": -head * 0.45}, "leaf_stem_02": {"rot": -head * 0.8},
            "leaf": {"rot": -head * 0.6}, "shadow": {"sx": 1.0 + squash * 0.08},
        }, {"mouth_open": mouth, "body_squash": squash, "cheek_puff": 0.7 if mouth else 0.15 if frame > 70 else 0})
    for frame, amount in ((1, 0), (72, 0), (75, 1), (78, 0), (84, 0)):
        prop_key(rig, "blink", frame, amount)


def hatch_complete(rig):
    sequence = [
        # frame, lift, overall scale, squash control, blink, arms, leaf
        (1, -0.20, 0.72, 0.58, 1.00, 24, -21, -15),
        (10, -0.18, 0.72, 0.55, 1.00, 20, -18, -13),
        (18, -0.14, 0.76, 0.45, 1.00, 15, -13, -10),
        (23, -0.10, 0.82, 0.30, 0.82, 8, -7, -6),
        (28, 0.10, 0.97, 0.08, 0.18, -31, 28, 11),
        (34, 0.48, 1.08, 0.00, 0.00, -67, 61, 24),
        (40, 0.38, 1.04, 0.00, 0.00, -55, 50, 28),
        (48, -0.09, 0.94, 0.64, 0.00, 25, -21, -20),
        (55, 0.12, 1.03, 0.04, 0.00, -31, 29, 12),
        (63, -0.045, 0.98, 0.26, 0.00, 11, -10, -9),
        (70, 0.035, 1.01, 0.04, 0.00, -7, 7, 6),
        (77, -0.012, 0.995, 0.08, 0.00, 3, -3, -3),
        (84, 0.00, 1.00, 0.00, 0.00, 0, 0, 0),
    ]
    for frame, lift, overall_scale, squash, blink_amount, arm_l, arm_r, leaf in sequence:
        pose(rig, frame, {
            "root": {"z": lift, "sx": overall_scale, "sy": overall_scale},
            "body": {"sx": 1.0 + squash * 0.08, "sy": 1.0 - squash * 0.10},
            "body_squash": {"rot": (arm_l + arm_r) * 0.04},
            "head": {"rot": (arm_r - arm_l) * 0.05},
            "arm.L": {"rot": 0}, "arm.R": {"rot": 0},
            "foot.L": {"sx": 1.0 - squash * 0.12 + max(lift, 0) * 0.05, "sy": 1.0 + squash * 0.18},
            "foot.R": {"sx": 1.0 - squash * 0.10 + max(lift, 0) * 0.04, "sy": 1.0 + squash * 0.16},
            "pupil.L": {"z": min(0.06, max(lift, 0) * 0.16)}, "pupil.R": {"z": min(0.06, max(lift, 0) * 0.15)},
            "leaf_stem_01": {"rot": leaf * 0.35}, "leaf_stem_02": {"rot": leaf},
            "leaf": {"rot": leaf * 1.15}, "shadow": {"sx": 1 - max(lift, 0) * 0.7},
        }, {"body_squash": squash, "blink": blink_amount, "mouth_open": max(0, lift) * 2.8, "cheek_puff": max(0, lift) * 1.8})


def sad(rig):
    """Weight drains down, one sigh expands, then a restrained recovery."""

    keys = [
        # frame, root z, body sx/sy, head z/rot, gaze z, side L/R, leaf, mouth, cheeks
        (1, 0.00, 1.00, 1.00, 0.00, 0, 0.00, 0, 0, 0, 1.00, 0.00),
        (4, -0.01, 1.00, 1.00, -0.02, 0, -0.05, 2, -2, -2, 0.96, 0.00),
        (7, -0.08, 1.03, 0.95, -0.10, -5, -0.075, 12, -10, -13, 0.88, 0.04),
        (13, -0.14, 1.05, 0.92, -0.16, -8, -0.085, 20, -17, -22, 0.80, 0.00),
        (19, -0.20, 1.08, 0.90, -0.21, -10, -0.105, 25, -21, -34, 0.72, 0.08),
        (25, -0.22, 1.05, 0.87, -0.23, -12, -0.110, 28, -23, -38, 0.70, 0.00),
        (31, -0.15, 1.05, 0.91, -0.18, -9, -0.080, 22, -18, -31, 0.79, 0.00),
        (37, -0.10, 1.03, 0.95, -0.12, -5, -0.040, 14, -11, -26, 0.86, 0.03),
        (43, -0.045, 1.01, 0.98, -0.055, -2, -0.015, 6, -5, -14, 0.93, 0.00),
        (48, 0.00, 1.00, 1.00, 0.00, 0, 0.00, 0, 0, 0, 1.00, 0.00),
    ]
    for frame, root_z, sx, sy, head_z, head_rot, gaze_z, side_l, side_r, leaf, mouth_sy, puff in keys:
        sadness = min(1.0, abs(root_z) / 0.20)
        closure = 0.46 * sadness if frame <= 31 else 0.24 * sadness
        pose(rig, frame, {
            "root": {"z": root_z},
            # The torso drains independently of the root.  This remains
            # visible after root-affine alignment and gives the sad pose real
            # weight instead of merely translating the whole character.
            "body": {
                "sx": 1.0 + (sx - 1.0) * 0.44,
                "sy": 1.0 + (sy - 1.0) * 0.44,
                "z": -abs(root_z) * 0.18,
                "x": -sadness * 0.02,
            },
            "body_squash": {"rot": head_rot * 0.06, "x": sadness * 0.02},
            "head": {"z": head_z * 0.34, "rot": head_rot * 0.34, "x": sadness * 0.02},
            # On stage-1 these are existing fluffy side lobes, not invented hands.
            "arm.L": {"rot": 0, "z": 0},
            "arm.R": {"rot": 0, "z": 0},
            "foot.L": {"sx": 1.0 + sadness * 0.025, "sy": 1.0 - sadness * 0.018},
            "foot.R": {"sx": 1.0 - sadness * 0.018, "sy": 1.0 + sadness * 0.022},
            "pupil.L": {"z": gaze_z - sadness * 0.018, "x": -0.042 if frame < 37 else 0.012},
            "pupil.R": {"z": gaze_z - sadness * 0.016, "x": -0.036 if frame < 37 else 0.010},
            # The approved baby mouth is a gentle upward curve. Rotating that
            # same layer (rather than inventing new art) creates a restrained
            # frown; the sigh briefly opens without becoming a happy grin.
            "mouth": {"rot": 168 * sadness, "sy": mouth_sy * (1.0 - sadness * 0.35), "sx": 0.75 + (1.0 - sadness) * 0.25, "z": -0.035 * sadness},
            "cheek.L": {"x": -puff * 0.025, "z": -abs(root_z) * 0.08},
            "cheek.R": {"x": puff * 0.025, "z": -abs(root_z) * 0.08},
            "leaf_stem_01": {"rot": leaf * 0.12},
            "leaf_stem_02": {"rot": leaf * 0.34},
            "leaf": {"rot": leaf * 0.48},
            "shadow": {"sx": 1.85 + abs(root_z) * 0.30, "sy": 0.45, "z": -0.16},
        }, {"mouth_open": 0.12 if frame == 19 else 0.0, "blink": closure, "cheek_puff": puff, "body_squash": min(0.22, abs(root_z) * 0.9)})


def travel(rig):
    """Three contact pulses, a distinct airborne apex, land and settle."""

    keys = [
        # frame, root x/z, body sx/sy, head, foot L/R lift, leaf, gaze
        (1, 0.00, 0.00, 1.00, 1.00, 0, 0.00, 0.00, 0, 0.00),
        (5, -0.08, -0.08, 1.10, 0.90, -5, 0.00, 0.02, -10, 0.05),
        (9, -0.12, -0.13, 1.17, 0.83, -8, 0.01, 0.05, -18, 0.075),
        (15, 0.08, 0.15, 0.94, 1.09, 7, 0.16, 0.02, -18, 0.080),
        (21, -0.02, -0.02, 1.11, 0.89, -5, 0.01, 0.15, -21, 0.080),
        (27, 0.11, 0.18, 0.93, 1.10, 8, 0.15, 0.02, -28, 0.080),
        (33, 0.00, -0.03, 1.12, 0.88, -6, 0.02, 0.14, -25, 0.078),
        (39, 0.14, 0.18, 0.92, 1.11, 9, 0.13, 0.04, -30, 0.080),
        (45, 0.18, 0.35, 0.88, 1.17, 10, 0.16, 0.15, -40, 0.070),
        (51, 0.20, 0.47, 0.86, 1.20, 7, 0.18, 0.17, -52, 0.065),
        (56, 0.18, 0.39, 0.90, 1.15, 4, 0.15, 0.14, -58, 0.060),
        (57, 0.12, -0.12, 1.18, 0.82, -4, 0.00, 0.00, -32, 0.055),
        (61, 0.08, 0.08, 0.94, 1.08, 3, 0.06, 0.04, 18, 0.048),
        (67, 0.03, -0.025, 1.04, 0.96, -1, 0.01, 0.00, -8, 0.030),
        (72, 0.00, 0.00, 1.00, 1.00, 0, 0.00, 0.00, 0, 0.020),
    ]
    for frame, root_x, root_z, sx, sy, head, foot_l, foot_r, leaf, gaze in keys:
        airborne = max(0.0, root_z)
        contact = sx - 1.0
        step = min(0.22, max(abs(foot_l), abs(foot_r), airborne * 0.42, abs(contact) * 0.75))
        pose(rig, frame, {
            "root": {"x": root_x, "z": root_z},
            # A local torso offset makes each compression a real contact beat
            # after scene/root travel is removed.  It also keeps the airborne
            # crown inside the fixed canvas instead of raising the whole rig.
            "body": {
                "sx": 1.0 + contact * 0.44,
                "sy": 1.0 + (sy - 1.0) * 0.44,
                "z": -abs(contact) * 0.16,
                "x": contact * 0.12,
            },
            "body_squash": {"rot": -head * 0.10, "x": -contact * 0.08},
            "head": {"rot": head * 0.28, "x": gaze * 0.20 - contact * 0.08},
            "arm.L": {"rot": 0, "z": 0},
            "arm.R": {"rot": 0, "z": 0},
            # Foot bones are nearly horizontal: local X is the visible lift
            # axis and local Y points outward.  Move up and inward so a contact
            # pulse remains attached to the body instead of sliding sideways.
            "foot.L": {"x": -step * 0.08, "z": -step * 0.04, "sx": 1.0, "sy": 1.0},
            "foot.R": {"x": step * 0.08, "z": -step * 0.04, "sx": 1.0, "sy": 1.0},
            "pupil.L": {"x": gaze, "z": 0.018 if airborne else 0},
            "pupil.R": {"x": gaze, "z": 0.016 if airborne else 0},
            "leaf_stem_01": {"rot": leaf * 0.12},
            "leaf_stem_02": {"rot": leaf * 0.32},
            "leaf": {"rot": leaf * 0.46},
            "shadow": {
                "x": root_x * 0.35,
                "sx": max(0.52, 1.0 - airborne * 0.72),
                "sy": 1.0,
            },
        }, {"body_squash": min(0.24, max(0.0, sx - 1.0) * 1.5), "body_stretch": min(0.24, max(0.0, sy - 1.0) * 1.4), "mouth_open": min(0.55, airborne * 0.65), "cheek_puff": min(0.7, airborne * 0.70)})


def sleep(rig):
    """Tuck, an exactly matching 80-frame breathing sub-loop, then wake."""

    keys = [
        # Frames 17 and 96 are intentionally identical: zero-based [16,96).
        (1, 0.00, 1.00, 1.00, 0.00, 0, 0, 0.0, 0.00),
        (5, -0.08, 1.04, 0.96, -0.05, -3, -8, 0.25, 0.10),
        (9, -0.18, 1.08, 0.92, -0.11, -5, -14, 0.72, 0.22),
        (13, -0.28, 1.11, 0.89, -0.17, -7, -20, 1.00, 0.38),
        (17, -0.30, 1.10, 0.90, -0.18, -7, -22, 1.00, 0.42),
        (29, -0.23, 1.06, 0.95, -0.13, -5, -16, 1.00, 0.30),
        (37, -0.20, 1.04, 0.97, -0.10, -4, -13, 1.00, 0.24),
        (45, -0.22, 1.06, 0.95, -0.12, -5, -15, 1.00, 0.28),
        (57, -0.29, 1.10, 0.91, -0.17, -7, -21, 1.00, 0.40),
        (69, -0.30, 1.11, 0.90, -0.18, -7, -23, 1.00, 0.43),
        (81, -0.25, 1.07, 0.94, -0.14, -6, -18, 1.00, 0.34),
        (89, -0.27, 1.09, 0.92, -0.16, -6, -20, 1.00, 0.38),
        (96, -0.30, 1.10, 0.90, -0.18, -7, -22, 1.00, 0.42),
        (97, -0.27, 1.09, 0.91, -0.15, -6, -19, 0.90, 0.36),
        (101, -0.17, 1.06, 0.95, -0.09, -3, -12, 0.58, 0.22),
        (106, -0.06, 1.02, 0.98, -0.02, 1, -6, 0.15, 0.08),
        (112, 0.00, 1.00, 1.00, 0.00, 0, 0, 0.00, 0.00),
    ]
    for frame, root_z, sx, sy, head_z, head_rot, leaf, closure, tuck in keys:
        pose(rig, frame, {
            "root": {"z": root_z},
            # Preserve a breathing torso arc inside the exact 80-frame loop;
            # root-only bobbing disappears under scene alignment.
            "body": {
                "sx": 1.0 + (sx - 1.0) * 0.42,
                "sy": 1.0 + (sy - 1.0) * 0.42,
                "z": -tuck * 0.16,
                "x": -tuck * 0.025,
            },
            "body_squash": {"rot": -tuck * 0.8, "x": tuck * 0.02},
            "head": {"z": head_z * 0.30, "rot": head_rot * 0.30, "x": tuck * 0.02},
            "arm.L": {"rot": 0, "z": 0},
            "arm.R": {"rot": 0, "z": 0},
            # Baby feet are almost horizontal: local X lifts, local Y folds
            # inward.  Tuck them under the sleeping body while keeping both
            # pearl lobes continuously attached.
            "foot.L": {"x": 0, "z": 0, "sx": 1.0 - tuck * 0.018, "sy": 1.0 + tuck * 0.024},
            "foot.R": {"x": 0, "z": 0, "sx": 1.0 + tuck * 0.020, "sy": 1.0 - tuck * 0.016},
            "pupil.L": {"x": 0, "z": -0.012 * tuck},
            "pupil.R": {"x": 0, "z": -0.010 * tuck},
            "mouth": {"sx": 1.0 - closure * 0.35, "sy": max(0.08, 1.0 - closure * 0.92), "z": -tuck * 0.012},
            "leaf_stem_01": {"rot": leaf * 0.10},
            "leaf_stem_02": {"rot": leaf * 0.28},
            "leaf": {"rot": leaf * 0.42},
            "shadow": {"sx": 1.25 + tuck * 0.10, "sy": 0.72, "z": -0.04},
        }, {"blink": closure, "body_squash": min(0.20, tuck * 0.45), "cheek_puff": tuck * 0.18})


def read(rig):
    """Presentation-owned book with three real gaze passes and one page turn."""

    keys = [
        (1, 0.00, 0, 0.00, 0.00, 0, 0, 0, 0.0, 0.0),
        (7, -0.02, -4, 0.035, -0.025, 7, -5, -7, 0.0, 0.0),
        (11, -0.06, -8, 0.055, -0.045, 16, -12, -13, 0.08, 0.10),
        (13, -0.09, -10, 0.065, -0.055, 23, -17, -18, 0.12, 0.16),
        (25, -0.08, -9, -0.070, -0.045, 25, -18, -14, 0.06, 0.12),
        (35, -0.075, -8, 0.075, -0.042, 22, -16, -11, 0.04, 0.10),
        (41, -0.02, -2, -0.015, 0.005, -8, 18, 20, 0.22, 0.28),
        (47, -0.08, -8, -0.065, -0.040, 20, -15, -13, 0.04, 0.10),
        (53, -0.075, -7, 0.072, -0.038, 18, -13, -10, 0.03, 0.08),
        (57, 0.02, 3, 0.00, 0.035, -12, 10, 15, 0.70, 0.62),
        (69, -0.04, -4, 0.025, -0.020, 9, -7, -9, 0.08, 0.12),
        (77, -0.015, -1, 0.010, -0.006, 3, -2, -4, 0.02, 0.03),
        (84, 0.00, 0, 0.00, 0.00, 0, 0, 0, 0.0, 0.0),
    ]
    for frame, root_z, head, gaze_x, gaze_z, side_l, side_r, leaf, mouth, puff in keys:
        page_beat = 0.025 if frame in (41, 57) else 0.0
        pose(rig, frame, {
            "root": {"z": root_z, "x": 0.03 if 10 <= frame <= 68 else 0},
            "body": {"sx": 1.0 + abs(root_z) * 0.16, "sy": 1.0 - abs(root_z) * 0.12, "z": -abs(root_z) * 0.12, "x": -gaze_x * 0.12},
            "body_squash": {"rot": head * 0.05, "z": abs(root_z) * 0.08, "x": gaze_x * 0.08},
            # The book is presentation-owned, but the character still needs a
            # readable inspection arc.  A local head translation prevents the
            # three passes from collapsing into a globally aligned body lean.
            "head": {"rot": head * 0.32, "x": gaze_x * 0.72, "z": root_z * 0.28 + gaze_z * 0.42},
            "arm.L": {"rot": 0, "z": 0},
            "arm.R": {"rot": 0, "z": 0},
            "foot.L": {"x": -page_beat, "z": -page_beat * 0.25, "sx": 1.0, "sy": 1.0},
            "foot.R": {"x": page_beat, "z": -page_beat * 0.25, "sx": 1.0, "sy": 1.0},
            # Move the full eye carrier a little and the iris inside it.  This
            # creates a readable three-pass scan without letting the baked
            # pupils escape the eye artwork.
            "eye.L": {"x": gaze_x * 0.18, "z": gaze_z * 0.16},
            "eye.R": {"x": gaze_x * 0.16, "z": gaze_z * 0.14},
            "pupil.L": {"x": gaze_x * 1.30, "z": gaze_z * 1.18},
            "pupil.R": {"x": gaze_x * 1.20, "z": gaze_z * 1.10},
            "mouth": {"sx": 1.0 + mouth * 0.15, "sy": 1.0 + mouth * 0.25},
            "leaf_stem_01": {"rot": leaf * 0.12},
            "leaf_stem_02": {"rot": leaf * 0.34},
            "leaf": {"rot": leaf * 0.48},
        }, {"mouth_open": mouth, "cheek_puff": puff, "body_squash": min(0.16, abs(root_z) * 1.2)})


def lamp(rig):
    """Eyes notice, the side-body reaches once, glow reaction, release."""

    keys = [
        (1, 0.00, 0.00, 0, 0.00, 0, 0, 0, 0.0),
        (5, -0.02, -0.04, 4, 0.055, 5, -3, -5, 0.0),
        (9, -0.04, -0.10, 9, 0.080, 13, -8, -12, 0.05),
        (15, -0.08, -0.18, 14, 0.090, 26, -13, -18, 0.10),
        (19, -0.12, -0.24, 18, 0.095, 38, -16, -24, 0.18),
        (21, 0.02, -0.13, 11, 0.075, 30, -11, 17, 0.85),
        (27, -0.04, -0.18, 15, 0.085, 34, -14, 25, 0.35),
        (33, -0.05, -0.11, 9, 0.060, 18, -9, 20, 0.10),
        (39, -0.02, -0.05, 5, 0.035, 7, -4, 11, 0.03),
        (48, 0.00, 0.00, 0, 0.00, 0, 0, 0, 0.0),
    ]
    for frame, root_z, root_x, head, gaze, side_l, side_r, leaf, glow in keys:
        reach = -root_x
        pose(rig, frame, {
            "root": {"z": root_z, "x": root_x},
            # The whole pearl silhouette reaches as one mass.  Translating
            # the inner body against the painted side lobes exposed their
            # crop edges and made them read as separate pills.
            "body": {"sx": 1.0 + reach * 0.34, "sy": 1.0 - reach * 0.24, "rot": -head * 0.08, "x": -reach * 0.20, "z": -reach * 0.12},
            "body_squash": {"rot": -head * 0.08, "x": reach * 0.18, "z": reach * 0.08},
            "head": {"rot": head * 0.18, "x": reach * 0.12, "z": reach * 0.06},
            # The baby has fluffy side lobes rather than articulated hands.
            # A small swing plus stretch reads as a reach without revealing
            # the segmented edge of the layered mask.
            "arm.L": {"rot": 0, "z": 0, "sx": 1.0, "sy": 1.0},
            "arm.R": {"rot": 0, "z": 0, "sx": 1.0, "sy": 1.0},
            "foot.L": {"x": -reach * 0.06, "z": -reach * 0.03, "sx": 1.0, "sy": 1.0},
            "foot.R": {"x": reach * 0.06, "z": -reach * 0.03, "sx": 1.0, "sy": 1.0},
            "pupil.L": {"x": min(0.12, gaze * 1.25), "z": 0.045 if glow else 0},
            "pupil.R": {"x": min(0.12, gaze * 1.20), "z": 0.040 if glow else 0},
            "mouth": {"sx": 1.0 + glow * 0.12, "sy": 1.0 + glow * 0.18},
            "cheek.L": {"x": -glow * 0.10, "z": glow * 0.05},
            "cheek.R": {"x": glow * 0.10, "z": glow * 0.05},
            "leaf_stem_01": {"rot": leaf * 0.16},
            "leaf_stem_02": {"rot": leaf * 0.42},
            "leaf": {"rot": leaf * 0.58},
        }, {"mouth_open": glow * 0.45, "cheek_puff": glow * 0.72, "body_squash": min(0.24, abs(root_z) * 1.6)})


def dance(rig):
    """Crouch, side-step, open airborne pose, cross-body finish."""

    keys = [
        (1, 0.00, 0.00, 1.00, 1.00, 0, 0.00, 0.00, 0, 0.0),
        (5, -0.08, -0.10, 1.11, 0.89, -5, 0.03, 0.00, -13, 0.05),
        (9, -0.13, -0.16, 1.15, 0.86, -8, 0.00, 0.07, -22, 0.10),
        (15, -0.30, 0.06, 0.96, 1.06, 12, 0.26, 0.05, 21, 0.25),
        (21, -0.42, 0.10, 0.94, 1.09, 16, 0.42, 0.00, -38, 0.38),
        (25, -0.12, -0.08, 1.10, 0.90, -7, 0.05, 0.10, -28, 0.12),
        (29, 0.05, 0.38, 0.88, 1.17, -4, 0.46, 0.40, -48, 0.70),
        (35, 0.18, 0.48, 0.86, 1.20, 3, 0.48, 0.45, -62, 0.82),
        (41, 0.30, 0.06, 1.06, 0.94, -15, 0.08, 0.38, -42, 0.28),
        (45, 0.40, -0.12, 1.14, 0.87, -20, 0.00, 0.08, -58, 0.42),
        (53, 0.18, 0.10, 0.95, 1.08, 10, 0.34, 0.10, -38, 0.65),
        (57, 0.06, -0.06, 1.07, 0.93, -6, 0.05, 0.24, -27, 0.25),
        (61, -0.02, 0.08, 0.98, 1.04, 3, 0.16, 0.00, 16, 0.14),
        (67, 0.01, -0.025, 1.03, 0.97, -1, 0.00, 0.02, -8, 0.05),
        (72, 0.00, 0.00, 1.00, 1.00, 0, 0.00, 0.00, 0, 0.0),
    ]
    for frame, root_x, root_z, sx, sy, head, foot_l, foot_r, leaf, face in keys:
        airborne = max(0.0, root_z)
        # Both feet participate in every airborne/contact beat.  Letting one
        # foot stay completely static made the dance read as a rigid hop after
        # root alignment, even though the whole sprite travelled a long way.
        dance_foot_l = min(0.58, max(foot_l, airborne * 0.62, abs(root_x) * 0.62))
        dance_foot_r = min(0.58, max(foot_r, airborne * 0.62, abs(root_x) * 0.62))
        body_wave = (sx - 1.0) * 0.32
        pose(rig, frame, {
            "root": {"x": root_x, "z": root_z},
            "body": {"sx": 1.0 + (sx - 1.0) * 0.62, "sy": 1.0 + (sy - 1.0) * 0.62, "rot": head * 0.10, "z": -abs(sx - 1.0) * 0.18, "x": body_wave},
            "body_squash": {"rot": -head * 0.10, "z": abs(sx - 1.0) * 0.12, "x": -body_wave * 0.35},
            "head": {"rot": head * 0.22, "x": -root_x * 0.18 - body_wave * 0.18},
            "arm.L": {"rot": 0, "z": 0},
            "arm.R": {"rot": 0, "z": 0},
            "foot.L": {"x": -dance_foot_l * 0.16, "z": -dance_foot_l * 0.09, "sx": 1.0, "sy": 1.0},
            "foot.R": {"x": dance_foot_r * 0.16, "z": -dance_foot_r * 0.09, "sx": 1.0, "sy": 1.0},
            "pupil.L": {"x": root_x * 0.09, "z": airborne * 0.08},
            "pupil.R": {"x": root_x * 0.08, "z": airborne * 0.07},
            "mouth": {"sx": 1.0 + face * 0.12, "sy": 1.0 + face * 0.18},
            "leaf_stem_01": {"rot": leaf * 0.12},
            "leaf_stem_02": {"rot": leaf * 0.32},
            "leaf": {"rot": leaf * 0.46},
            "shadow": {"sx": max(0.35, 1.0 - airborne * 0.76 + abs(root_x) * 0.16)},
        }, {"body_squash": min(0.28, max(0.0, sx - 1.0) * 1.6), "body_stretch": min(0.28, max(0.0, sy - 1.0) * 1.4), "mouth_open": face * 0.72, "cheek_puff": face * 0.75})


def sing(rig):
    """Inhale, three different syllable phrases, held note and shy release."""

    keys = [
        # frame, root z, body sx/sy, head z/rot, mouth open/sx/sy, cheek, leaf, gaze z
        (1, 0.00, 1.00, 1.00, 0.00, 0, 0.00, 1.00, 1.00, 0.00, 0, 0.00),
        (7, 0.02, 1.07, 1.06, 0.05, -2, 0.12, 0.90, 1.18, 0.18, -8, 0.01),
        (13, 0.04, 1.03, 1.04, 0.06, 2, 0.48, 0.82, 1.28, 0.35, 10, 0.02),
        (17, 0.02, 1.01, 1.03, 0.04, -3, 0.22, 0.72, 1.12, 0.24, -12, 0.01),
        (25, 0.05, 1.04, 1.05, 0.07, 4, 0.62, 1.22, 0.86, 0.42, 17, 0.025),
        (33, 0.01, 1.02, 1.02, 0.03, -2, 0.28, 0.86, 1.24, 0.28, -10, 0.01),
        (37, 0.04, 1.03, 1.05, 0.06, 5, 0.72, 1.30, 0.82, 0.50, 20, 0.028),
        (45, 0.015, 1.01, 1.02, 0.03, -4, 0.34, 0.78, 1.18, 0.30, -16, 0.012),
        (53, 0.05, 1.04, 1.06, 0.08, 5, 0.82, 1.12, 1.26, 0.58, -24, 0.03),
        (57, 0.12, 1.05, 1.10, 0.14, 8, 1.00, 1.30, 1.34, 0.74, -34, 0.045),
        (69, 0.18, 1.06, 1.12, 0.19, 11, 0.88, 1.18, 1.38, 0.82, -47, 0.055),
        (73, 0.14, 1.05, 1.09, 0.15, 8, 0.64, 1.06, 1.26, 0.60, -52, 0.04),
        (81, 0.02, 1.02, 1.01, 0.03, -2, 0.20, 0.92, 1.08, 0.22, -23, 0.01),
        (89, -0.01, 1.01, 0.99, -0.01, -1, 0.08, 1.06, 0.92, 0.12, 11, 0.00),
        (96, 0.00, 1.00, 1.00, 0.00, 0, 0.00, 1.00, 1.00, 0.00, 0, 0.00),
    ]
    for frame, root_z, body_sx, body_sy, head_z, head_rot, mouth, mouth_sx, mouth_sy, cheek, leaf, gaze_z in keys:
        resonance_x = head_rot * 0.006
        pose(rig, frame, {
            # Keep the planted feet at the contact line.  Resonance lowers the
            # torso while the head locally lifts, preserving both canvas
            # margin and the grounded held-note silhouette.
            "root": {"x": head_rot * 0.008, "z": root_z * 0.75},
            # Body and face counter-motion makes resonance survive root-affine
            # alignment while the broad pearl overlap keeps the fold sealed.
            "body": {
                "z": -root_z * 0.18,
                "x": -resonance_x,
                "sx": 1.0 + (body_sx - 1.0) * 0.72,
                "sy": 1.0 + (body_sy - 1.0) * 0.72,
            },
            "body_squash": {"z": root_z * 0.12, "x": resonance_x * 0.32, "rot": -head_rot * 0.08},
            # A very small nod keeps the face alive without peeling the
            # articulated side lobe away from the continuous pearl hull on
            # the held note.
            "head": {"rot": head_rot * 0.12, "x": resonance_x * 0.35, "z": head_z * 0.16},
            "arm.L": {"sx": 1.0, "sy": 1.0},
            "arm.R": {"sx": 1.0, "sy": 1.0},
            "foot.L": {"x": -mouth * 0.025, "z": -mouth * 0.015, "sx": 1.0, "sy": 1.0},
            "foot.R": {"x": mouth * 0.025, "z": -mouth * 0.015, "sx": 1.0, "sy": 1.0},
            # A restrained upward gaze follows the held note.  The iris stays
            # well inside its painted socket while still contributing real,
            # independently authored eye motion.
            "pupil.L": {"x": head_rot * 0.0030, "z": gaze_z * 1.70},
            "pupil.R": {"x": head_rot * 0.0025, "z": gaze_z * 1.50},
            "mouth": {
                "x": head_rot * 0.006,
                "z": mouth * 0.09,
                "sx": 1.0 + (mouth_sx - 1.0) * 1.38,
                "sy": 1.0 + (mouth_sy - 1.0) * 1.38,
            },
            # Lift the blush into the smile instead of pulling it beyond the
            # outer silhouette.  The old outward travel opened a dark wedge
            # between the cheek patch and the left pearl lobe at the note peak.
            "cheek.L": {"x": cheek * 0.07, "z": cheek * 0.10},
            "cheek.R": {"x": -cheek * 0.07, "z": cheek * 0.10},
            "leaf_stem_01": {"rot": leaf * 0.12},
            "leaf_stem_02": {"rot": leaf * 0.34},
            "leaf": {"rot": leaf * 0.48},
            "shadow": {"sx": 1.0 - max(0.0, root_z) * 0.35},
        }, {"mouth_open": mouth, "cheek_puff": cheek, "body_stretch": min(0.24, max(0.0, body_sy - 1.0) * 1.5)})


def roll(rig):
    """A full directional revolution with face, feet and leaf counter-lag."""

    keys = [
        # frame, centre-path x/hop, root rot, body sx/sy/rot, head counter,
        # feet, leaf, face. Root lives at the floor contact, not the visual
        # centre.  The translation below compensates that pivot so a genuine
        # 360-degree roll remains inside the sprite canvas instead of orbiting
        # the whole character around its feet and clipping half the artwork.
        (1, 0.00, 0.00, 0, 1.00, 1.00, 0, 0, 0.00, 0.00, 0, 0.0),
        (5, -0.08, -0.10, -8, 1.15, 0.85, 5, 8, 0.01, 0.00, -16, 0.10),
        (9, -0.14, -0.12, -18, 1.18, 0.82, 9, 13, 0.02, 0.00, -28, 0.18),
        # During the revolution the approved layered artwork travels as one
        # continuous silhouette. Independent counter-rotation of the baby
        # lobes/feet/leaf exposes their attachment masks and creates holes.
        # Orientation itself supplies the strong pose change; secondary
        # deformation returns only for anticipation and landing.
        (15, -0.13, 0.12, -72, 0.84, 1.16, 8, -8, 0.05, 0.02, 34, 0.30),
        (21, -0.06, 0.25, -135, 1.18, 0.82, -9, 9, 0.04, 0.08, -52, 0.42),
        (27, 0.04, 0.35, -190, 0.82, 1.18, 10, -10, 0.09, 0.04, 61, 0.55),
        (33, 0.14, 0.25, -255, 1.18, 0.82, -10, 10, 0.04, 0.09, -64, 0.48),
        (39, 0.18, 0.14, -320, 0.84, 1.16, 8, -8, 0.08, 0.03, 56, 0.36),
        (44, 0.12, 0.03, -350, 1.06, 0.94, -8, 14, 0.04, 0.08, 38, 0.24),
        (45, 0.07, -0.12, -360, 1.18, 0.82, 8, 5, 0.06, 0.03, -42, 0.62),
        (49, -0.03, 0.05, -370, 0.94, 1.07, -8, -6, 0.28, 0.16, 46, 0.75),
        (54, 0.02, -0.03, -356, 1.05, 0.95, 4, 3, 0.04, 0.24, -28, 0.25),
        (60, 0.00, 0.00, -360, 1.00, 1.00, 0, 0, 0.00, 0.00, 0, 0.0),
    ]
    centre_height = 2.55
    for frame, path_x, hop, root_rot, sx, sy, body_rot, head_counter, foot_l, foot_r, leaf, face in keys:
        radians = math.radians(root_rot)
        root_x = path_x + centre_height * math.sin(radians)
        root_z = centre_height + hop - centre_height * math.cos(radians)
        airborne = max(0.0, hop)
        # Root rotation already supplies the full tumble.  Keep the painted
        # pearl body continuous and reserve local deformation for a gentle
        # squash/follow-through; large counter-translations exposed the feet
        # and side lobes as detached pieces.
        spin_amount = abs(math.sin(radians))
        body_sx = 1.0 + (sx - 1.0) * 0.34
        body_sy = 1.0 + (sy - 1.0) * 0.34
        secondary_x = math.sin(radians * 1.5) * 0.08
        secondary_z = math.sin(radians * 2.0) * 0.06
        body_wave_x = math.sin(radians * 2.0) * 0.10
        body_wave_z = math.cos(radians * 2.0) * 0.07
        head_lag_x = -math.sin(radians * 2.0) * 0.05
        head_lag_z = math.sin(radians * 1.5) * 0.04
        root_z += spin_amount * 0.22
        if 14 <= frame <= 42:
            foot_scale_l = 0.94
            foot_scale_r = 0.94
            tuck_wave = math.sin(radians * 1.25)
            foot_x_l = -0.04 + tuck_wave * 0.03
            foot_x_r = 0.04 - tuck_wave * 0.03
            foot_z = -0.03 + math.cos(radians * 1.5) * 0.02
        elif frame == 44:
            foot_scale_l = 0.52
            foot_scale_r = 0.52
            foot_x_l = -0.50
            foot_x_r = 0.50
            foot_z = -0.38
        else:
            landing_foot_l = min(0.10, foot_l)
            landing_foot_r = min(0.10, foot_r)
            foot_scale_l = 1.0 - landing_foot_l * 0.18
            foot_scale_r = 1.0 - landing_foot_r * 0.18
            foot_x_l = 0.0
            foot_x_r = 0.0
            foot_z = 0.0
        pose(rig, frame, {
            # Counter-motion keeps the visible trajectory stable while the
            # pearl mass has genuine secondary movement inside the tumble.
            "root": {"x": root_x - secondary_x, "z": root_z - secondary_z, "rot": root_rot},
            "body": {"x": secondary_x + body_wave_x, "z": secondary_z + body_wave_z, "sx": body_sx, "sy": body_sy, "rot": body_rot * 0.42},
            "body_squash": {"x": -body_wave_x * 0.58, "z": -body_wave_z * 0.46, "rot": -body_rot * 0.22},
            "head": {"x": head_lag_x, "z": head_lag_z, "rot": head_counter * 0.72},
            # Stage-1 has no arms: these controls are only painted side lobes.
            # Keep them welded to the silhouette during the full revolution;
            # independent rotation produces detached pearl crescents.
            "arm.L": {"rot": 0, "z": 0},
            "arm.R": {"rot": 0, "z": 0},
            # Feet tuck upward and inward during the revolution.  Translation
            # and scale preserve the rounded source lobes; rotating their crop
            # would expose detached white tails.
            "foot.L": {"x": foot_x_l, "z": foot_z, "sx": foot_scale_l, "sy": foot_scale_l},
            "foot.R": {"x": foot_x_r, "z": foot_z, "sx": foot_scale_r, "sy": foot_scale_r},
            "pupil.L": {"x": -0.05 if frame < 27 else 0.04, "z": 0.02 if airborne else 0},
            "pupil.R": {"x": -0.045 if frame < 27 else 0.036, "z": 0.018 if airborne else 0},
            "mouth": {"x": 0, "z": face * 0.03, "sx": 1.0 + face * 0.08, "sy": 1.0 + face * 0.12},
            "cheek.L": {"x": -face * 0.04, "z": face * 0.03},
            "cheek.R": {"x": face * 0.04, "z": face * 0.03},
            "leaf_stem_01": {"rot": leaf * 0.10 + math.sin(radians - 0.55) * 1.5},
            "leaf_stem_02": {"rot": leaf * 0.20 + math.sin(radians - 0.72) * 2.5},
            "leaf": {"rot": leaf * 0.28 + math.sin(radians - 0.90) * 3.5},
            # The floor shadow never tumbles with the character.  Keeping it
            # close to the horizontal path prevents a partially off-canvas
            # purple wedge during the middle of the revolution.
            "shadow": {"x": path_x * 0.55, "sx": max(0.42, 1.0 - airborne * 0.72), "sy": 1.0},
        }, {"body_squash": min(0.85, max(0.0, sx - 1.0) * 5.3), "body_stretch": min(0.75, max(0.0, sy - 1.0) * 4.8), "mouth_open": face, "cheek_puff": face * 0.72, "blink": 0.58 if frame == 49 else 0.0})


def cozy(rig):
    """Approach a presentation-owned blanket, curl, squeeze, hold, release."""

    keys = [
        (1, 0.00, 0.00, 1.00, 1.00, 0, 0, 0, 0, 0.00, 0.00, 0.0),
        (7, -0.03, -0.04, 1.03, 0.97, -3, 5, -4, -8, 0.10, 0.10, 0.05),
        (11, -0.08, -0.10, 1.07, 0.93, -6, 13, -10, -15, 0.22, 0.18, 0.12),
        (13, -0.14, -0.16, 1.10, 0.90, -9, 22, -17, -22, 0.42, 0.26, 0.20),
        (25, -0.20, -0.25, 1.15, 0.86, -13, 32, -25, -31, 0.55, 0.34, 0.36),
        (37, -0.25, -0.30, 1.19, 0.82, -16, 42, -34, -38, 0.62, 0.48, 0.52),
        (45, -0.23, -0.28, 1.17, 0.84, -15, 38, -31, -34, 0.58, 0.40, 0.44),
        (53, -0.21, -0.26, 1.16, 0.85, -14, 35, -28, -32, 0.56, 0.36, 0.40),
        (57, -0.15, -0.18, 1.11, 0.90, -10, 24, -19, 28, 0.38, 0.25, 0.26),
        (65, -0.07, -0.08, 1.05, 0.95, -5, 10, -8, 18, 0.16, 0.12, 0.10),
        (69, -0.025, -0.03, 1.02, 0.98, -2, 3, -2, 8, 0.05, 0.04, 0.03),
        (72, 0.00, 0.00, 1.00, 1.00, 0, 0, 0, 0, 0.00, 0.00, 0.0),
    ]
    for frame, root_x, root_z, sx, sy, head, side_l, side_r, leaf, closure, mouth, puff in keys:
        curl_x = -root_x
        pose(rig, frame, {
            "root": {"x": root_x, "z": root_z},
            "body": {
                "sx": 1.0 + (sx - 1.0) * 0.52,
                "sy": 1.0 + (sy - 1.0) * 0.52,
                "rot": head * 0.30,
                "z": -abs(root_z) * 0.18,
                "x": -curl_x * 0.05,
            },
            "body_squash": {"rot": head * 0.08, "z": abs(root_z) * 0.08, "x": curl_x * 0.04},
            "head": {"rot": head * 0.14, "x": curl_x * 0.04},
            "arm.L": {"rot": 0, "z": 0},
            "arm.R": {"rot": 0, "z": 0},
            # Fold the rounded feet inward/up with the real baby-bone axes.
            # Opposite signs keep the motion bilateral instead of sliding the
            # pair in one direction under the blanket.
            "foot.L": {"x": -abs(root_x) * 0.08, "z": -abs(root_x) * 0.04, "sx": 1.0, "sy": 1.0},
            "foot.R": {"x": abs(root_x) * 0.08, "z": -abs(root_x) * 0.04, "sx": 1.0, "sy": 1.0},
            "pupil.L": {"x": -0.035 if frame < 57 else 0.025, "z": -0.018 if closure else 0},
            "pupil.R": {"x": -0.030 if frame < 57 else 0.022, "z": -0.016 if closure else 0},
            # Cozy remains a soft closed smile. The blanket/target is owned by
            # presentation, so facial warmth must not read as an open laugh.
            "mouth": {"sx": max(0.68, 1.0 - closure * 0.45 + mouth * 0.02), "sy": max(0.18, 1.0 - closure * 1.35 + mouth * 0.02)},
            "cheek.L": {"x": -puff * 0.028, "z": puff * 0.012},
            "cheek.R": {"x": puff * 0.028, "z": puff * 0.012},
            "leaf_stem_01": {"rot": leaf * 0.10},
            "leaf_stem_02": {"rot": leaf * 0.28},
            "leaf": {"rot": leaf * 0.42},
            "shadow": {"sx": 1.30 + abs(root_x) * 0.10, "sy": 0.70, "z": -0.04},
        }, {"blink": closure, "body_squash": min(0.22, abs(root_z) * 0.7), "mouth_open": mouth * 0.08, "cheek_puff": puff})


AUTHORS = {
    "idle": idle,
    "blink": blink,
    "look_left": lambda rig: look(rig, -1),
    "look_right": lambda rig: look(rig, 1),
    "tap_reaction": tap_reaction,
    "happy": happy,
    "eat": eat,
    "hatch_complete": hatch_complete,
    "sad": sad,
    "travel": travel,
    "sleep": sleep,
    "read": read,
    "lamp": lamp,
    "dance": dance,
    "sing": sing,
    "roll": roll,
    "cozy": cozy,
}


SEMANTIC_EVENT_PAYLOADS = {
    ("travel", 20, "travel_pulse"): {"index": 1},
    ("travel", 32, "travel_pulse"): {"index": 2},
    ("sleep", 36, "sleep_breath"): {"phase": "hold"},
    ("sleep", 68, "sleep_breath"): {"phase": "exhale"},
    ("read", 10, "prop_attach"): {"prop": "book"},
    ("lamp", 20, "lamp_glow"): {"presentationOnly": True},
    ("dance", 8, "dance_beat"): {"index": 1},
    ("dance", 24, "dance_beat"): {"index": 2},
    ("dance", 40, "dance_beat"): {"index": 3},
    ("dance", 56, "dance_beat"): {"index": 4},
    ("sing", 12, "vocal_phrase"): {"index": 1},
    ("sing", 32, "vocal_phrase"): {"index": 2},
    ("sing", 52, "vocal_phrase"): {"index": 3},
    ("sing", 16, "mouth_cue"): {"shape": "n"},
    ("sing", 24, "mouth_cue"): {"shape": "ee"},
    ("sing", 36, "mouth_cue"): {"shape": "oo"},
    ("sing", 44, "mouth_cue"): {"shape": "m"},
    ("sing", 56, "mouth_cue"): {"shape": "ah"},
    ("sing", 68, "mouth_cue"): {"shape": "hold"},
    ("cozy", 10, "prop_attach"): {"prop": "cozy-target"},
}


def semantic_events(clip: str):
    """Convert normative zero-based markers to Blender's one-based frames."""

    result = []
    for frame, event_type in SEMANTIC_CLIP_CONTRACT[clip]["events"]:
        event = {"frame": int(frame) + 1, "type": event_type}
        payload = SEMANTIC_EVENT_PAYLOADS.get((clip, int(frame), event_type))
        if payload is not None:
            event["payload"] = payload
        result.append(event)
    return result


def all_fcurves(action):
    # Blender 4.4+ layered actions; retain fallback for older supported versions.
    if hasattr(action, "fcurves"):
        yield from action.fcurves
        return
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


def finish_curves(action, loop: bool):
    for curve in all_fcurves(action):
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
        if loop:
            cycle = curve.modifiers.new(type="CYCLES")
            cycle.mode_before = "REPEAT"
            cycle.mode_after = "REPEAT"


def main():
    global MASTER
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    variant = "baby"
    for index, value in enumerate(args):
        if value == "--variant" and index + 1 < len(args):
            variant = args[index + 1]
    MASTER = REPO / "art/niumpi/blender" / ("niumpi_master.blend" if variant == "baby" else f"{variant}_master.blend")
    if not MASTER.exists():
        raise SystemExit("Build the rig first: scripts/niumpi/build_rig.py")
    if Path(bpy.data.filepath).resolve() != MASTER.resolve():
        bpy.ops.wm.open_mainfile(filepath=str(MASTER))
    rig = bpy.data.objects["NiumpiRig"]
    rig.animation_data_create()
    variant = str(rig.get("variant", variant))
    for action in list(bpy.data.actions):
        if action.name.startswith(f"{variant}::"):
            bpy.data.actions.remove(action)
    active_clips = CLIPS if variant == "baby" else CORE_CLIPS
    for clip, (frame_count, loop_flag, transition) in active_clips.items():
        reset_pose(rig)
        action = bpy.data.actions.new(f"{variant}::{clip}")
        rig.animation_data.action = action
        AUTHORS[clip](rig)
        finish_curves(action, loop_flag)
        action["clip"] = clip
        action["variant"] = variant
        action["fps"] = FPS
        action["frame_count"] = frame_count
        action["loop"] = loop_flag
        action["transition"] = json.dumps({
            "anticipationFrames": transition[0],
            "actionFrames": transition[1],
            "recoveryFrames": transition[2],
        }, separators=(",", ":"))
        events = []
        if clip == "blink":
            events = [{"frame": 4, "type": "eyes_closed"}]
        elif clip == "eat":
            events = [{"frame": frame, "type": "bite", "payload": {"bite": index + 1}} for index, frame in enumerate((34, 48, 62))]
            events.append({"frame": 72, "type": "swallow"})
        elif clip == "tap_reaction":
            events = [{"frame": 14, "type": "impact"}, {"frame": 20, "type": "airborne"}, {"frame": 31, "type": "land"}]
        elif clip == "happy":
            events = [{"frame": 20, "type": "joy_peak"}, {"frame": 45, "type": "land"}]
        elif clip == "hatch_complete":
            events = [{"frame": 30, "type": "reveal"}, {"frame": 84, "type": "settled"}]
        elif clip in SEMANTIC_CLIP_CONTRACT:
            events = semantic_events(clip)
        action["events"] = json.dumps(events, separators=(",", ":"))
        if clip in SEMANTIC_CLIP_CONTRACT:
            spec = SEMANTIC_CLIP_CONTRACT[clip]
            enter_blend, exit_blend, reduced_pose = SEMANTIC_PLAYBACK[clip]
            playback = {
                "priority": int(spec["priority"]),
                "enterBlendFrames": enter_blend,
                "exitBlendFrames": exit_blend,
                "reducedPoseFrame": reduced_pose,
            }
            for key in ("loopRange", "exitRange"):
                if key in spec:
                    start, stop = spec[key]
                    playback[key] = {"startFrame": int(start), "endFrameExclusive": int(stop)}
                    action[key] = json.dumps(playback[key], separators=(",", ":"))
            action["playback"] = json.dumps(playback, separators=(",", ":"))
        action.use_fake_user = True
        print(f"NIUMPI_ACTION clip={clip} frames={frame_count} curves={sum(1 for _ in all_fcurves(action))}")
    rig.animation_data.action = bpy.data.actions[f"{variant}::idle"]
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 72
    bpy.context.scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(MASTER), compress=True)
    print(f"NIUMPI_ACTIONS_OK master={MASTER.relative_to(REPO)} actions={len(active_clips)}")


if __name__ == "__main__":
    main()
