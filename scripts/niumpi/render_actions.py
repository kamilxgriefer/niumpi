#!/usr/bin/env python3
"""Render every authored Blender frame after explicit depsgraph evaluation."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import bpy
from mathutils import Vector


REPO = Path(__file__).resolve().parents[2]
MASTER = REPO / "art/niumpi/blender/niumpi_master.blend"
DEFAULT_OUTPUT = REPO / "art/niumpi/rendered-source"
GENERATOR_SOURCES = (
    REPO / "scripts/niumpi/build_rig.py",
    REPO / "scripts/niumpi/build_actions.py",
    REPO / "scripts/niumpi/render_actions.py",
    REPO / "scripts/niumpi/build_variant_rig.py",
    REPO / "scripts/niumpi/variant_clip_contract.py",
)

REGION_BONES = {
    "body": ("root", "body_squash", "head"),
    "arms": ("arm.L", "arm.R"),
    "feet": ("foot.L", "foot.R"),
    "eyes": ("pupil.L", "pupil.R", "eyelid_upper.L", "eyelid_upper.R"),
    "leaf": ("leaf_stem_01", "leaf_stem_02", "leaf"),
    "shadow": ("shadow",),
}


def parse_args():
    args = []
    if "--" in __import__("sys").argv:
        args = __import__("sys").argv[__import__("sys").argv.index("--") + 1 :]
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", default="baby")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--clips", nargs="*")
    parser.add_argument("--qa", action="store_true", help="Render only phase/event samples without replacing production frames")
    parser.add_argument("--frames", nargs="*", type=int, help="explicit one-based QA frames; requires --qa")
    return parser.parse_args(args)


def all_fcurves(action):
    if hasattr(action, "fcurves"):
        yield from action.fcurves
        return
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


def animated_channels(action):
    result = []
    for curve in all_fcurves(action):
        label = f"{curve.data_path}[{curve.array_index}]"
        values = [round(point.co.y, 6) for point in curve.keyframe_points]
        if len(set(values)) > 1:
            result.append(label)
    return sorted(set(result))


def animated_controls(channels):
    controls = set()
    for channel in channels:
        if 'pose.bones["' in channel:
            controls.add(channel.split('pose.bones["', 1)[1].split('"]', 1)[0])
        elif '["' in channel:
            controls.add(channel.split('["', 1)[1].split('"]', 1)[0])
    return sorted(controls)


def animated_regions(controls):
    regions = []
    for region, bones in REGION_BONES.items():
        if any(bone in controls for bone in bones):
            regions.append(region)
    if any(control in controls for control in ("blink", "mouth_open", "cheek_puff")) and "eyes" not in regions:
        regions.append("eyes")
    if any(control.startswith("leaf.") for control in controls) and "leaf" not in regions:
        regions.append("leaf")
    if any(control.startswith("accessory.") for control in controls):
        regions.append("accessory")
    return sorted(regions)


def pose_sample(rig):
    sample = {}
    evaluated = rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
    canonical = ("root", "body_squash", "head", "arm.L", "arm.R", "pupil.L", "pupil.R", "leaf_stem_01", "leaf_stem_02", "leaf", "shadow")
    dynamic = [bone.name for bone in rig.pose.bones if bone.name.startswith(("leaf.", "accessory."))]
    for name in dict.fromkeys((*canonical, *dynamic)):
        if name not in evaluated.pose.bones:
            continue
        bone = evaluated.pose.bones[name]
        matrix = bone.matrix
        head = matrix.translation
        tail = matrix @ Vector((0.0, bone.length, 0.0))
        sample[name] = {
            "location": [round(value, 6) for value in matrix.translation],
            "rotationZ": round(bone.rotation_euler.z, 6),
            "scale": [round(value, 6) for value in bone.scale],
            "head": [round(value, 6) for value in head],
            "tail": [round(value, 6) for value in tail],
        }
    sample["controls"] = {prop: round(float(rig[prop]), 6) for prop in ("blink", "mouth_open", "cheek_puff", "body_squash", "body_stretch")}
    return sample


def measured_motion(samples):
    first = samples[0]
    pixels_per_world = bpy.context.scene.render.resolution_x / bpy.context.scene.camera.data.ortho_scale
    output = {}
    names = sorted(set.intersection(*(set(sample) - {"controls"} for sample in samples)))
    for name in names:
        reference = first[name]["tail"] if name in {"arm.L", "arm.R", "leaf_stem_01", "leaf_stem_02", "leaf"} else first[name]["head"]
        max_distance = 0.0
        for sample in samples:
            point = sample[name]["tail"] if name in {"arm.L", "arm.R", "leaf_stem_01", "leaf_stem_02", "leaf"} else sample[name]["head"]
            distance = ((point[0] - reference[0]) ** 2 + (point[2] - reference[2]) ** 2) ** 0.5
            max_distance = max(max_distance, distance * pixels_per_world)
        output[name] = round(max_distance, 3)
    return output


def measured_controls(samples):
    names = ("blink", "mouth_open", "cheek_puff", "body_squash", "body_stretch")
    return {
        name: {
            "min": round(min(float(sample["controls"][name]) for sample in samples), 6),
            "max": round(max(float(sample["controls"][name]) for sample in samples), 6),
        }
        for name in names
    }


def clear_existing(directory: Path):
    directory.mkdir(parents=True, exist_ok=True)
    for path in directory.glob("*.png"):
        path.unlink()


def generator_sha256() -> str:
    digest = hashlib.sha256()
    for path in GENERATOR_SOURCES:
        digest.update(path.relative_to(REPO).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def main():
    global MASTER
    args = parse_args()
    MASTER = REPO / "art/niumpi/blender" / ("niumpi_master.blend" if args.variant == "baby" else f"{args.variant}_master.blend")
    if args.frames and not args.qa:
        raise SystemExit("--frames is a targeted QA option and requires --qa")
    if Path(bpy.data.filepath).resolve() != MASTER.resolve():
        bpy.ops.wm.open_mainfile(filepath=str(MASTER))
    scene = bpy.context.scene
    rig = bpy.data.objects["NiumpiRig"]
    rig.animation_data_create()
    actions = [action for action in bpy.data.actions if action.name.startswith(f"{args.variant}::")]
    if args.clips:
        requested = set(args.clips)
        actions = [action for action in actions if action["clip"] in requested]
    actions.sort(key=lambda action: action["clip"])
    if not actions:
        raise SystemExit("No matching authored actions")

    report_path = args.output / args.variant / "render-report.json"
    report = {
        "schemaVersion": 2,
        "variant": args.variant,
        "fps": scene.render.fps,
        "canvas": {"width": scene.render.resolution_x, "height": scene.render.resolution_y},
        "anchor": {"x": int(scene["render_anchor_x"]), "y": int(scene["render_anchor_y"])},
        "provenance": {
            "master": str(MASTER.relative_to(REPO)),
            "masterSha256": hashlib.sha256(MASTER.read_bytes()).hexdigest(),
            "generatorSha256": generator_sha256(),
            "approvedArt": str(scene["source_art"]),
            "approvedArtSha256": hashlib.sha256((REPO / str(scene["source_art"])).read_bytes()).hexdigest(),
            "landmarksSha256": hashlib.sha256((REPO / "art/niumpi/variant-landmarks.json").read_bytes()).hexdigest(),
        },
        "clips": {},
    }
    if args.clips and report_path.exists():
        previous = json.loads(report_path.read_text(encoding="utf-8"))
        compatible = (
            previous.get("schemaVersion") == report["schemaVersion"]
            and previous.get("variant") == report["variant"]
            and previous.get("fps") == report["fps"]
            and previous.get("canvas") == report["canvas"]
            and previous.get("anchor") == report["anchor"]
            and previous.get("provenance") == report["provenance"]
        )
        if compatible:
            report["clips"].update(previous.get("clips", {}))
        else:
            print("NIUMPI_PARTIAL_REPORT_DISCARDED reason=provenance-or-render-contract-changed")
    for action in actions:
        clip = action["clip"]
        frame_count = int(action["frame_count"])
        clip_dir = (args.output / args.variant / ("_qa" if args.qa else "") / clip).resolve()
        clear_existing(clip_dir)
        rig.animation_data.action = action
        scene.frame_start = 1
        scene.frame_end = frame_count
        hashes = []
        samples = {}
        every_pose = []
        sample_frames = sorted(set((1, max(1, frame_count // 4), max(1, frame_count // 2), max(1, 3 * frame_count // 4), frame_count)))
        render_frames = list(range(1, frame_count + 1))
        if args.qa:
            event_frames = [int(event["frame"]) for event in json.loads(action["events"])]
            requested_frames = args.frames or []
            invalid_frames = [frame for frame in requested_frames if frame < 1 or frame > frame_count]
            if invalid_frames:
                raise SystemExit(f"{clip}: QA frames outside 1..{frame_count}: {invalid_frames}")
            render_frames = sorted(set(requested_frames or (sample_frames + event_frames)))
        for frame in render_frames:
            # Never rely on the viewport or implicit timeline updates.
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            depsgraph.update()
            path = clip_dir / f"{frame - 1:04d}.png"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            hashes.append(digest)
            current_pose = pose_sample(rig)
            every_pose.append(current_pose)
            if frame in sample_frames:
                samples[str(frame)] = current_pose
        channels = animated_channels(action)
        controls = animated_controls(channels)
        regions = animated_regions(controls)
        unique = len(set(hashes))
        min_unique = min(len(render_frames), 2 if clip == "blink" else 4)
        if unique < min_unique:
            raise RuntimeError(f"{clip}: only {unique} unique PNG frames (minimum {min_unique})")
        if args.qa:
            print(
                f"NIUMPI_QA clip={clip} rendered={len(render_frames)} unique={unique} "
                f"motionPixels={json.dumps(measured_motion(every_pose), separators=(',', ':'))} "
                f"dir={clip_dir.relative_to(REPO)}"
            )
            continue
        report["clips"][clip] = {
            "frameCount": frame_count,
            "uniqueFrameHashes": unique,
            "uniqueRatio": round(unique / frame_count, 4),
            "frameHashes": hashes,
            "animatedControls": controls,
            "animatedChannels": channels,
            "regions": regions,
            "motionPixels": measured_motion(every_pose),
            "controlRanges": measured_controls(every_pose),
            "loop": bool(action["loop"]),
            "transition": json.loads(action["transition"]),
            "events": json.loads(action["events"]),
            "sampledPose": samples,
            "sourceDirectory": str(clip_dir.relative_to(REPO)),
        }
        if "playback" in action:
            report["clips"][clip]["playback"] = json.loads(action["playback"])
        for range_name in ("loopRange", "exitRange"):
            if range_name in action:
                report["clips"][clip][range_name] = json.loads(action[range_name])
        if clip == "blink":
            report["clips"][clip]["blinkClosure"] = max(
                float(sample["controls"]["blink"]) for sample in samples.values()
            )
        print(f"NIUMPI_RENDER clip={clip} frames={frame_count} unique={unique} regions={','.join(regions)}")
    if args.qa:
        print(f"NIUMPI_QA_OK clips={len(actions)}")
    else:
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"NIUMPI_RENDER_OK report={report_path.relative_to(REPO)} clips={len(actions)}")


if __name__ == "__main__":
    main()
