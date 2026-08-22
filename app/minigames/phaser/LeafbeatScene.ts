import PhaserNS from "phaser";
import type { GameBridge } from "./bridge";
import { ensureSpark, paint } from "./palette";
import { beatPoints, GOOD_WINDOW, judgeBeat } from "./rules";

const BEAT_MS: Record<string, number> = { gentle: 1_100, normal: 820, brisk: 620 };
const NOTE_SPEED: Record<string, number> = { gentle: 190, normal: 260, brisk: 340 };
/**
 * Rhythm lane. Timing windows are measured in pixels from the hit line, and
 * every judgement is shown as a word as well as a colour.
 */
export function makeLeafbeatScene(Phaser: typeof PhaserNS) {
  return class LeafbeatScene extends Phaser.Scene {
    private bridge!: GameBridge;
    private notes: Phaser.GameObjects.Ellipse[] = [];
    private spawnAt = 0;
    private combo = 0;
    private lineY = 0;
    private judgement!: Phaser.GameObjects.Text;
    private burst!: Phaser.GameObjects.Particles.ParticleEmitter;
    private hitLine!: Phaser.GameObjects.Rectangle;

    constructor(bridge: GameBridge) {
      super("leafbeat");
      this.bridge = bridge;
    }

    create() {
      const { width, height } = this.scale;
      this.lineY = height - 90;
      ensureSpark(this, "spark-pink", paint.hotPink);
      this.burst = this.add.particles(0, 0, "spark-pink", {
        speed: { min: 60, max: 180 }, lifespan: 460,
        scale: { start: 0.7, end: 0 }, quantity: this.bridge.reduced ? 3 : 12, emitting: false,
      });

      this.add.rectangle(width / 2, height / 2, 96, height, paint.plum, 0.28);
      this.hitLine = this.add.rectangle(width / 2, this.lineY, 150, 6, paint.gold, 0.9);
      this.add.circle(width / 2, this.lineY, 40).setStrokeStyle(3, paint.gold, 0.55);

      this.judgement = this.add.text(width / 2, this.lineY + 54, "", {
        fontFamily: "system-ui, sans-serif", fontSize: "18px", color: "#FFF4EC",
      }).setOrigin(0.5);

      this.input.on("pointerdown", () => this.strike());
      this.input.keyboard!.on("keydown-SPACE", () => this.strike());
      this.input.keyboard!.on("keydown-ENTER", () => this.strike());
    }

    update(_time: number, delta: number) {
      this.spawnAt += delta;
      if (this.spawnAt > BEAT_MS[this.bridge.difficulty]) {
        this.spawnAt = 0;
        const note = this.add.ellipse(this.scale.width / 2, -20, 34, 46, paint.turquoise);
        note.setStrokeStyle(2, paint.blue, 0.7);
        this.notes.push(note);
      }
      const step = (delta / 1000) * NOTE_SPEED[this.bridge.difficulty];
      for (const note of [...this.notes]) {
        note.y += step;
        if (!this.bridge.reduced) note.rotation = Math.sin(note.y * 0.02) * 0.28;
        if (note.y > this.lineY + GOOD_WINDOW + 24) {
          this.combo = 0;
          this.bridge.setCombo(0);
          this.say("miss", paint.coral);
          this.drop(note);
        }
      }
    }

    private strike() {
      if (!this.scene.isActive()) return;
      const target = this.notes
        .slice()
        .sort((a, b) => Math.abs(a.y - this.lineY) - Math.abs(b.y - this.lineY))[0];
      const distance = target ? Math.abs(target.y - this.lineY) : Infinity;

      if (!target || distance > GOOD_WINDOW) {
        this.combo = 0;
        this.bridge.setCombo(0);
        this.say("miss", paint.coral);
        this.bridge.cue("fail");
        return;
      }
      const judgement = judgeBeat(distance);
      const perfect = judgement === "perfect";
      this.combo += 1;
      this.bridge.setCombo(this.combo);
      this.bridge.addScore(beatPoints(judgement, this.combo));
      this.bridge.cue(perfect ? "leaf" : "blip");
      this.say(judgement, perfect ? paint.gold : paint.green);
      this.burst.emitParticleAt(target.x, this.lineY);
      this.tweens.add({ targets: this.hitLine, scaleX: 1.25, duration: 110, yoyo: true });
      this.drop(target);
    }

    private say(text: string, colour: number) {
      this.judgement.setText(text);
      this.judgement.setColor(`#${colour.toString(16).padStart(6, "0")}`);
      if (this.bridge.reduced) return;
      this.judgement.setScale(1.2);
      this.tweens.add({ targets: this.judgement, scale: 1, duration: 180 });
    }

    private drop(note: Phaser.GameObjects.Ellipse) {
      this.notes = this.notes.filter((entry) => entry !== note);
      note.destroy();
    }
  };
}
