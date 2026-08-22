"use client";

type Props = {
  lampOn: boolean;
  sleeping: boolean;
  onToggleLamp: () => void;
  onToggleSleep: () => void;
};

export function ActionBar({ lampOn, sleeping, onToggleLamp, onToggleSleep }: Props) {
  return (
    <div className="action-bar">
      <button
        className={`action-button action-lamp ${lampOn ? "is-active" : ""}`}
        type="button"
        aria-pressed={lampOn}
        onClick={onToggleLamp}
      >
        <span className="action-icon" aria-hidden="true">
          <span className="lamp-glyph" />
        </span>
        {lampOn ? "Lamp off" : "Lamp on"}
      </button>

      <button
        className={`action-button action-sleep ${sleeping ? "is-active" : ""}`}
        type="button"
        onClick={onToggleSleep}
      >
        <span className="action-icon" aria-hidden="true">
          <span className="moon-glyph" />
        </span>
        {sleeping ? "Wake gently" : "Tuck in"}
      </button>
    </div>
  );
}
