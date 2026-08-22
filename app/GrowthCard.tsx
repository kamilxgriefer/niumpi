"use client";

const DOT_COUNT = 7;

type Props = {
  stage: number;
  stageName: string;
  percent: number;
  remaining: number;
};

export function GrowthCard({ stage, stageName, percent, remaining }: Props) {
  const filled = Math.round((percent / 100) * DOT_COUNT);
  const nextLabel = remaining > 0
    ? `${remaining} care ${remaining === 1 ? "moment" : "moments"} to grow`
    : "Fully grown together";

  return (
    <section
      className="growth-card"
      aria-label={`Growth stage ${stage}, ${stageName}. ${nextLabel}.`}
    >
      <div className="growth-copy">
        <span className="growth-stage">Stage {stage}</span>
        <strong className="growth-name">{stageName}</strong>
        <span className="growth-next">{nextLabel}</span>
      </div>

      <div className="growth-path" aria-hidden="true">
        <span className="growth-seed" />
        <span className="growth-line">
          <span className="growth-line-fill" style={{ width: `${percent}%` }} />
          <span className="growth-dots">
            {Array.from({ length: DOT_COUNT }, (_, index) => (
              <span className={`growth-dot ${index < filled ? "is-filled" : ""}`} key={index} />
            ))}
          </span>
        </span>
        <span className="growth-sprout">
          <span className="sprout-leaf sprout-leaf-left" />
          <span className="sprout-leaf sprout-leaf-right" />
          <span className="sprout-pot" />
        </span>
      </div>
    </section>
  );
}
