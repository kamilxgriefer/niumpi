import type { CueName } from "../../ui/audio";
import type { Difficulty } from "../../game/config/minigames";

/**
 * The only contract between React and Phaser. Scores arrive as discrete
 * events — never a per-frame stream — so React re-renders on gameplay
 * milestones and nothing else.
 */
export type GameBridge = {
  addScore: (points: number) => void;
  setCombo: (combo: number) => void;
  end: () => void;
  cue: (name: CueName) => void;
  difficulty: Difficulty;
  reduced: boolean;
};

export type SceneCtor = new (bridge: GameBridge) => Phaser.Scene;
