import PhaserNS from "phaser";
import type { GameBridge } from "./bridge";
import { ensureSpark, paint } from "./palette";
import { stackPoints, trimOverlap } from "./rules";

const SPEED: Record<string, number> = { gentle: 150, normal: 230, brisk: 330 };
const BLOCK_HEIGHT = 26;
const START_WIDTH = 190;

/**
 * Stacking tower. The overlap test trims each block, so the tower narrows
 * naturally and a miss is unambiguous.
 */
export function makeCloudStackScene(Phaser: typeof PhaserNS) {
  return class CloudStackScene extends Phaser.Scene {
    private bridge!: GameBridge;
    private slider!: Phaser.GameObjects.Rectangle;
    private direction = 1;
    private tower: Array<{ x: number; width: number }> = [];
    private blocks: Phaser.GameObjects.Rectangle[] = [];
    private toppled = false;
    private burst!: Phaser.GameObjects.Particles.ParticleEmitter;

    constructor(bridge: GameBridge) {
      super("cloud-stack");
      this.bridge = bridge;
    }

    create() {
      const { width, height } = this.scale;
      ensureSpark(this, "spark-cream", paint.cream);
      this.burst = this.add.particles(0, 0, "spark-cream", {
        speed: { min: 30, max: 110 }, lifespan: 500,
        scale: { start: 0.6, end: 0 }, quantity: this.bridge.reduced ? 3 : 9, emitting: false,
      });

      this.add.rectangle(width / 2, height - 10, width, 20, paint.plum, 0.5);
      const base = { x: width / 2 - START_WIDTH / 2, width: START_WIDTH };
      this.tower.push(base);
      this.blocks.push(this.drawBlock(base, 0));

      this.slider = this.add.rectangle(60, this.rowY(1), START_WIDTH, BLOCK_HEIGHT, paint.cream, 0.95)
        .setOrigin(0, 0.5).setStrokeStyle(2, paint.blue, 0.6);

      this.input.on("pointerdown", () => this.drop());
      this.input.keyboard!.on("keydown-SPACE", () => this.drop());
      this.input.keyboard!.on("keydown-ENTER", () => this.drop());
    }

    update(_time: number, delta: number) {
      if (this.toppled) return;
      const { width } = this.scale;
      this.slider.x += (delta / 1000) * SPEED[this.bridge.difficulty] * this.direction;
      if (this.slider.x <= 8) { this.slider.x = 8; this.direction = 1; }
      const right = this.slider.x + this.slider.width;
      if (right >= width - 8) { this.slider.x = width - 8 - this.slider.width; this.direction = -1; }
    }

    private rowY(index: number) {
      return this.scale.height - 30 - index * (BLOCK_HEIGHT + 3);
    }

    private drawBlock(block: { x: number; width: number }, index: number) {
      return this.add
        .rectangle(block.x, this.rowY(index), block.width, BLOCK_HEIGHT, paint.cream, 0.92)
        .setOrigin(0, 0.5)
        .setStrokeStyle(2, paint.blue, 0.45);
    }

    private drop() {
      if (this.toppled || !this.scene.isActive()) return;
      const top = this.tower[this.tower.length - 1];
      const result = trimOverlap({ x: this.slider.x, width: this.slider.width }, top);

      if (!result) {
        this.toppled = true;
        this.bridge.cue("fail");
        if (!this.bridge.reduced) {
          this.cameras.main.shake(260, 0.01);
          this.blocks.forEach((block, index) => this.tweens.add({
            targets: block, y: this.scale.height + 60, angle: Phaser.Math.Between(-60, 60),
            duration: 620, delay: index * 30, ease: "Quad.easeIn",
          }));
        }
        this.time.delayedCall(760, () => this.bridge.end());
        return;
      }

      this.bridge.addScore(stackPoints(result.perfect));
      this.bridge.cue("leaf");
      this.burst.emitParticleAt(result.placed.x + result.placed.width / 2, this.slider.y);

      this.tower.push(result.placed);
      this.blocks.push(this.drawBlock(result.placed, this.tower.length - 1));
      this.slider.width = result.placed.width;
      this.slider.x = 8;
      this.direction = 1;
      this.slider.y = this.rowY(this.tower.length);

      // Once the tower is tall, the camera pans instead of running off-screen.
      if (this.tower.length > 6 && !this.bridge.reduced) {
        this.tweens.add({ targets: this.cameras.main, scrollY: (this.tower.length - 6) * -(BLOCK_HEIGHT + 3), duration: 260 });
      }
    }
  };
}
