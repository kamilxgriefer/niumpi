import type { StageProfile } from "../../game/config/growth.ts";
import { bellyPath, bodyPath, tipRise } from "../../game/config/growth.ts";

/**
 * The creature's whole visible form, generated from one stage profile.
 *
 * Structure only. Colour comes from CSS custom properties so a palette or an
 * evolution route can restyle it without touching geometry, and motion comes
 * from NiumpiAnimationController writing --gaze-* and behavior-* on the root.
 * Nothing here re-renders on an animation frame.
 */

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

  return (
    <svg className="nb" viewBox="0 0 200 200" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="nb-skin" x1="0.25" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor="var(--skin-light)" />
          <stop offset="55%" stopColor="var(--skin-mid)" />
          <stop offset="100%" stopColor="var(--skin-deep)" />
        </linearGradient>
        <radialGradient id="nb-belly" cx="0.5" cy="0.42" r="0.62">
          <stop offset="0%" stopColor="var(--belly)" stopOpacity="0.85" />
          <stop offset="70%" stopColor="var(--belly)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--belly)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nb-cheek" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="var(--cheek)" stopOpacity="0.8" />
          <stop offset="100%" stopColor="var(--cheek)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="nb-leaf" x1="0.2" y1="1" x2="0.8" y2="0">
          <stop offset="0%" stopColor="var(--leaf-deep)" />
          <stop offset="100%" stopColor="var(--leaf-light)" />
        </linearGradient>
        <clipPath id="nb-silhouette">
          <path d={bodyPath(body)} />
        </clipPath>
      </defs>

      {/* Leaves sit behind the head so the silhouette stays the hero shape. */}
      <g className="nb-leaves">
        {angles.map((angle, index) => (
          <g
            key={angle}
            className={`nb-leaf nb-leaf-${index + 1}`}
            style={{ ["--leaf-angle" as string]: `${angle}deg`, ["--leaf-delay" as string]: `${index * -0.7}s` }}
            transform={`translate(${tipX} ${body.tipY + 4})`}
          >
            <path d={leafShape(leafW, leafH)} fill="url(#nb-leaf)" />
            <path
              d={`M 0 -2 L 0 ${-leafH * 0.82}`}
              stroke="var(--leaf-vein)"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity="0.5"
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
        <path className="nb-skin" d={bodyPath(body)} fill="url(#nb-skin)" />
        <g clipPath="url(#nb-silhouette)">
          <path d={bellyPath(body)} fill="url(#nb-belly)" />
          {/* A soft rim of light along the upper left keeps the form from
              reading flat at small sizes. */}
          <path
            className="nb-rim"
            d={bodyPath(body)}
            fill="none"
            stroke="var(--rim)"
            strokeWidth="7"
            opacity="0.4"
            transform="translate(-3 -4)"
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
            rx={face.cheekR}
            ry={face.cheekR * 0.74}
            fill="url(#nb-cheek)"
          />
        ))}

        <g className="nb-eyes">
          {[-1, 1].map((side) => {
            const ex = 100 + side * face.eyeGap;
            const pr = face.eyeR * face.pupil;
            return (
              <g key={side} className={`nb-eye ${side < 0 ? "nb-eye-left" : "nb-eye-right"}`}>
                <ellipse cx={ex} cy={face.eyeY} rx={face.eyeR} ry={face.eyeR * 1.1} fill="var(--eye)" />
                <g className="nb-gaze">
                  <circle
                    className="nb-spark"
                    cx={ex + face.eyeR * 0.3}
                    cy={face.eyeY - face.eyeR * 0.36}
                    r={pr * 0.52}
                    fill="var(--eye-spark)"
                  />
                  <circle
                    cx={ex - face.eyeR * 0.3}
                    cy={face.eyeY + face.eyeR * 0.34}
                    r={pr * 0.22}
                    fill="var(--eye-spark)"
                    opacity="0.7"
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
