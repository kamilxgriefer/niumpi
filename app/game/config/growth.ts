import type { StageId } from "../types.ts";

/**
 * Niumpi's silhouette as data.
 *
 * The old rig drew the body from a single PNG of a fully-grown creature, so a
 * newly hatched Niumpi could only ever be that same adult shape at a smaller
 * size — and nothing in the stylesheet even did the shrinking. Growth read as
 * "the same pet, plus leaves".
 *
 * Babyness is a matter of proportion, not size: a large round head, a body that
 * has barely any taper, and big eyes sitting low in the face. None of that
 * survives uniform scaling of one bitmap, so the body is now a curve generated
 * from the numbers below. Every stage is a set of proportions, which makes a
 * new stage a data change and lets the shape be tested.
 *
 * All geometry is in the 200x200 viewBox the renderer uses.
 */

export type BodyGeometry = {
  /** Half-width of the round lower mass. */
  rx: number;
  /** Half-height of that mass. */
  ry: number;
  /** Y of its centre. Larger = the weight sits lower, which reads younger. */
  baseY: number;
  /** Y of the tip. The gap up from `baseY - ry` is how far the point protrudes. */
  tipY: number;
  /** Half-width of the tip's control span. Wide = blunt nub, narrow = sharp. */
  tipW: number;
  /** How long the sides keep bulging before turning in. 1 = nearly circular. */
  shoulder: number;
  /** A few units of lean. Perfect symmetry looks manufactured. */
  tipLean: number;
};

export type FaceGeometry = {
  eyeR: number;
  /** Eyes low in the face is the strongest single baby cue we have. */
  eyeY: number;
  /** Distance from centre to each eye. */
  eyeGap: number;
  /** Pupil size as a fraction of the eye. */
  pupil: number;
  mouthY: number;
  mouthW: number;
  cheekR: number;
  cheekGap: number;
};

export type StageProfile = {
  id: StageId;
  name: string;
  blurb: string;
  /** Care moments needed to leave this stage. */
  careMoments: number;
  /** Real days that must also pass. The dev time multiplier scales this. */
  days: number;
  /** Size within the stage box, so growth is felt as well as seen. */
  scale: number;
  body: BodyGeometry;
  face: FaceGeometry;
  /** Documented bond progression: 1, 2, 3, then 5. */
  leaves: number;
  arms: "none" | "buds" | "short" | "full";
  feet: "tucked" | "small" | "full";
  art: string;
};

export const growthStages: StageProfile[] = [
  {
    id: 0,
    name: "Tiny Seed",
    blurb: "Something is waiting inside",
    careMoments: 4,
    days: 0,
    scale: 0.46,
    // The egg is drawn by the Seed Chamber; these keep the type total and give
    // the hatch animation something to grow out of.
    body: { rx: 58, ry: 60, baseY: 126, tipY: 64, tipW: 30, shoulder: 1, tipLean: 0 },
    face: { eyeR: 0, eyeY: 130, eyeGap: 28, pupil: 0.6, mouthY: 156, mouthW: 0, cheekR: 0, cheekGap: 46 },
    leaves: 0,
    arms: "none",
    feet: "tucked",
    art: "seed",
  },
  {
    id: 1,
    name: "Hatchling",
    blurb: "Brand new, and holding on to you",
    careMoments: 26,
    days: 0,
    // Half size, almost round, with a nub where the point will grow. This is
    // the stage the player meets first and the one they should want to protect.
    scale: 0.62,
    body: { rx: 60, ry: 56, baseY: 128, tipY: 58, tipW: 26, shoulder: 0.95, tipLean: 3 },
    face: { eyeR: 18.5, eyeY: 130, eyeGap: 27, pupil: 0.56, mouthY: 158, mouthW: 13, cheekR: 11, cheekGap: 45 },
    leaves: 1,
    arms: "none",
    feet: "tucked",
    art: "hatchling",
  },
  {
    id: 2,
    name: "Sprouting",
    blurb: "First shape, first opinions",
    careMoments: 62,
    days: 1,
    scale: 0.73,
    body: { rx: 58, ry: 54, baseY: 130, tipY: 40, tipW: 22, shoulder: 0.86, tipLean: 4 },
    face: { eyeR: 16, eyeY: 128, eyeGap: 29, pupil: 0.58, mouthY: 155, mouthW: 15, cheekR: 10.5, cheekGap: 45 },
    leaves: 2,
    arms: "buds",
    feet: "small",
    art: "sprout",
  },
  {
    id: 3,
    name: "Bloom Form",
    blurb: "Colour settles in",
    careMoments: 150,
    days: 4,
    scale: 0.85,
    body: { rx: 57, ry: 53, baseY: 132, tipY: 32, tipW: 21, shoulder: 0.8, tipLean: 5 },
    face: { eyeR: 14.6, eyeY: 127, eyeGap: 31, pupil: 0.6, mouthY: 153, mouthW: 17, cheekR: 10, cheekGap: 44 },
    leaves: 3,
    arms: "short",
    feet: "small",
    art: "bloom",
  },
  {
    id: 4,
    name: "Branching Evolution",
    blurb: "Your care picks a direction",
    careMoments: 300,
    days: 14,
    scale: 0.94,
    body: { rx: 56, ry: 52, baseY: 134, tipY: 24, tipW: 20, shoulder: 0.73, tipLean: 6 },
    face: { eyeR: 14, eyeY: 126, eyeGap: 32, pupil: 0.62, mouthY: 152, mouthW: 18, cheekR: 9.6, cheekGap: 43 },
    leaves: 5,
    arms: "full",
    feet: "full",
    art: "branch",
  },
  {
    id: 5,
    name: "Radiant Niumpi",
    blurb: "Fully themselves",
    careMoments: 520,
    days: 35,
    scale: 1,
    body: { rx: 55, ry: 51, baseY: 135, tipY: 18, tipW: 18, shoulder: 0.69, tipLean: 6 },
    face: { eyeR: 13.6, eyeY: 125, eyeGap: 33, pupil: 0.63, mouthY: 151, mouthW: 19, cheekR: 9.3, cheekGap: 42 },
    leaves: 5,
    arms: "full",
    feet: "full",
    art: "radiant",
  },
];

export const growthMap: Record<number, StageProfile> = Object.fromEntries(
  growthStages.map((stage) => [stage.id, stage]),
);

export const LAST_STAGE = growthStages[growthStages.length - 1].id;

export function profileFor(stage: number): StageProfile {
  return growthMap[Math.max(0, Math.min(LAST_STAGE, Math.round(stage)))] ?? growthStages[1];
}

/**
 * Builds the silhouette: a round base, then two curves that meet at the tip.
 * `shoulder` decides where the sides stop bulging outward, which is what turns
 * a ball into a droplet.
 */
export function bodyPath(g: BodyGeometry): string {
  const cx = 100;
  const left = cx - g.rx;
  const right = cx + g.rx;
  const bottom = g.baseY + g.ry;
  const tipX = cx + g.tipLean;
  const k = 0.62;
  const shoulderY = g.baseY - g.ry * g.shoulder;
  const tipDrop = g.ry * 0.3;
  return [
    `M ${left} ${g.baseY}`,
    `C ${left} ${g.baseY + g.ry * k} ${cx - g.rx * k} ${bottom} ${cx} ${bottom}`,
    `C ${cx + g.rx * k} ${bottom} ${right} ${g.baseY + g.ry * k} ${right} ${g.baseY}`,
    `C ${right} ${shoulderY} ${tipX + g.tipW} ${g.tipY + tipDrop} ${tipX} ${g.tipY}`,
    `C ${tipX - g.tipW} ${g.tipY + tipDrop} ${left} ${shoulderY} ${left} ${g.baseY}`,
    "Z",
  ].join(" ");
}

/** The soft lighter belly, kept well inside the silhouette. */
export function bellyPath(g: BodyGeometry): string {
  const cx = 100;
  const rx = g.rx * 0.68;
  const ry = g.ry * 0.46;
  const cy = g.baseY + g.ry * 0.4;
  return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
}

/**
 * How far the point protrudes above the round mass. The renderer uses it to
 * place leaves so they sit on the tip at every stage instead of being nudged
 * by hand-written per-stage offsets.
 */
export function tipRise(g: BodyGeometry): number {
  return Math.max(0, g.baseY - g.ry - g.tipY);
}
