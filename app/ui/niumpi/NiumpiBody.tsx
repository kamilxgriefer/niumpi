import { useEffect, useId, useState } from "react";
import type { StageProfile } from "../../game/config/growth.ts";
import type { Phenotype } from "../../game/types.ts";
import { bellyPath, bodyPath, tipRise } from "../../game/config/growth.ts";

/**
 * The creature's whole visible form, generated from one stage profile.
 *
 * Structure only. Colour comes from CSS custom properties so a palette or an
 * evolution route can restyle it without touching geometry, and motion comes
 * from NiumpiAnimationController writing --gaze-* and behavior-* on the root.
 * Nothing here re-renders on an animation frame.
 *
 * Every surface is lit from the upper left and shaded toward the lower right.
 * One light direction across body, cheeks, eyes and leaves is most of what
 * separates a drawn character from a flat silhouette, so the constants below
 * are shared rather than chosen per layer.
 */

/** Where the light comes from, in viewBox units, for every layer. */
const LIGHT = { x: -0.22, y: -0.26 };

/** Leaf fan angles per count. Odd counts keep one leaf upright in the middle. */
const LEAF_FAN: Record<number, number[]> = {
  0: [],
  1: [4],
  2: [-22, 24],
  3: [-34, 2, 34],
  5: [-52, -26, 2, 28, 52],
};

function leafShape(w: number, h: number): string {
  return `M 0 0 C ${-w} ${-h * 0.34} ${-w * 0.56} ${-h} 0 ${-h} C ${w * 0.56} ${-h} ${w} ${-h * 0.34} 0 0 Z`;
}

/** Dirt is a translucent surface treatment, never a second character layer.
 * The same marks follow every authored evolution frame with the torso. */
function CareSurface() {
  return (
    <g className="nb-care-surface" pointerEvents="none">
      <g className="nb-dirt-overlay">
        <ellipse cx="66" cy="122" rx="12" ry="7" rotate="-18" />
        <ellipse cx="137" cy="133" rx="9" ry="6" rotate="24" />
        <circle cx="83" cy="151" r="5" />
        <circle cx="149" cy="108" r="3.8" />
        <path d="M 55 112 C 63 106 70 108 76 113 C 67 111 61 116 55 112 Z" />
      </g>
      <g className="nb-wash-bubbles">
        <circle cx="66" cy="105" r="6" /><circle cx="82" cy="92" r="3.5" />
        <circle cx="126" cy="111" r="5" /><circle cx="143" cy="96" r="3" />
        <circle cx="111" cy="145" r="4" />
      </g>
      <g className="nb-wash-tool nb-wash-sponge">
        <rect x="54" y="101" width="31" height="22" rx="8" />
        <circle cx="62" cy="108" r="2" /><circle cx="75" cy="115" r="2.4" /><circle cx="68" cy="119" r="1.5" />
      </g>
      <g className="nb-wash-tool nb-wash-brush">
        <rect x="50" y="105" width="38" height="13" rx="6.5" />
        <path d="M 56 118 v8 M 64 118 v9 M 72 118 v9 M 80 118 v8" />
      </g>
    </g>
  );
}

/** Converts the model's uniform key colour to real alpha once, client-side.
 * The generated sheet stays lossless in the repository and the original
 * character remains visible until the transparent texture is ready. */
function ChromaSpriteImage({ href, className }: { href: string; className: string }) {
  const [processed, setProcessed] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    const source = new Image();
    source.decoding = "async";
    source.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = source.naturalWidth;
      canvas.height = source.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(source, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const red = pixels.data[index];
        const green = pixels.data[index + 1];
        const blue = pixels.data[index + 2];
        const dominance = green - Math.max(red, blue);
        if (green < 135 || dominance < 32) continue;
        const removal = Math.max(0, Math.min(1, (dominance - 32) / 145));
        pixels.data[index + 3] = Math.round(pixels.data[index + 3] * (1 - removal));
      }
      context.putImageData(pixels, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob || disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setProcessed(objectUrl);
      }, "image/png");
    };
    source.src = href;
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [href]);

  if (!processed) return null;
  return (
    <image
      className={className}
      href={processed}
      x="0" y="0" width="600" height="600"
      preserveAspectRatio="none"
    />
  );
}

function MorphFeatures({ morphology, profile }: { morphology: Phenotype["morphology"]; profile: StageProfile }) {
  if (morphology === "seedling") return null;
  const reveal = Math.max(0.28, Math.min(1, profile.id / 5));
  const sideY = profile.body.baseY - profile.body.ry * 0.18;
  const sideX = profile.body.rx * (0.88 + reveal * 0.08);
  return (
    <g className={`nb-morph-features nb-morph-${morphology}`} style={{ opacity: 0.48 + reveal * 0.52 }}>
      {morphology === "moonveil" && (
        <>
          <path className="nb-morph-soft" d={`M ${100 - sideX} ${sideY} C ${72 - reveal * 7} ${66 - reveal * 7} ${54 - reveal * 10} ${52 - reveal * 8} ${56} ${106} C 65 98 72 101 ${100 - sideX} ${sideY} Z`} />
          <path className="nb-morph-soft" d={`M ${100 + sideX} ${sideY} C ${128 + reveal * 7} ${66 - reveal * 7} ${146 + reveal * 10} ${52 - reveal * 8} ${144} ${106} C 135 98 128 101 ${100 + sideX} ${sideY} Z`} />
          <path className="nb-morph-symbol" d="M 100 70 C 88 77 89 92 103 96 C 96 89 98 79 108 74 C 105 72 102 70 100 70 Z" />
        </>
      )}
      {morphology === "bloomheart" && (
        <>
          {[-1, 1].map((side) => (
            <g key={side} transform={`translate(${100 + side * sideX} ${sideY + 6}) scale(${side} 1)`}>
              <ellipse className="nb-morph-soft" cx="0" cy="-13" rx={8 + reveal * 3} ry={17 + reveal * 4} rotate="-30" />
              <ellipse className="nb-morph-soft" cx="5" cy="4" rx={8 + reveal * 3} ry={16 + reveal * 4} rotate="-72" />
              <ellipse className="nb-morph-soft" cx="-2" cy="16" rx={7 + reveal * 3} ry={14 + reveal * 3} rotate="-105" />
            </g>
          ))}
          <path className="nb-morph-symbol" d="M 100 82 C 91 72 79 80 82 91 C 84 100 100 109 100 109 C 100 109 116 100 118 91 C 121 80 109 72 100 82 Z" />
        </>
      )}
      {morphology === "sparkleap" && (
        <>
          <path className="nb-morph-wing" d={`M ${100 - sideX + 4} ${sideY + 8} C ${65 - reveal * 10} 105 ${50 - reveal * 10} 114 ${39 - reveal * 12} 100 C 53 91 67 88 ${100 - sideX + 4} ${sideY + 8} Z`} />
          <path className="nb-morph-wing" d={`M ${100 + sideX - 4} ${sideY + 8} C ${135 + reveal * 10} 105 ${150 + reveal * 10} 114 ${161 + reveal * 12} 100 C 147 91 133 88 ${100 + sideX - 4} ${sideY + 8} Z`} />
          <path className="nb-morph-symbol" d="M 100 69 L 105 80 L 117 81 L 108 89 L 111 101 L 100 95 L 89 101 L 92 89 L 83 81 L 95 80 Z" />
        </>
      )}
      {morphology === "mistwander" && (
        <>
          <path className="nb-morph-tail" d={`M ${100 + sideX - 8} ${sideY + 22} C ${153 + reveal * 18} 124 ${164 + reveal * 18} 155 141 170 C 158 158 171 170 158 184 C 142 201 110 185 116 164`} />
          <path className="nb-morph-symbol" d="M 100 72 C 89 84 90 96 100 101 C 110 96 111 84 100 72 Z" />
        </>
      )}
      {morphology === "prismatic" && (
        <>
          {[-1, 1].map((side) => (
            <g key={side} transform={`translate(${100 + side * sideX} ${sideY}) scale(${side} 1)`}>
              <path className="nb-morph-crystal" d={`M 0 4 L ${-20 - reveal * 11} -15 L ${-15 - reveal * 8} 12 Z`} />
              <path className="nb-morph-crystal" d={`M -2 9 L ${-26 - reveal * 14} 6 L ${-13 - reveal * 8} 25 Z`} />
              <path className="nb-morph-crystal" d={`M -1 -2 L ${-12 - reveal * 7} -28 L ${-5 - reveal * 3} 10 Z`} />
            </g>
          ))}
          <path className="nb-morph-symbol" d="M 100 68 L 109 83 L 103 101 L 91 92 L 92 77 Z" />
        </>
      )}
    </g>
  );
}

export function NiumpiBody({
  profile, phenotype, morphology,
}: {
  profile: StageProfile;
  phenotype?: Pick<Phenotype, "morphology" | "markings">;
  morphology?: Phenotype["morphology"];
}) {
  const { body, face } = profile;
  const look = phenotype ?? { morphology: morphology ?? "seedling", markings: [] };
  /*
   * Gradient, filter and clip ids must be unique per instance. SVG ids are
   * document-global, so two Niumpis on one page — the player and a neighbour,
   * or a street of neighbours — would all resolve every url(#...) to whichever
   * instance rendered first, and every creature would wear the first one's
   * palette regardless of its own route.
   */
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `${name}-${uid}`;
  const ref = (name: string) => `url(#${id(name)})`;

  const tipX = 100 + body.tipLean;
  const rise = tipRise(body);
  // Short stems on a small creature, longer as the tip grows, but never so long
  // that the leaves float away from the head.
  const leafScale = profile.leaves >= 5 ? 0.84 : profile.leaves >= 3 ? 0.92 : 1;
  const leafH = (26 + rise * 0.24) * leafScale;
  const leafW = leafH * 0.42;
  const angles = LEAF_FAN[profile.leaves] ?? LEAF_FAN[3];

  const armLength = { none: 0, buds: 11, short: 17, full: 23 }[profile.arms];
  const footScale = { tucked: 0.72, small: 0.88, full: 1 }[profile.feet];
  const footY = body.baseY + body.ry * 0.94;
  const footX = body.rx * 0.46;

  const silhouette = bodyPath(body);

  /* The approved painting is the identity of the character. Until an authored
   * full-frame animation clip is available, gameplay renders that painting
   * intact. No procedural face or cut masks may alter it. */
  if (profile.id > 0) {
    const finalForm = profile.id >= 5 && look.morphology !== "seedling";
    const art = finalForm
      ? `/assets/niumpi/forms/${look.morphology}.webp`
      : `/assets/niumpi/stages/stage-${profile.id}.webp`;
    const authoredIdle = profile.id === 4 && !finalForm;
    return (
      <svg className="nb nb-sprite nb-authored-art" viewBox="0 0 200 200" role="img" aria-hidden="true" focusable="false">
        <g className="nb-torso nb-sprite-torso">
          <image
            className="nb-authored-image nb-authored-static"
            href={art}
            x="0" y="0" width="200" height="200"
            preserveAspectRatio="xMidYMid meet"
          />
          {authoredIdle && (
            <>
              <svg className="nb-generated-clip nb-generated-idle" x="25" y="0" width="150" height="200" viewBox="0 0 150 200" overflow="hidden">
                <ChromaSpriteImage
                  href="/assets/niumpi/animations/stage-4-idle-v1.png"
                  className="nb-authored-sheet nb-stage4-idle-sheet"
                />
              </svg>
              <svg className="nb-generated-clip nb-generated-look" x="25" y="0" width="150" height="200" viewBox="0 0 150 200" overflow="hidden">
                <ChromaSpriteImage
                  href="/assets/niumpi/animations/stage-4-look-v1.png"
                  className="nb-authored-sheet nb-stage4-look-sheet"
                />
              </svg>
              <svg className="nb-generated-clip nb-generated-pet" x="25" y="0" width="150" height="200" viewBox="0 0 150 200" overflow="hidden">
                <ChromaSpriteImage
                  href="/assets/niumpi/animations/stage-4-pet-v1.png"
                  className="nb-authored-sheet nb-stage4-pet-sheet"
                />
              </svg>
            </>
          )}
          <CareSurface />
        </g>
      </svg>
    );
  }

  return (
    <svg className="nb" viewBox="0 0 200 200" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id("nb-skin")} x1="0.28" y1="0.04" x2="0.72" y2="1">
          <stop offset="0%" stopColor="var(--skin-light)" />
          <stop offset="52%" stopColor="var(--skin-mid)" />
          <stop offset="100%" stopColor="var(--skin-deep)" />
        </linearGradient>

        {/* Core shadow: the volume cue. Transparent where the light lands,
            deepening into the far lower-right of the form. */}
        <radialGradient
          id={id("nb-shade")}
          cx={0.5 + LIGHT.x * -1.1}
          cy={0.44 + LIGHT.y * -1.1}
          r="0.86"
        >
          <stop offset="58%" stopColor="var(--skin-deep)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--skin-deep)" stopOpacity="0.34" />
        </radialGradient>

        {/* Specular: a soft sheen on the lit shoulder, not a hard dot. */}
        <radialGradient id={id("nb-sheen")} cx={0.5 + LIGHT.x} cy={0.4 + LIGHT.y} r="0.44">
          <stop offset="0%" stopColor="var(--rim)" stopOpacity="0.72" />
          <stop offset="100%" stopColor="var(--rim)" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={id("nb-belly")} cx="0.5" cy="0.42" r="0.62">
          <stop offset="0%" stopColor="var(--belly)" stopOpacity="0.8" />
          <stop offset="68%" stopColor="var(--belly)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--belly)" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={id("nb-cheek")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="var(--cheek)" stopOpacity="0.92" />
          <stop offset="55%" stopColor="var(--cheek)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--cheek)" stopOpacity="0" />
        </radialGradient>

        <linearGradient id={id("nb-leaf")} x1="0.18" y1="1" x2="0.82" y2="0">
          <stop offset="0%" stopColor="var(--leaf-deep)" />
          <stop offset="100%" stopColor="var(--leaf-light)" />
        </linearGradient>

        {/* Eyes read as glassy spheres rather than holes: a lit upper rim over
            a deep base is what makes them look wet. */}
        <radialGradient id={id("nb-iris")} cx={0.5 + LIGHT.x * 0.7} cy={0.42} r="0.72">
          <stop offset="0%" stopColor="var(--eye-lift, #4a2f6b)" />
          <stop offset="62%" stopColor="var(--eye)" />
          <stop offset="100%" stopColor="var(--eye)" />
        </radialGradient>

        <radialGradient id={id("nb-ground")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="var(--contact, #2a1440)" stopOpacity="0.34" />
          <stop offset="70%" stopColor="var(--contact, #2a1440)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--contact, #2a1440)" stopOpacity="0" />
        </radialGradient>

        {/* A soft halo of skin colour just outside the outline. At small sizes
            this is what keeps the edge from looking cut out with scissors. */}
        <filter id={id("nb-fuzz")} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>

        <clipPath id={id("nb-silhouette")}>
          <path d={silhouette} />
        </clipPath>
      </defs>

      {/* Contact shadow sits under everything and tracks the creature's width,
          so a hatchling does not float above a shadow built for an adult. */}
      <ellipse
        className="nb-ground"
        cx="100"
        cy={body.baseY + body.ry * 1.06}
        rx={body.rx * 0.82}
        ry={body.ry * 0.17}
        fill={ref("nb-ground")}
      />

      {/* Leaves sit behind the head so the silhouette stays the hero shape. */}
      <g className="nb-leaves">
        {angles.map((angle, index) => (
          <g
            key={angle}
            className={`nb-leaf-anchor nb-leaf-anchor-${index + 1}`}
            transform={`translate(${tipX} ${body.tipY + 4})`}
          >
            {/*
             * The anchor owns only the SVG translation to the tip. The inner
             * group owns rotation and animation. Keeping those transforms on
             * separate nodes prevents SVG transform-origin from rotating a
             * leaf around a translated viewport coordinate and visually
             * throwing mature leaves across the room.
             */}
            <g
              className={`nb-leaf nb-leaf-${index + 1}`}
              style={{ ["--leaf-angle" as string]: `${angle}deg`, ["--leaf-delay" as string]: `${index * -0.7}s` }}
            >
              <path d={leafShape(leafW, leafH)} fill={ref("nb-leaf")} />
              <path
                d={`M 0 -2 L 0 ${-leafH * 0.82}`}
                stroke="var(--leaf-vein)"
                strokeWidth="1.4"
                strokeLinecap="round"
                opacity="0.5"
                fill="none"
              />
              {/* A sliver of light on the same side as everything else. */}
              <path
                d={`M ${-leafW * 0.34} ${-leafH * 0.3} C ${-leafW * 0.5} ${-leafH * 0.62} ${-leafW * 0.2} ${-leafH * 0.84} ${-leafW * 0.06} ${-leafH * 0.86}`}
                stroke="var(--leaf-vein)"
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.34"
                fill="none"
              />
            </g>
          </g>
        ))}
      </g>

      <MorphFeatures morphology={look.morphology} profile={profile} />

      {profile.arms !== "none" && (
        <g className="nb-arms">
          {[-1, 1].map((side) => (
            <path
              key={side}
              className={`nb-arm ${side < 0 ? "nb-arm-left" : "nb-arm-right"}`}
              d={`M ${100 + side * body.rx * 0.82} ${body.baseY + body.ry * 0.18}
                  q ${side * armLength} ${armLength * 0.34} ${side * armLength * 0.92} ${armLength * 0.92}`}
              stroke="var(--skin-deep)"
              strokeWidth={armLength * 0.62}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        </g>
      )}

      <g className="nb-feet">
        {[-1, 1].map((side) => (
          <ellipse
            key={side}
            className="nb-foot"
            cx={100 + side * footX}
            cy={footY}
            rx={11 * footScale}
            ry={7.5 * footScale}
            fill="var(--foot)"
          />
        ))}
      </g>

      <g className="nb-torso">
        {/* Soft outer halo, then the hard silhouette on top of it. */}
        <path d={silhouette} fill="var(--skin-mid)" opacity="0.5" filter={ref("nb-fuzz")} />
        <path className="nb-skin" d={silhouette} fill={ref("nb-skin")} />

        <g clipPath={ref("nb-silhouette")}>
          <path d={bellyPath(body)} fill={ref("nb-belly")} />
          <path className="nb-diet-wash" d={silhouette} fill="var(--diet-tint, transparent)" />
          <g className="nb-cloud-texture" fill="var(--rim)">
            <circle cx="62" cy="103" r="19" /><circle cx="92" cy="88" r="23" /><circle cx="128" cy="94" r="21" />
            <circle cx="148" cy="125" r="18" /><circle cx="116" cy="145" r="24" /><circle cx="74" cy="142" r="22" />
          </g>
          <g className="nb-markings">
            {look.markings.includes("violet-flecks") && <><circle cx="66" cy="117" r="4" /><circle cx="142" cy="132" r="3" /><circle cx="122" cy="92" r="2.5" /></>}
            {look.markings.includes("teal-spots") && <><ellipse cx="64" cy="135" rx="7" ry="4" /><ellipse cx="137" cy="112" rx="5" ry="8" /></>}
            {look.markings.includes("gold-sparks") && <><path d="M 65 108 l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" /><path d="M 139 131 l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" /></>}
            {look.markings.includes("rose-hearts") && <path d="M 100 111 C 91 101 80 110 84 120 C 87 128 100 136 100 136 C 100 136 113 128 116 120 C 120 110 109 101 100 111 Z" />}
            {look.markings.includes("pastel-swirl") && <path className="nb-mark-stroke" d="M 72 137 C 75 112 105 105 119 120 C 132 134 116 151 100 145 C 89 141 91 130 100 129" />}
            {look.markings.includes("leaf-bud") && <path d="M 132 119 C 116 111 113 130 129 136 C 142 132 145 119 132 119 Z" />}
            {look.markings.includes("prism-edge") && <path className="nb-mark-stroke" d={silhouette} />}
          </g>
          <path d={silhouette} fill={ref("nb-shade")} />
          <CareSurface />
          <path d={silhouette} fill={ref("nb-sheen")} />
          {/* Rim light: the outline redrawn thick, nudged toward the light, and
              clipped — so only the lit edge survives. */}
          <path
            className="nb-rim"
            d={silhouette}
            fill="none"
            stroke="var(--rim)"
            strokeWidth="6"
            opacity="0.38"
            transform={`translate(${LIGHT.x * 16} ${LIGHT.y * 16})`}
          />
        </g>
      </g>

      <g className="nb-face">
        {[-1, 1].map((side) => (
          <ellipse
            key={side}
            className="nb-cheek"
            cx={100 + side * face.cheekGap}
            cy={face.eyeY + face.eyeR * 1.15}
            rx={face.cheekR * 1.12}
            ry={face.cheekR * 0.84}
            fill={ref("nb-cheek")}
          />
        ))}

        <g className="nb-eyes">
          {[-1, 1].map((side) => {
            const ex = 100 + side * face.eyeGap;
            const pr = face.eyeR * face.pupil;
            return (
              <g key={side} className={`nb-eye ${side < 0 ? "nb-eye-left" : "nb-eye-right"}`}>
                <ellipse cx={ex} cy={face.eyeY} rx={face.eyeR} ry={face.eyeR * 1.1} fill={ref("nb-iris")} />
                <g className="nb-gaze">
                  {/* Two highlights, the second much smaller and opposite the
                      first. One alone reads as a sticker; two read as wet. */}
                  <ellipse
                    className="nb-spark"
                    cx={ex + face.eyeR * LIGHT.x * 1.5}
                    cy={face.eyeY + face.eyeR * LIGHT.y * 1.5}
                    rx={pr * 0.56}
                    ry={pr * 0.62}
                    fill="var(--eye-spark)"
                  />
                  <circle
                    cx={ex - face.eyeR * LIGHT.x * 1.6}
                    cy={face.eyeY - face.eyeR * LIGHT.y * 1.1}
                    r={pr * 0.24}
                    fill="var(--eye-spark)"
                    opacity="0.66"
                  />
                </g>
                {/* Drawn as a lid that drops, so a blink is one CSS transform. */}
                <ellipse
                  className="nb-lid"
                  cx={ex}
                  cy={face.eyeY}
                  rx={face.eyeR * 1.08}
                  ry={face.eyeR * 1.18}
                  fill="var(--skin-mid)"
                />
              </g>
            );
          })}
        </g>

        <path
          className="nb-mouth"
          d={`M ${100 - face.mouthW / 2} ${face.mouthY}
              Q 100 ${face.mouthY + face.mouthW * 0.72} ${100 + face.mouthW / 2} ${face.mouthY}
              Q 100 ${face.mouthY + face.mouthW * 1.02} ${100 - face.mouthW / 2} ${face.mouthY} Z`}
          fill="var(--eye)"
        />
        <ellipse className="nb-tongue" cx="100" cy={face.mouthY + face.mouthW * 0.56} rx={face.mouthW * 0.25} ry={face.mouthW * 0.13} fill="var(--cheek)" opacity="0.9" />
      </g>
    </svg>
  );
}
