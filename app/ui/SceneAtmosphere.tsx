import type { SceneId } from "../game/types";

/**
 * A quiet, scene-specific world behind the functional UI. The shapes are CSS
 * materials rather than illustrations, so they stay sharp at every viewport
 * and never compete with Niumpi or the controls.
 */
export function SceneAtmosphere({ scene }: { scene: SceneId }) {
  return (
    <div className={`scene-atmosphere atmosphere-${scene}`} aria-hidden="true">
      <span className="atmosphere-haze" />
      <span className="atmosphere-orbit" />
      <span className="atmosphere-horizon" />
      <span className="atmosphere-motes">
        {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
      </span>
    </div>
  );
}
