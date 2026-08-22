import PhaserNS from "phaser";
import type { GameBridge } from "./bridge";
import { ensureSpark, paint } from "./palette";
import { catchValue, isCaught } from "./rules";

type Kind = "drop" | "stone" | "gold";

const SPAWN_MS: Record<string, number> = { gentle: 900, normal: 700, brisk: 520 };
const FALL_SPEED: Record<string, number> = { gentle: 150, normal: 215, brisk: 300 };
const CATCHER_SPEED = 520;

/**
 * Falling-object catcher. Real frame loop, real overlap tests and a particle
 * burst on every catch — the kind of thing a canvas engine is actually for.
 */
export function makeDewdropDashScene(Phaser: typeof PhaserNS) {
  return class DewdropDashScene extends Phaser.Scene {
    private bridge!: GameBridge;
    private catcher!: Phaser.GameObjects.Container;
    private falling: Array<Phaser.GameObjects.Arc & { kind?: Kind }> = [];
    private spawnAt = 0;
    private combo = 0;
    private keys!: Record<string, Phaser.Input.Keyboard.Key>;
    private pointerX: number | null = null;
    private burst!: Phaser.GameObjects.Particles.ParticleEmitter;

    constructor(bridge: GameBridge) {
      super("dewdrop-dash");
      this.bridge = bridge;
    }

    create() {
      const { width, height } = this.scale;
      ensureSpark(this, "spark-teal", paint.turquoise);

      this.burst = this.add.particles(0, 0, "spark-teal", {
        speed: { min: 40, max: 150 },
        lifespan: 520,
        scale: { start: 0.7, end: 0 },
        quantity: this.bridge.reduced ? 3 : 10,
        emitting: false,
      });

      const body = this.add.circle(0, 0, 26, paint.coral);
      const belly = this.add.circle(0, 6, 15, paint.peach);
      const eyeLeft = this.add.circle(-9, -4, 4, paint.deep);
      const eyeRight = this.add.circle(9, -4, 4, paint.deep);
      const leaf = this.add.ellipse(0, -30, 14, 22, paint.turquoise);
      this.catcher = this.add.container(width / 2, height - 46, [leaf, body, belly, eyeLeft, eyeRight]);

      this.keys = this.input.keyboard!.addKeys("LEFT,RIGHT,A,D") as Record<string, Phaser.Input.Keyboard.Key>;
      this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
        if (pointer.isDown || pointer.wasTouch) this.pointerX = pointer.x;
      });
      this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => { this.pointerX = pointer.x; });

      // A resize keeps the catcher on the floor rather than off-screen.
      this.scale.on("resize", () => { this.catcher.y = this.scale.height - 46; });
    }

    update(_time: number, delta: number) {
      const { width, height } = this.scale;
      const step = (delta / 1000) * CATCHER_SPEED;
      if (this.keys.LEFT.isDown || this.keys.A.isDown) this.catcher.x -= step;
      if (this.keys.RIGHT.isDown || this.keys.D.isDown) this.catcher.x += step;
      if (this.pointerX !== null) {
        this.catcher.x = Phaser.Math.Linear(this.catcher.x, this.pointerX, 0.28);
      }
      this.catcher.x = Phaser.Math.Clamp(this.catcher.x, 34, width - 34);

      this.spawnAt += delta;
      if (this.spawnAt > SPAWN_MS[this.bridge.difficulty]) {
        this.spawnAt = 0;
        this.spawn();
      }

      const speed = (delta / 1000) * FALL_SPEED[this.bridge.difficulty];
      for (const item of [...this.falling]) {
        item.y += speed;
        if (!this.bridge.reduced) item.rotation += delta * 0.002;

        const caught = isCaught(item.x, item.y, this.catcher.x, this.catcher.y);
        if (caught) { this.collect(item); continue; }
        if (item.y > height + 30) {
          if (item.kind !== "stone") { this.combo = 0; this.bridge.setCombo(0); }
          this.remove(item);
        }
      }
    }

    private spawn() {
      const roll = Math.random();
      const kind: Kind = roll > 0.86 ? "gold" : roll > 0.68 ? "stone" : "drop";
      const colour = kind === "stone" ? paint.plum : kind === "gold" ? paint.gold : paint.turquoise;
      const item = this.add.circle(
        Phaser.Math.Between(30, this.scale.width - 30), -20,
        kind === "gold" ? 15 : 13, colour,
      ) as Phaser.GameObjects.Arc & { kind?: Kind };
      item.kind = kind;
      if (kind === "stone") item.setStrokeStyle(3, paint.deep);
      this.falling.push(item);
    }

    private collect(item: Phaser.GameObjects.Arc & { kind?: Kind }) {
      const result = catchValue(item.kind ?? "drop", this.combo);
      this.combo = result.combo;
      this.bridge.setCombo(result.combo);
      this.bridge.addScore(result.points);
      if (item.kind === "stone") {
        this.bridge.cue("fail");
        if (!this.bridge.reduced) this.cameras.main.shake(140, 0.006);
      } else {
        this.bridge.cue("leaf");
        this.burst.emitParticleAt(item.x, item.y);
        this.tweens.add({ targets: this.catcher, scaleY: 0.86, duration: 90, yoyo: true });
      }
      this.remove(item);
    }

    private remove(item: Phaser.GameObjects.Arc) {
      this.falling = this.falling.filter((entry) => entry !== item);
      item.destroy();
    }
  };
}
