"use client";

import type { MinigameId } from "../game/types";

/**
 * A small illustrated scene per minigame, so the games library reads as six
 * different activities instead of six variations on the same icon. Drawn on a
 * 64×40 stage with the game palette, sized by CSS.
 */

const SKY = "#2E175E";
const SKY_SOFT = "#432174";

function Frame({ children, tint = SKY }: { children: React.ReactNode; tint?: string }) {
  return (
    <>
      <rect x="0" y="0" width="64" height="40" rx="8" fill={tint} />
      <rect x="0" y="0" width="64" height="40" rx="8" fill="url(#tile-sheen)" />
      {children}
    </>
  );
}

export function GameTileArt({ id, className }: { id: MinigameId; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 40" role="presentation" aria-hidden="true">
      <defs>
        <linearGradient id="tile-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>

      {id === "dewdrop-dash" && (
        <Frame>
          {/* Drops falling toward a catcher. */}
          <ellipse cx="16" cy="9" rx="3" ry="4" fill="#49D4D0" />
          <ellipse cx="34" cy="15" rx="2.6" ry="3.6" fill="#66A7FF" />
          <ellipse cx="48" cy="7" rx="2.4" ry="3.2" fill="#49D4D0" opacity="0.8" />
          <circle cx="30" cy="31" r="7" fill="#FF7A5C" />
          <ellipse cx="30" cy="33" rx="4" ry="3" fill="#FFE0D2" opacity="0.6" />
          <circle cx="27.6" cy="30" r="1.2" fill="#33213F" />
          <circle cx="32.4" cy="30" r="1.2" fill="#33213F" />
          <ellipse cx="30" cy="22.5" rx="2.4" ry="3.2" fill="#49D4D0" />
        </Frame>
      )}

      {id === "moonberry-mix" && (
        <Frame>
          {/* Four pads, one lit — the memory sequence. */}
          <rect x="12" y="8" width="16" height="11" rx="4" fill="#9B7BE8" />
          <rect x="34" y="8" width="16" height="11" rx="4" fill="#FFFFFF" opacity="0.28" />
          <rect x="12" y="22" width="16" height="11" rx="4" fill="#FFFFFF" opacity="0.28" />
          <rect x="34" y="22" width="16" height="11" rx="4" fill="#49D4D0" opacity="0.9" />
          <circle cx="20" cy="13.5" r="2.6" fill="#FFF4EC" opacity="0.9" />
        </Frame>
      )}

      {id === "cloud-stack" && (
        <Frame>
          {/* A tower of clouds, narrowing as it rises. */}
          <rect x="16" y="28" width="32" height="7" rx="3.5" fill="#FFF4EC" opacity="0.95" />
          <rect x="20" y="20" width="24" height="7" rx="3.5" fill="#FFF4EC" opacity="0.85" />
          <rect x="24" y="12" width="16" height="7" rx="3.5" fill="#FFF4EC" opacity="0.7" />
          <rect x="28" y="5" width="9" height="6" rx="3" fill="#FFF4EC" opacity="0.5" />
        </Frame>
      )}

      {id === "leafbeat" && (
        <Frame>
          {/* Notes travelling down a lane to the hit line. */}
          <rect x="26" y="0" width="12" height="40" fill="#FFFFFF" opacity="0.1" />
          <rect x="20" y="29" width="24" height="2.6" rx="1.3" fill="#FFC857" />
          <ellipse cx="32" cy="30" rx="5" ry="6" fill="#64D7A5" />
          <ellipse cx="32" cy="17" rx="4.2" ry="5.2" fill="#49D4D0" opacity="0.85" />
          <ellipse cx="32" cy="6" rx="3.6" ry="4.6" fill="#49D4D0" opacity="0.5" />
          <circle cx="14" cy="12" r="2" fill="#FFC857" opacity="0.8" />
          <circle cx="50" cy="20" r="1.6" fill="#FFC857" opacity="0.6" />
        </Frame>
      )}

      {id === "hide-squeak" && (
        <Frame>
          {/* Furniture with a tail poking out from behind. */}
          <rect x="6" y="20" width="20" height="14" rx="4" fill="#A487E0" />
          <rect x="38" y="16" width="20" height="18" rx="3" fill="#C99A72" />
          <rect x="41" y="19" width="14" height="4" rx="1.5" fill="#FFF4EC" opacity="0.5" />
          <circle cx="32" cy="30" r="5" fill="#FF7A5C" />
          <circle cx="30" cy="29" r="1" fill="#33213F" />
          <circle cx="34" cy="29" r="1" fill="#33213F" />
          <ellipse cx="32" cy="24" rx="2" ry="2.6" fill="#49D4D0" />
        </Frame>
      )}

      {id === "dream-path" && (
        <Frame tint={SKY_SOFT}>
          {/* A forking night path under stars. */}
          <path d="M32 40 L32 26 L20 12" stroke="#C9A6FF" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M32 26 L45 12" stroke="#C9A6FF" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.6" />
          <circle cx="20" cy="10" r="3" fill="#FFC857" />
          <circle cx="45" cy="10" r="3" fill="#FFFFFF" opacity="0.5" />
          <circle cx="10" cy="20" r="1.2" fill="#FFFFFF" opacity="0.7" />
          <circle cx="54" cy="24" r="1" fill="#FFFFFF" opacity="0.6" />
          <circle cx="48" cy="32" r="1.4" fill="#FFFFFF" opacity="0.5" />
        </Frame>
      )}
    </svg>
  );
}
