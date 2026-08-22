"use client";

type Props = {
  soundEnabled: boolean;
  onToggleSound: () => void;
  bond: number;
  bondLevel: number;
  bondName: string;
  bondPulse: boolean;
};

export function GameHeader({
  soundEnabled,
  onToggleSound,
  bond,
  bondLevel,
  bondName,
  bondPulse,
}: Props) {
  const percent = Math.round(bond);

  return (
    <header className="app-header">
      <div className="brand">
        <p className="brand-eyebrow">
          <span className="brand-spark" aria-hidden="true">✦</span>
          Your little companion
        </p>
        <h1 className="brand-name">
          N<span className="logo-i">ı</span>ump<span className="logo-i">ı</span>
        </h1>
      </div>

      <div className="header-tools">
        <button
          className={`sound-toggle ${soundEnabled ? "is-on" : "is-off"}`}
          type="button"
          aria-pressed={soundEnabled}
          onClick={onToggleSound}
        >
          <span className="sound-glyph" aria-hidden="true">
            <i /><i /><i />
          </span>
          Sound {soundEnabled ? "on" : "off"}
        </button>

        <div className={`bond-block ${bondPulse ? "is-gaining" : ""}`}>
          <div className="bond-top">
            <span className="bond-label">Bond</span>
            <span className="bond-level">Level {bondLevel}</span>
          </div>
          <div className="bond-row">
            <div
              className="bond-track"
              role="progressbar"
              aria-label="Bond"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={`${percent} percent — ${bondName}`}
            >
              <span className="bond-fill" style={{ width: `${bond}%` }} />
            </div>
            <span className="bond-value">{percent}%</span>
          </div>
        </div>
      </div>
    </header>
  );
}
