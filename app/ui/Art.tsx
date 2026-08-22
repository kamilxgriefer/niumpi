"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * One inline-SVG symbol set for the whole game. Everything is drawn from
 * primitives on a 24×24 grid and coloured through CSS custom properties, so a
 * symbol scales to any size, follows the theme and never loads a raster.
 */

type Shape = ReactNode;

const leafD = "M12 2.5c4 2 6.4 5 6.4 8.6 0 3.6-2.9 6.4-6.4 6.4s-6.4-2.8-6.4-6.4C5.6 7.5 8 4.5 12 2.5Z";
const dropD = "M12 3.2c3.2 4 5 6.6 5 9.1a5 5 0 1 1-10 0c0-2.5 1.8-5.1 5-9.1Z";
const starD = "M12 2.6l2.5 5.6 6.1.6-4.6 4.1 1.3 6-5.3-3.1-5.3 3.1 1.3-6L3.4 8.8l6.1-.6L12 2.6Z";
const heartD = "M12 20.5S3.8 15.2 3.8 9.6A4.6 4.6 0 0 1 12 6.9a4.6 4.6 0 0 1 8.2 2.7c0 5.6-8.2 10.9-8.2 10.9Z";
const moonD = "M17.6 15.4A7.4 7.4 0 0 1 8.1 5.2a7.6 7.6 0 1 0 9.5 10.2Z";
const cloudD = "M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.3A3.6 3.6 0 0 1 16.8 18Z";
const sunD = "M12 7.4a4.6 4.6 0 1 1 0 9.2 4.6 4.6 0 0 1 0-9.2Z";

const rays = [0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
  <rect key={angle} x="11.2" y="1.6" width="1.6" height="3.4" rx=".8"
    fill="var(--art-2)" transform={`rotate(${angle} 12 12)`} />
));

export const artShapes: Record<string, Shape> = {
  /* ---- creature & mood ---- */
  seed: <><ellipse cx="12" cy="14" rx="5.6" ry="6.6" fill="var(--art-1)" /><path d="M12 7.6c1.6-2 3.4-2.8 5-2.6-.4 2-1.8 3.4-3.6 4Z" fill="var(--art-2)" /><circle cx="10" cy="12" r="1" fill="var(--art-3)" opacity=".5" /></>,
  sprout: <><path d={leafD} fill="var(--art-2)" transform="scale(.62) translate(7 6)" /><ellipse cx="12" cy="16" rx="5" ry="4.6" fill="var(--art-1)" /></>,
  bloom: <><circle cx="12" cy="12" r="6.4" fill="var(--art-1)" />{[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="12" cy="5.4" rx="2.2" ry="3" fill="var(--art-2)" transform={`rotate(${a} 12 12)`} />)}</>,
  branch: <><path d="M12 21V9" stroke="var(--art-2)" strokeWidth="1.8" strokeLinecap="round" fill="none" /><path d="M12 13 6.5 8M12 13l5.5-5" stroke="var(--art-2)" strokeWidth="1.6" strokeLinecap="round" fill="none" /><circle cx="6" cy="7.4" r="2.4" fill="var(--art-1)" /><circle cx="18" cy="7.4" r="2.4" fill="var(--art-3)" /><circle cx="12" cy="4.6" r="2.4" fill="var(--art-1)" /></>,
  mature: <><ellipse cx="12" cy="14.4" rx="6.4" ry="5.8" fill="var(--art-1)" /><path d={leafD} fill="var(--art-2)" transform="scale(.5) translate(12 2)" /><circle cx="9.6" cy="13.4" r="1.2" fill="var(--art-3)" /><circle cx="14.4" cy="13.4" r="1.2" fill="var(--art-3)" /></>,
  legacy: <><path d={starD} fill="var(--art-2)" transform="scale(.7) translate(5 1)" /><ellipse cx="12" cy="17" rx="5.4" ry="4" fill="var(--art-1)" /></>,
  hatch: <><path d="M5.8 15.6 12 12l6.2 3.6A6.2 6.2 0 0 1 5.8 15.6Z" fill="var(--art-1)" /><path d="M6.2 11.6 12 4l5.8 7.6-2.6-1.4-1.6 1.6-2-1.8-1.8 1.8-1.6-1.6Z" fill="var(--art-2)" /></>,
  excited: <><circle cx="12" cy="12" r="7" fill="var(--art-1)" /><path d={starD} fill="var(--art-2)" transform="scale(.42) translate(15 3)" /></>,
  happy: <><circle cx="12" cy="12" r="7" fill="var(--art-1)" /><path d="M8.6 13.4a3.6 3.6 0 0 0 6.8 0" stroke="var(--art-3)" strokeWidth="1.6" fill="none" strokeLinecap="round" /></>,
  tired: <><circle cx="12" cy="12" r="7" fill="var(--art-1)" /><path d="M8.6 11h2.4M13 11h2.4" stroke="var(--art-3)" strokeWidth="1.6" strokeLinecap="round" /></>,
  hungry: <><circle cx="12" cy="12" r="7" fill="var(--art-1)" /><circle cx="12" cy="14" r="2" fill="var(--art-3)" /></>,
  curious: <><circle cx="12" cy="12" r="7" fill="var(--art-1)" /><path d="M10 9.4a2.2 2.2 0 1 1 2.4 3.2v1" stroke="var(--art-3)" strokeWidth="1.5" fill="none" strokeLinecap="round" /><circle cx="12.4" cy="16" r=".9" fill="var(--art-3)" /></>,
  upset: <><circle cx="12" cy="12" r="7" fill="var(--art-1)" /><path d="M9 15a3.4 3.4 0 0 1 6 0" stroke="var(--art-3)" strokeWidth="1.6" fill="none" strokeLinecap="round" /></>,
  dreaming: <><path d={moonD} fill="var(--art-1)" /><circle cx="7" cy="7" r="1" fill="var(--art-2)" /><circle cx="5" cy="11" r=".7" fill="var(--art-2)" /></>,
  evolving: <><path d={starD} fill="var(--art-2)" /><circle cx="12" cy="12" r="3" fill="var(--art-1)" /></>,

  /* ---- food ---- */
  moonberry: <><circle cx="12" cy="14" r="5.4" fill="var(--art-1)" /><path d="M12 8.6c0-2 1.4-3.4 3.4-3.8-.2 2-1.4 3.4-3.4 3.8Z" fill="var(--art-2)" /><circle cx="10" cy="12.4" r="1.2" fill="var(--art-3)" opacity=".55" /></>,
  cloudpuff: <><path d={cloudD} fill="var(--art-1)" /><circle cx="9.6" cy="13.6" r="1" fill="var(--art-3)" opacity=".5" /></>,
  dewdrop: <><path d={dropD} fill="var(--art-1)" /><ellipse cx="10.2" cy="13" rx="1.2" ry="1.8" fill="var(--art-3)" opacity=".6" /></>,
  sunseed: <><ellipse cx="12" cy="13" rx="4.2" ry="5.6" fill="var(--art-1)" />{rays.slice(0, 4)}<ellipse cx="10.6" cy="11.4" rx="1" ry="1.6" fill="var(--art-3)" opacity=".55" /></>,
  heartberry: <><path d={heartD} fill="var(--art-1)" /><path d="M12 6.4c0-1.6 1.2-2.6 2.8-3-.2 1.6-1.2 2.6-2.8 3Z" fill="var(--art-2)" /></>,
  dreammint: <><path d={leafD} fill="var(--art-1)" transform="scale(.86) translate(2 2)" /><path d="M12 5v13" stroke="var(--art-2)" strokeWidth="1.2" strokeLinecap="round" /></>,
  starmush: <><path d="M4.6 12a7.4 7.4 0 0 1 14.8 0Z" fill="var(--art-1)" /><rect x="10" y="12" width="4" height="7" rx="2" fill="var(--art-2)" /><circle cx="9" cy="9.6" r="1" fill="var(--art-3)" /><circle cx="15" cy="10" r=".8" fill="var(--art-3)" /></>,
  emberfruit: <><circle cx="12" cy="14" r="5.4" fill="var(--art-1)" /><path d="M12 4c2.6 2.6 3.2 4.6 1.6 6.2C11.4 12 10 9.6 12 4Z" fill="var(--art-2)" /></>,
  frostpetal: <>{[0, 60, 120].map((a) => <rect key={a} x="11.2" y="4" width="1.6" height="16" rx=".8" fill="var(--art-1)" transform={`rotate(${a} 12 12)`} />)}<circle cx="12" cy="12" r="2.2" fill="var(--art-2)" /></>,
  honeydew: <><ellipse cx="12" cy="13.4" rx="6" ry="5.4" fill="var(--art-1)" /><path d="M7 12c2 1.6 8 1.6 10 0" stroke="var(--art-3)" strokeWidth="1.2" fill="none" opacity=".5" /></>,
  gigglenut: <><ellipse cx="12" cy="13" rx="4.6" ry="6" fill="var(--art-1)" /><path d="M9 10.4c2 1.4 4 1.4 6 0M9 15c2 1.4 4 1.4 6 0" stroke="var(--art-3)" strokeWidth="1.1" fill="none" opacity=".55" /></>,
  tidepearl: <><circle cx="12" cy="13" r="5.4" fill="var(--art-1)" /><path d="M7.4 13c1.4-1.6 3-1.6 4.6 0s3.2 1.6 4.6 0" stroke="var(--art-3)" strokeWidth="1.3" fill="none" /></>,
  auroraleaf: <><path d={leafD} fill="var(--art-1)" /><path d="M9 12c2-2 4-2 6 0" stroke="var(--art-2)" strokeWidth="1.4" fill="none" /></>,
  rootcandy: <><path d="M12 4c2.4 0 3.8 2 3.8 6S13.6 20 12 20s-3.8-6-3.8-10S9.6 4 12 4Z" fill="var(--art-1)" /><path d="M12 4c1.6-1 3-1 4.4-.4-1 1.6-2.4 2.2-4.4 1.8Z" fill="var(--art-2)" /></>,

  /* ---- room & world ---- */
  moonlamp: <><path d={moonD} fill="var(--art-1)" transform="scale(.7) translate(5 1)" /><rect x="10.6" y="14" width="2.8" height="6" rx="1" fill="var(--art-2)" /><rect x="8" y="19.4" width="8" height="2" rx="1" fill="var(--art-2)" /></>,
  sofa: <><rect x="3" y="11" width="18" height="7" rx="2.6" fill="var(--art-1)" /><rect x="5" y="8" width="14" height="5" rx="2.4" fill="var(--art-2)" /></>,
  rug: <><ellipse cx="12" cy="14" rx="9" ry="5" fill="var(--art-1)" /><path d={starD} fill="var(--art-2)" transform="scale(.4) translate(17 22)" /></>,
  tent: <><path d="M12 4 21 19H3Z" fill="var(--art-1)" /><path d="M12 9.6 16 19H8Z" fill="var(--art-2)" /></>,
  telescope: <><rect x="5" y="9" width="13" height="4" rx="2" fill="var(--art-1)" transform="rotate(-22 12 11)" /><path d="M10 15v5M7 20h6" stroke="var(--art-2)" strokeWidth="1.8" strokeLinecap="round" /></>,
  radio: <><rect x="3.5" y="8" width="17" height="10" rx="2.4" fill="var(--art-1)" /><circle cx="8.4" cy="13" r="2.6" fill="var(--art-2)" /><rect x="13.4" y="10.6" width="5" height="1.6" rx=".8" fill="var(--art-2)" /><path d="M16 8 19 4" stroke="var(--art-2)" strokeWidth="1.4" strokeLinecap="round" /></>,
  shelf: <><rect x="4" y="4.5" width="16" height="15" rx="2" fill="var(--art-1)" /><rect x="6" y="9.6" width="12" height="1.4" fill="var(--art-2)" /><rect x="6" y="14.4" width="12" height="1.4" fill="var(--art-2)" /></>,
  pot: <><path d="M7 11h10l-1.4 8H8.4Z" fill="var(--art-1)" /><path d={leafD} fill="var(--art-2)" transform="scale(.5) translate(12 2)" /></>,
  cushion: <><rect x="4.5" y="8" width="15" height="10" rx="4.4" fill="var(--art-1)" /><circle cx="12" cy="13" r="1.6" fill="var(--art-2)" /></>,
  window: <><rect x="4.5" y="4" width="15" height="16" rx="2.4" fill="var(--art-1)" /><path d="M12 4v16M4.5 12h15" stroke="var(--art-2)" strokeWidth="1.4" /></>,
  bed: <><path d="M4 18v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6Z" fill="var(--art-1)" /><rect x="6" y="11" width="6" height="4" rx="1.6" fill="var(--art-2)" /></>,
  chest: <><rect x="4" y="10" width="16" height="9" rx="2" fill="var(--art-1)" /><path d="M4 12.4h16" stroke="var(--art-2)" strokeWidth="1.6" /><rect x="10.8" y="11" width="2.4" height="4" rx="1.2" fill="var(--art-2)" /></>,
  mobile: <><path d="M4 5h16" stroke="var(--art-2)" strokeWidth="1.5" strokeLinecap="round" /><path d="M8 5v4M16 5v6M12 5v8" stroke="var(--art-2)" strokeWidth="1.1" /><path d={leafD} fill="var(--art-1)" transform="scale(.32) translate(13 24)" /><path d={leafD} fill="var(--art-1)" transform="scale(.32) translate(38 30)" /></>,
  fern: <><path d="M12 20V8" stroke="var(--art-2)" strokeWidth="1.5" strokeLinecap="round" />{[8, 11, 14].map((y, i) => <g key={y}><ellipse cx={12 - 3 + i * .4} cy={y} rx="3" ry="1.3" fill="var(--art-1)" transform={`rotate(-24 12 ${y})`} /><ellipse cx={12 + 3 - i * .4} cy={y} rx="3" ry="1.3" fill="var(--art-1)" transform={`rotate(24 12 ${y})`} /></g>)}</>,
  lanterns: <><path d="M3 6c6 3 12 3 18 0" stroke="var(--art-2)" strokeWidth="1.3" fill="none" />{[6, 12, 18].map((x, i) => <rect key={x} x={x - 1.6} y={7 + i % 2} width="3.2" height="4.4" rx="1.6" fill="var(--art-1)" />)}</>,
  projector: <><rect x="6" y="12" width="12" height="6" rx="2.4" fill="var(--art-1)" /><circle cx="12" cy="15" r="1.8" fill="var(--art-2)" /><path d={starD} fill="var(--art-2)" transform="scale(.3) translate(26 8)" /></>,
  mirror: <><ellipse cx="12" cy="11" rx="6" ry="7.4" fill="var(--art-1)" /><path d="M9 8c1.4-1.4 3.2-1.8 4.6-1.2" stroke="var(--art-3)" strokeWidth="1.3" fill="none" opacity=".6" /><rect x="10.6" y="18" width="2.8" height="3" rx="1" fill="var(--art-2)" /></>,
  yarn: <><circle cx="12" cy="13" r="6" fill="var(--art-1)" /><path d="M7 11c3 3 7 3 10 0M7.6 15.4c3 2 6 2 9 0" stroke="var(--art-3)" strokeWidth="1.2" fill="none" opacity=".6" /></>,
  chimes: <><path d="M5 5h14" stroke="var(--art-2)" strokeWidth="1.5" strokeLinecap="round" />{[8, 12, 16].map((x, i) => <rect key={x} x={x - .8} y="6" width="1.6" height={7 + i * 2} rx=".8" fill="var(--art-1)" />)}</>,
  maptable: <><rect x="3.5" y="9" width="17" height="4" rx="1.6" fill="var(--art-1)" /><path d="M6 13v7M18 13v7" stroke="var(--art-2)" strokeWidth="1.6" strokeLinecap="round" /><path d="M8 9l3-3 3 2 3-2v3Z" fill="var(--art-2)" /></>,
  crown: <><path d="M4 17 6 8l4 4 2-6 2 6 4-4 2 9Z" fill="var(--art-1)" /><rect x="4" y="17" width="16" height="2.6" rx="1.3" fill="var(--art-2)" /></>,
  scarf: <><path d="M6 6c4 3 8 3 12 0v4c-4 3-8 3-12 0Z" fill="var(--art-1)" /><rect x="8" y="12" width="3" height="8" rx="1.4" fill="var(--art-2)" /><rect x="13" y="12" width="3" height="6" rx="1.4" fill="var(--art-2)" /></>,
  pin: <><circle cx="12" cy="9" r="3.4" fill="var(--art-2)" />{[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="12" cy="5" rx="1.8" ry="2.6" fill="var(--art-1)" transform={`rotate(${a} 12 9)`} />)}<path d="M12 12v8" stroke="var(--art-2)" strokeWidth="1.4" strokeLinecap="round" /></>,
  cap: <><path d="M4.5 14a7.5 7.5 0 0 1 15 0Z" fill="var(--art-1)" /><rect x="3" y="14" width="18" height="2.6" rx="1.3" fill="var(--art-2)" /></>,

  /* ---- world & scene ---- */
  moongarden: <><path d={moonD} fill="var(--art-2)" transform="scale(.6) translate(9 1)" />{[6, 12, 18].map((x) => <g key={x}><path d="M0 0v-5" stroke="var(--art-1)" strokeWidth="1.3" transform={`translate(${x} 20)`} /><circle cx={x} cy="14" r="2.2" fill="var(--art-1)" /></g>)}</>,
  cloudocean: <><path d={cloudD} fill="var(--art-1)" transform="scale(.8) translate(3 -1)" /><path d="M2 17c3-2 5 2 8 0s5-2 8 0 4 1 4 1v4H2Z" fill="var(--art-2)" opacity=".8" /></>,
  embercave: <><path d="M3 20 8 6l4 8 4-8 5 14Z" fill="var(--art-1)" /><circle cx="12" cy="16" r="2.4" fill="var(--art-2)" /></>,
  rain: <><path d={cloudD} fill="var(--art-1)" transform="scale(.85) translate(2 -2)" />{[8, 12, 16].map((x, i) => <rect key={x} x={x} y={16 + (i % 2)} width="1.5" height="4" rx=".75" fill="var(--art-2)" transform={`rotate(12 ${x} 18)`} />)}</>,
  sunny: <><path d={sunD} fill="var(--art-1)" />{rays}</>,
  sun: <><path d={sunD} fill="var(--art-1)" />{rays}</>,
  cloudy: <><path d={cloudD} fill="var(--art-1)" /><path d={cloudD} fill="var(--art-2)" opacity=".55" transform="scale(.62) translate(3 6)" /></>,
  rainy: <><path d={cloudD} fill="var(--art-1)" transform="scale(.85) translate(2 -2)" />{[8, 12, 16].map((x, i) => <rect key={x} x={x} y={16 + (i % 2)} width="1.5" height="4" rx=".75" fill="var(--art-2)" />)}</>,
  storm: <><path d={cloudD} fill="var(--art-1)" transform="scale(.85) translate(2 -3)" /><path d="M12.6 13 9 19h2.6L10.6 23l4.4-6h-2.6Z" fill="var(--art-2)" /></>,
  starfall: <><path d={starD} fill="var(--art-1)" transform="scale(.55) translate(12 2)" /><path d="M5 18 9 14M4 13l3-3M9 20l3-3" stroke="var(--art-2)" strokeWidth="1.4" strokeLinecap="round" /></>,
  moon: <path d={moonD} fill="var(--art-1)" />,
  star: <path d={starD} fill="var(--art-1)" />,
  cloud: <path d={cloudD} fill="var(--art-1)" />,
  heart: <path d={heartD} fill="var(--art-1)" />,
  leaf: <path d={leafD} fill="var(--art-1)" />,
  drop: <path d={dropD} fill="var(--art-1)" />,
  berry: <><circle cx="12" cy="13.6" r="5.2" fill="var(--art-1)" /><path d="M12 8.4c0-2 1.4-3.2 3.2-3.6-.2 2-1.4 3.2-3.2 3.6Z" fill="var(--art-2)" /></>,
  note: <><circle cx="8.5" cy="17" r="3" fill="var(--art-1)" /><rect x="10.4" y="4" width="1.8" height="13" rx=".9" fill="var(--art-1)" /><path d="M11.4 4c3.6.6 5.6 2 6 4.2-1.6-1.4-3.6-2-6-1.8Z" fill="var(--art-2)" /></>,
  hush: <><circle cx="12" cy="12" r="7.6" fill="var(--art-1)" /><path d="M8 12h8" stroke="var(--art-3)" strokeWidth="1.8" strokeLinecap="round" /></>,
  path: <><path d="M8 21c0-5 8-5 8-10S8 8 8 3" stroke="var(--art-1)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeDasharray="3 3" /></>,
  wave: <path d="M2 10c3-3 5 3 8 0s5-3 8 0 4 0 4 0v8H2Z" fill="var(--art-1)" />,
  hill: <><path d="M2 19 9 8l5 7 3-4 5 8Z" fill="var(--art-1)" /><circle cx="17.4" cy="6" r="2.4" fill="var(--art-2)" /></>,
  tree: <><path d="M12 21v-6" stroke="var(--art-2)" strokeWidth="1.8" strokeLinecap="round" /><circle cx="12" cy="9.6" r="5.6" fill="var(--art-1)" /></>,
  tower: <><rect x="8" y="4" width="8" height="17" rx="1.6" fill="var(--art-1)" />{[7, 11, 15].map((y) => <rect key={y} x="10" y={y} width="4" height="2" rx="1" fill="var(--art-2)" />)}</>,
  flower: <><circle cx="12" cy="12" r="2.6" fill="var(--art-2)" />{[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="12" cy="6.6" rx="2.2" ry="3.2" fill="var(--art-1)" transform={`rotate(${a} 12 12)`} />)}</>,
  root: <><path d="M12 3v12" stroke="var(--art-2)" strokeWidth="1.6" strokeLinecap="round" /><path d="M12 21c-3-2-4.4-4-4.4-6h8.8c0 2-1.4 4-4.4 6Z" fill="var(--art-1)" /></>,
  plant: <><path d="M7 12h10l-1.2 8H8.2Z" fill="var(--art-2)" /><path d={leafD} fill="var(--art-1)" transform="scale(.5) translate(12 2)" /></>,
  puddle: <><ellipse cx="12" cy="16" rx="8" ry="3.4" fill="var(--art-1)" /><path d="M12 3c2.6 3.6 4 5.8 4 7.4a4 4 0 1 1-8 0C8 8.8 9.4 6.6 12 3Z" fill="var(--art-2)" opacity=".8" /></>,
  ember: <><path d="M12 3c3 4 4.6 6.4 4.6 8.6a4.6 4.6 0 1 1-9.2 0C7.4 9.4 9 7 12 3Z" fill="var(--art-1)" /><circle cx="12" cy="14" r="2.2" fill="var(--art-2)" /></>,
  snow: <>{[0, 60, 120].map((a) => <rect key={a} x="11.3" y="4" width="1.4" height="16" rx=".7" fill="var(--art-1)" transform={`rotate(${a} 12 12)`} />)}</>,
  prism: <><path d="M12 4 20 19H4Z" fill="var(--art-1)" /><path d="M12 4v15" stroke="var(--art-2)" strokeWidth="1.4" /></>,
  teal: <circle cx="12" cy="12" r="7" fill="var(--art-1)" />,
  violet: <circle cx="12" cy="12" r="7" fill="var(--art-1)" />,
  spark: <path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8Z" fill="var(--art-1)" />,
  loop: <><circle cx="12" cy="12" r="6.4" stroke="var(--art-1)" strokeWidth="2.2" fill="none" /><path d="M15 5.6 18 8l-3 2.4Z" fill="var(--art-1)" /></>,
  gift: <><rect x="4" y="10" width="16" height="10" rx="2" fill="var(--art-1)" /><rect x="3" y="7" width="18" height="4" rx="1.6" fill="var(--art-2)" /><rect x="10.6" y="7" width="2.8" height="13" fill="var(--art-3)" opacity=".5" /></>,
  craft: <><path d="M5 19 15 9l-2-2L3 17Z" fill="var(--art-1)" /><rect x="14" y="4" width="6" height="6" rx="1.6" fill="var(--art-2)" transform="rotate(45 17 7)" /></>,
  friends: <><circle cx="8.4" cy="10" r="3.6" fill="var(--art-1)" /><circle cx="15.6" cy="10" r="3.6" fill="var(--art-2)" /><path d="M3 20a5.4 5.4 0 0 1 10.8 0Z" fill="var(--art-1)" opacity=".7" /><path d="M10.2 20a5.4 5.4 0 0 1 10.8 0Z" fill="var(--art-2)" opacity=".7" /></>,
  friend: <><circle cx="12" cy="9" r="4" fill="var(--art-1)" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0Z" fill="var(--art-2)" /></>,
  home: <><path d="M12 3.4 21 11h-2.4v8.6H5.4V11H3Z" fill="var(--art-1)" /><rect x="10" y="14" width="4" height="5.6" rx="1" fill="var(--art-2)" /></>,
  door: <><rect x="6" y="3.6" width="12" height="17" rx="2.4" fill="var(--art-1)" /><circle cx="14.6" cy="12.4" r="1.2" fill="var(--art-2)" /></>,
  book: <><path d="M4 5.4A18 18 0 0 1 12 7v13a18 18 0 0 0-8-1.6Z" fill="var(--art-1)" /><path d="M20 5.4A18 18 0 0 0 12 7v13a18 18 0 0 1 8-1.6Z" fill="var(--art-2)" /></>,
  screen: <><rect x="3" y="5" width="18" height="12" rx="2.2" fill="var(--art-1)" /><rect x="8" y="19" width="8" height="1.8" rx=".9" fill="var(--art-2)" /></>,
  shelfsmall: <><rect x="5" y="5" width="14" height="14" rx="2" fill="var(--art-1)" /><rect x="7" y="11" width="10" height="1.4" fill="var(--art-2)" /></>,
  tidy: <><rect x="4" y="6" width="16" height="4" rx="1.6" fill="var(--art-1)" /><rect x="4" y="12" width="10" height="4" rx="1.6" fill="var(--art-2)" /></>,
  bowl: <><path d="M3.4 11h17.2A8.6 8.6 0 0 1 3.4 11Z" fill="var(--art-1)" /><circle cx="9" cy="8" r="1.8" fill="var(--art-2)" /><circle cx="14" cy="7.4" r="1.4" fill="var(--art-2)" /></>,
  tea: <><path d="M5 9h11v5a5.5 5.5 0 0 1-11 0Z" fill="var(--art-1)" /><path d="M16 10h2a2.4 2.4 0 0 1 0 4.8h-2" stroke="var(--art-2)" strokeWidth="1.5" fill="none" /><path d="M8 6.4c0-1 1-1.4 1-2.4M11.4 6.4c0-1 1-1.4 1-2.4" stroke="var(--art-2)" strokeWidth="1.2" strokeLinecap="round" fill="none" /></>,
  cocoa: <><path d="M5 9h11v5a5.5 5.5 0 0 1-11 0Z" fill="var(--art-1)" /><ellipse cx="10.5" cy="9.4" rx="5" ry="1.6" fill="var(--art-2)" /></>,
  map: <><path d="M3 6.4 9 4.4v13.2L3 19.6Zm6-2 6 2v13.2l-6-2Zm6 2 6-2v13.2l-6 2Z" fill="var(--art-1)" /></>,
  compass: <><circle cx="12" cy="12" r="8" fill="var(--art-1)" /><path d="m15 9-2 5-4 1 2-5Z" fill="var(--art-2)" /></>,
  gear: <><circle cx="12" cy="12" r="4" fill="var(--art-2)" />{[0, 60, 120, 180, 240, 300].map((a) => <rect key={a} x="11" y="2.6" width="2" height="4" rx="1" fill="var(--art-1)" transform={`rotate(${a} 12 12)`} />)}<circle cx="12" cy="12" r="7" stroke="var(--art-1)" strokeWidth="2" fill="none" /></>,
  list: <>{[7, 12, 17].map((y) => <g key={y}><circle cx="6" cy={y} r="1.4" fill="var(--art-2)" /><rect x="9.5" y={y - 1} width="9" height="2" rx="1" fill="var(--art-1)" /></g>)}</>,
  wing: <><path d="M3 18c2-9 8-13 13-13-1 8-5 12-13 13Z" fill="var(--art-1)" /><path d="M8 15c1-4 3-6 6-7" stroke="var(--art-2)" strokeWidth="1.2" fill="none" /></>,

  /* ---- ui & activity ---- */
  game: <><rect x="2.5" y="7" width="19" height="10" rx="4" fill="var(--art-1)" /><rect x="6" y="11" width="4.4" height="1.6" rx=".8" fill="var(--art-2)" /><rect x="7.4" y="9.6" width="1.6" height="4.4" rx=".8" fill="var(--art-2)" /><circle cx="16" cy="11" r="1.2" fill="var(--art-2)" /><circle cx="18" cy="13.4" r="1.2" fill="var(--art-2)" /></>,
  cook: <><path d="M4 12a8 8 0 0 1 16 0Z" fill="var(--art-1)" /><rect x="3" y="12" width="18" height="3" rx="1.5" fill="var(--art-2)" /><path d="M6 15l1.4 5h9.2L18 15Z" fill="var(--art-1)" opacity=".8" /></>,
  cake: <><path d="M4 13h16v6H4Z" fill="var(--art-1)" /><path d="M5 13c1.4-2.4 12.6-2.4 14 0Z" fill="var(--art-2)" /><rect x="11.4" y="6" width="1.2" height="4" rx=".6" fill="var(--art-2)" /><circle cx="12" cy="5" r="1.2" fill="var(--art-3)" /></>,
  jelly: <><path d="M6 9h12v6a6 6 0 0 1-12 0Z" fill="var(--art-1)" /><ellipse cx="12" cy="9" rx="6" ry="2" fill="var(--art-2)" /></>,
  crunch: <><path d="M12 4 20 18H4Z" fill="var(--art-1)" /><circle cx="12" cy="14" r="1.4" fill="var(--art-2)" /><circle cx="9" cy="16" r="1" fill="var(--art-2)" /></>,
  soup: <><path d="M4 11h16a8 8 0 0 1-16 0Z" fill="var(--art-1)" /><path d={starD} fill="var(--art-2)" transform="scale(.3) translate(28 22)" /></>,
  pudding: <><path d="M6 10h12l-1.4 9H7.4Z" fill="var(--art-1)" /><ellipse cx="12" cy="10" rx="6" ry="2" fill="var(--art-2)" /></>,
  tart: <><ellipse cx="12" cy="14" rx="8" ry="4.6" fill="var(--art-1)" /><ellipse cx="12" cy="13" rx="5.6" ry="3" fill="var(--art-2)" /></>,
  salad: <><path d="M4 12h16a8 8 0 0 1-16 0Z" fill="var(--art-1)" /><path d={leafD} fill="var(--art-2)" transform="scale(.34) translate(24 12)" /><path d={leafD} fill="var(--art-2)" transform="scale(.34) translate(44 18)" /></>,
  smoothie: <><path d="M8 6h8l-1.4 14H9.4Z" fill="var(--art-1)" /><rect x="13" y="2.4" width="1.6" height="6" rx=".8" fill="var(--art-2)" transform="rotate(14 13.8 5)" /></>,
  puff: <><circle cx="9" cy="13" r="4.4" fill="var(--art-1)" /><circle cx="15" cy="11.4" r="3.6" fill="var(--art-2)" /></>,
  jam: <><path d="M7 9h10v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z" fill="var(--art-1)" /><rect x="6.4" y="5.6" width="11.2" height="3" rx="1.4" fill="var(--art-2)" /></>,
  stew: <><path d="M4.5 11h15l-1.4 8H5.9Z" fill="var(--art-1)" /><ellipse cx="12" cy="11" rx="7.5" ry="2" fill="var(--art-2)" /></>,
  fizz: <><path d="M8 8h8l-1 12H9Z" fill="var(--art-1)" />{[9.5, 12, 14.5].map((x, i) => <circle key={x} cx={x} cy={5 - i % 2} r="1.1" fill="var(--art-2)" />)}</>,
  cookies: <><circle cx="9.4" cy="13" r="5" fill="var(--art-1)" /><circle cx="16" cy="15" r="3.6" fill="var(--art-1)" opacity=".8" /><circle cx="8" cy="11.6" r=".9" fill="var(--art-3)" /><circle cx="11" cy="14.4" r=".9" fill="var(--art-3)" /></>,
  parfait: <><path d="M8 4h8v14a4 4 0 0 1-8 0Z" fill="var(--art-1)" /><rect x="8" y="9" width="8" height="3" fill="var(--art-2)" /><rect x="8" y="14" width="8" height="3" fill="var(--art-3)" opacity=".6" /></>,
  snack: <><circle cx="12" cy="13" r="5.6" fill="var(--art-1)" /><path d="M12 7.4c0-2 1.6-3.2 3.4-3.6-.2 2-1.4 3.2-3.4 3.6Z" fill="var(--art-2)" /></>,
  dash: <><circle cx="8" cy="8" r="2.4" fill="var(--art-2)" /><circle cx="15" cy="5" r="1.8" fill="var(--art-2)" /><path d="M6 18a6 6 0 0 1 12 0Z" fill="var(--art-1)" /></>,
  mix: <>{[[8, 8], [16, 8], [8, 16], [16, 16]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" fill="var(--art-1)" />)}<circle cx="8" cy="8" r="3.2" fill="var(--art-2)" /></>,
  stack: <>{[16, 12, 8].map((y, i) => <rect key={y} x={6 + i} y={y} width={12 - i * 2} height="3.4" rx="1.7" fill={i === 2 ? "var(--art-2)" : "var(--art-1)"} />)}</>,
  beat: <><path d={leafD} fill="var(--art-1)" transform="scale(.7) translate(5 3)" />{[4, 19].map((x) => <rect key={x} x={x} y="9" width="1.6" height="6" rx=".8" fill="var(--art-2)" />)}</>,
  hide: <><rect x="3" y="9" width="8" height="11" rx="1.6" fill="var(--art-2)" /><circle cx="16" cy="13" r="4.4" fill="var(--art-1)" /><circle cx="15" cy="12" r=".9" fill="var(--art-3)" /></>,
  personality: <><circle cx="12" cy="12" r="7.4" fill="var(--art-1)" /><path d={heartD} fill="var(--art-2)" transform="scale(.44) translate(15 12)" /></>,
  activities: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" fill="var(--art-1)" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" fill="var(--art-2)" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" fill="var(--art-2)" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" fill="var(--art-1)" /></>,
  evolution: <><path d="M5 19 12 5l7 14Z" fill="var(--art-1)" /><circle cx="12" cy="15" r="2.4" fill="var(--art-2)" /></>,
  evolve: <><path d="M5 19 12 5l7 14Z" fill="var(--art-1)" /><circle cx="12" cy="15" r="2.4" fill="var(--art-2)" /></>,
  surprise: <><path d={starD} fill="var(--art-1)" /><circle cx="12" cy="12" r="2" fill="var(--art-2)" /></>,
  collect: <><rect x="4" y="8" width="16" height="11" rx="2.4" fill="var(--art-1)" /><path d="M8 8V6.4A4 4 0 0 1 16 6.4V8" stroke="var(--art-2)" strokeWidth="1.8" fill="none" /></>,
  trait: <><path d={starD} fill="var(--art-1)" transform="scale(.8) translate(3 2)" /><circle cx="12" cy="12" r="1.8" fill="var(--art-2)" /></>,
  bond: <><path d={heartD} fill="var(--art-1)" /><path d="M9 11h6" stroke="var(--art-2)" strokeWidth="1.6" strokeLinecap="round" /></>,
  return: <><path d="M10 5 4 11l6 6" stroke="var(--art-1)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M4.6 11H16a4 4 0 0 1 0 8h-3" stroke="var(--art-2)" strokeWidth="2.2" fill="none" strokeLinecap="round" /></>,
  sleep: <><path d={moonD} fill="var(--art-1)" transform="scale(.8) translate(2 2)" /><path d="M15 4h4l-4 5h4" stroke="var(--art-2)" strokeWidth="1.4" fill="none" strokeLinecap="round" /></>,
  dream: <><path d={moonD} fill="var(--art-1)" transform="scale(.7) translate(4 2)" /><circle cx="18" cy="6" r="1.2" fill="var(--art-2)" /><circle cx="20" cy="10" r=".8" fill="var(--art-2)" /></>,
  explore: <><circle cx="12" cy="12" r="8" fill="var(--art-1)" /><path d="m15.4 8.6-2.2 5.6-5.6 2.2 2.2-5.6Z" fill="var(--art-2)" /></>,
  room: <><path d="M4 20V9l8-5 8 5v11Z" fill="var(--art-1)" /><rect x="9.5" y="13" width="5" height="7" rx="1.2" fill="var(--art-2)" /></>,
  name: <><rect x="3.5" y="6" width="17" height="12" rx="2.4" fill="var(--art-1)" /><path d="M8 14V10l2 2.4L12 10v4" stroke="var(--art-2)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="16" cy="13" r="1.4" fill="var(--art-2)" /></>,
  shop: <><path d="M4 8h16l-1.4 12H5.4Z" fill="var(--art-1)" /><path d="M8.6 8V6.4a3.4 3.4 0 0 1 6.8 0V8" stroke="var(--art-2)" strokeWidth="1.8" fill="none" /></>,
  memory: <path d={heartD} fill="var(--art-1)" />,
  garden: <><path d="M7 12h10l-1.2 8H8.2Z" fill="var(--art-2)" /><path d={leafD} fill="var(--art-1)" transform="scale(.5) translate(12 2)" /></>,
  niumpi: <><ellipse cx="12" cy="14" rx="6.2" ry="5.6" fill="var(--art-1)" /><path d={leafD} fill="var(--art-2)" transform="scale(.4) translate(18 2)" /><circle cx="9.8" cy="13.4" r="1.3" fill="var(--art-3)" /><circle cx="14.2" cy="13.4" r="1.3" fill="var(--art-3)" /></>,
  sound: <><path d="M4 9.6h3.4L12 5.6v12.8L7.4 14.4H4Z" fill="var(--art-1)" /><path d="M15 9.4a3.6 3.6 0 0 1 0 5.2M17.4 7a7 7 0 0 1 0 10" stroke="var(--art-2)" strokeWidth="1.6" fill="none" strokeLinecap="round" /></>,
  mute: <><path d="M4 9.6h3.4L12 5.6v12.8L7.4 14.4H4Z" fill="var(--art-1)" /><path d="m15.4 9.6 4.4 4.8M19.8 9.6l-4.4 4.8" stroke="var(--art-2)" strokeWidth="1.8" strokeLinecap="round" /></>,
  lamp: <><path d="M6 12 12 4l6 8Z" fill="var(--art-1)" /><rect x="11.2" y="12" width="1.6" height="6" rx=".8" fill="var(--art-2)" /><rect x="8.4" y="18" width="7.2" height="2" rx="1" fill="var(--art-2)" /></>,
  more: <>{[6, 12, 18].map((x) => <circle key={x} cx={x} cy="12" r="2" fill="var(--art-1)" />)}</>,
  close: <path d="m6 6 12 12M18 6 6 18" stroke="var(--art-1)" strokeWidth="2.4" strokeLinecap="round" />,
  check: <path d="m5 12.8 4.6 4.4L19 6.8" stroke="var(--art-1)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2.6" fill="var(--art-1)" /><path d="M8.4 10V7.6a3.6 3.6 0 0 1 7.2 0V10" stroke="var(--art-2)" strokeWidth="2" fill="none" /></>,
  cozy: <><path d="M4 20V9l8-5 8 5v11Z" fill="var(--art-1)" /><circle cx="12" cy="14" r="3" fill="var(--art-2)" /></>,
  moonlit: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="var(--art-1)" /><path d={moonD} fill="var(--art-2)" transform="scale(.55) translate(9 6)" /></>,
  greenhouse: <><path d="M4 20V10l8-6 8 6v10Z" fill="var(--art-1)" /><path d="M12 4v16M4 12h16" stroke="var(--art-2)" strokeWidth="1.4" /></>,
  playful: <><circle cx="12" cy="12" r="7" fill="var(--art-1)" /><path d={starD} fill="var(--art-2)" transform="scale(.36) translate(20 18)" /></>,
  warm: <><path d="M6 20a6 6 0 0 1 12 0Z" fill="var(--art-1)" /><path d="M12 3c2 2.6 3 4.2 3 5.6a3 3 0 1 1-6 0C9 7.2 10 5.6 12 3Z" fill="var(--art-2)" /></>,
};

export type ArtName = keyof typeof artShapes | string;

type Props = {
  name: ArtName;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Symbols are decorative by default; pass a label to expose one to readers. */
  label?: string;
};

export function Art({ name, size = 24, className = "", style, label }: Props) {
  const shape = artShapes[name] ?? artShapes.spark;
  return (
    <svg
      className={`art art-${name} ${className}`}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {shape}
    </svg>
  );
}

export function hasArt(name: string): boolean {
  return name in artShapes;
}
