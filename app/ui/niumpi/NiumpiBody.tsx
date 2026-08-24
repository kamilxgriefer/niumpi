import { useId } from "react";
import type { StageProfile } from "../../game/config/growth.ts";
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

export function NiumpiBody({ profile }: { profile: StageProfile }) {
  const { body, face } = profile;
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
  const leafH = 26 + rise * 0.24;
  const leafW = leafH * 0.42;
  const angles = LEAF_FAN[profile.leaves] ?? LEAF_FAN[3];

  const armLength = { none: 0, buds: 11, short: 17, full: 23 }[profile.arms];
  const footScale = { tucked: 0.72, small: 0.88, full: 1 }[profile.feet];
  const footY = body.baseY + body.ry * 0.94;
  const footX = body.rx * 0.46;

  const silhouette = bodyPath(body);

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
            className={`nb-leaf nb-leaf-${index + 1}`}
            style={{ ["--leaf-angle" as string]: `${angle}deg`, ["--leaf-delay" as string]: `${index * -0.7}s` }}
            transform={`translate(${tipX} ${body.tipY + 4})`}
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
        ))}
      </g>

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
          <path d={silhouette} fill={ref("nb-shade")} />
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
              q ${face.mouthW / 2} ${face.mouthW * 0.8} ${face.mouthW} 0`}
          fill="none"
          stroke="var(--eye)"
          strokeWidth={face.mouthW * 0.22}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
