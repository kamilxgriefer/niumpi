/**
 * Canvas colours mirroring the CSS design tokens. Kept as numbers because
 * Phaser wants 0xRRGGBB, and kept here so the two layers never drift apart.
 */
export const paint = {
  violet: 0x8657ff,
  pink: 0xea55c8,
  hotPink: 0xff5fa8,
  peach: 0xffd8d4,
  cream: 0xfff4ec,
  turquoise: 0x49d4d0,
  blue: 0x66a7ff,
  gold: 0xffc857,
  green: 0x64d7a5,
  coral: 0xff6f73,
  plum: 0x432174,
  deep: 0x211044,
} as const;

/** Builds a soft round particle texture at runtime, so nothing is downloaded. */
export function ensureSpark(scene: Phaser.Scene, key = "spark", colour = 0xffffff, size = 16) {
  if (scene.textures.exists(key)) return key;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(colour, 1);
  graphics.fillCircle(size / 2, size / 2, size / 2);
  graphics.generateTexture(key, size, size);
  graphics.destroy();
  return key;
}
