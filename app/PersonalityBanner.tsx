"use client";

import type { CareStyle } from "./RiggedNiumpi";

type Props = {
  careStyle: CareStyle;
  title: string;
  note: string;
};

export function PersonalityBanner({ careStyle, title, note }: Props) {
  return (
    <section className={`personality-banner banner-${careStyle}`} aria-live="polite">
      <span className="banner-badge" aria-hidden="true">
        <span className="banner-leaf" />
      </span>
      <span className="banner-copy">
        <strong>{title}</strong>
        <span>{note}</span>
      </span>
      <span className="banner-foliage" aria-hidden="true">
        <i /><i /><i />
      </span>
    </section>
  );
}
