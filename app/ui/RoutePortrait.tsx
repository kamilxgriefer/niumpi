"use client";

import type { CSSProperties } from "react";
import { routeMap } from "../game/config/routes";
import type { RouteId } from "../game/types";

/**
 * A small portrait of what a Niumpi becomes on each evolution route. Drawn from
 * the route's own palette so the five forms read as distinct creatures rather
 * than five coloured dots, and so a new route needs no new artwork.
 */
export function RoutePortrait({ id, size = 44 }: { id: RouteId; size?: number }) {
  const route = routeMap[id];
  if (!route) return null;
  const { body, belly, aura, leaf } = route.palette;

  return (
    <svg
      className={`route-portrait portrait-${id}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={`${route.name} — ${route.tagline}`}
      style={{ "--portrait-aura": aura } as CSSProperties}
    >
      <defs>
        <radialGradient id={`body-${id}`} cx="38%" cy="30%" r="74%">
          <stop offset="0%" stopColor={belly} />
          <stop offset="58%" stopColor={body} />
          <stop offset="100%" stopColor={aura} />
        </radialGradient>
      </defs>

      {/* Aura — the visual tell that a route is more than a colour swap. */}
      <ellipse cx="24" cy="27" rx="20" ry="19" fill={aura} opacity="0.22" />

      {/* Leaves: count and spread differ per route silhouette. */}
      {id === "sparkleap" && (
        <>
          <path d="M12 20C8 16 8 10 12 7c3 4 3 10 0 13Z" fill={leaf} opacity="0.9" />
          <path d="M36 20c4-4 4-10 0-13-3 4-3 10 0 13Z" fill={leaf} opacity="0.9" />
        </>
      )}
      {id === "moonveil" && <path d="M24 13c-5-2-8-7-7-12 5 1 9 6 7 12Z" fill={leaf} opacity="0.92" />}
      {id === "bloomheart" && (
        <>
          <ellipse cx="17" cy="9" rx="5" ry="6" fill={leaf} opacity="0.9" />
          <ellipse cx="31" cy="9" rx="5" ry="6" fill={leaf} opacity="0.9" />
          <ellipse cx="24" cy="6" rx="5" ry="6" fill={leaf} opacity="0.95" />
        </>
      )}
      {id === "mistwander" && <path d="M24 14C20 9 21 3 26 0c2 6 1 11-2 14Z" fill={leaf} opacity="0.92" />}
      {id === "prismatic" && (
        <>
          <path d="M24 12 20 4l4-3 4 3-4 8Z" fill={leaf} opacity="0.95" />
          <path d="M13 17 9 11l4-2 3 5-3 3Z" fill={leaf} opacity="0.7" />
          <path d="M35 17l4-6-4-2-3 5 3 3Z" fill={leaf} opacity="0.7" />
        </>
      )}

      {/* Body — the shared Niumpi teardrop silhouette. */}
      <path
        d="M24 10c8 0 16 9 16 19 0 7-7 12-16 12S8 36 8 29c0-10 8-19 16-19Z"
        fill={`url(#body-${id})`}
      />
      <ellipse cx="24" cy="33" rx="9" ry="7" fill={belly} opacity="0.55" />

      <ellipse cx="19" cy="27" rx="3.1" ry="3.9" fill="#33213F" />
      <ellipse cx="29" cy="27" rx="3.1" ry="3.9" fill="#33213F" />
      <circle cx="18" cy="25.6" r="1.1" fill="#FFF4EC" />
      <circle cx="28" cy="25.6" r="1.1" fill="#FFF4EC" />
      <path d="M21.4 34.2a3.4 3.4 0 0 0 5.2 0" stroke="#8E2F41" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      <ellipse cx="14" cy="32" rx="2.4" ry="1.6" fill="#F47C82" opacity="0.4" />
      <ellipse cx="34" cy="32" rx="2.4" ry="1.6" fill="#F47C82" opacity="0.4" />
    </svg>
  );
}
