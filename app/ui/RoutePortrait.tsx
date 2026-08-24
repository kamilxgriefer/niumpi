"use client";

import Image from "next/image";
import { routeMap } from "../game/config/routes";
import type { RouteId } from "../game/types";

/** The authored form the player will actually meet at the end of this route. */
export function RoutePortrait({ id, size = 72 }: { id: RouteId; size?: number }) {
  const route = routeMap[id];
  if (!route) return null;

  return (
    <span
      className={`route-portrait portrait-${id}`}
      style={{ width: size, height: size }}
    >
      <Image
        className="route-portrait-image"
        src={`/assets/niumpi/forms/${id}.webp`}
        alt={`${route.name} — ${route.tagline}`}
        width={size}
        height={size}
        sizes={`${size}px`}
      />
    </span>
  );
}
