"use client";

import { Art } from "./Art";
import { copy } from "../game/config/copy";

/**
 * The canonical wordmark. The two dotless "ı" carry their own leaves, which is
 * why the name is always written exactly "Niumpi" — never NiumPi or NiumPI.
 */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "is-compact" : ""}`}>
      <h1 className="brand-name">
        N<span className="logo-i">ı</span>ump<span className="logo-i">ı</span>
      </h1>
      <p className="brand-eyebrow">
        <Art name="spark" size={13} className="brand-spark" />
        {copy.brand.eyebrow}
      </p>
      {!compact && <p className="brand-tagline">{copy.brand.tagline}</p>}
    </div>
  );
}
