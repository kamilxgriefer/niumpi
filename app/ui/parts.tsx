"use client";

import { useEffect, useId, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { motion } from "motion/react";
import { easeOut, popIn } from "../anim/transitions";
import { Art } from "./Art";
import { copy } from "../game/config/copy";
import { LOW_STAT } from "../game/stats";
import type { StatId } from "../game/types";

/* ---------------------------------------------------------------- panels -- */

export function Panel({
  title, note, action, children, className = "", tone = "cosmic", art, onOpen, openLabel,
}: {
  title?: string; note?: string; action?: ReactNode; children: ReactNode;
  className?: string; tone?: "cosmic" | "pastel"; art?: string;
  onOpen?: () => void; openLabel?: string;
}) {
  return (
    <section className={`panel panel-${tone} ${className}`}>
      {(title || action) && (
        <header className="panel-head">
          <div className="panel-title-row">
            {art && <Art name={art} size={20} className="panel-art" />}
            <div className="panel-titles">
              {title && <h2 className="panel-title">{title}</h2>}
              {note && <p className="panel-note">{note}</p>}
            </div>
          </div>
          {action}
          {onOpen && (
            <button className="panel-open" type="button" onClick={onOpen}>
              {openLabel ?? "Open"}
              <span aria-hidden="true">→</span>
            </button>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------- stats -- */

const statArt: Record<StatId, string> = { fullness: "heart", energy: "spark", joy: "happy" };
const lowNote: Record<StatId, string> = {
  fullness: copy.stats.lowFullness, energy: copy.stats.lowEnergy, joy: copy.stats.lowJoy,
};

export function StatRow({ id, value }: { id: StatId; value: number }) {
  const labelId = useId();
  const rounded = Math.max(0, Math.min(100, Math.round(value)));
  const low = rounded < LOW_STAT;
  return (
    <div className={`stat stat-${id} ${low ? "is-low" : ""}`}>
      <Art name={statArt[id]} size={16} className="stat-icon" />
      <span className="stat-name" id={labelId}>{copy.stats[id]}</span>
      <div
        className="stat-track"
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={low ? `${rounded} percent — ${lowNote[id]}` : `${rounded} percent`}
      >
        <span className="stat-fill" style={{ width: `${rounded}%` }} />
      </div>
      <span className="stat-value">{rounded}%</span>
      {low && <span className="stat-flag">{lowNote[id]}</span>}
    </div>
  );
}

export function BondMeter({ bond, level, name, pulsing }: { bond: number; level: number; name: string; pulsing?: boolean }) {
  const percent = Math.round(bond);
  return (
    <div className={`bond-block ${pulsing ? "is-gaining" : ""}`}>
      <div className="bond-top">
        <span className="bond-label">{copy.stats.bond}</span>
        <span className="bond-level">{copy.stats.level} {level}</span>
      </div>
      <div className="bond-row">
        <div
          className="bond-track"
          role="progressbar"
          aria-label={copy.stats.bond}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
          aria-valuetext={`${percent} percent — ${name}`}
        >
          <span className="bond-fill" style={{ width: `${percent}%` }} />
        </div>
        <span className="bond-value">{percent}%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- feedback --- */

export function Chip({ label, art, tone = "" }: { label: string; art?: string; tone?: string }) {
  return (
    <span className={`chip ${tone ? `chip-${tone}` : ""}`}>
      {art && <Art name={art} size={14} />}
      {label}
    </span>
  );
}

export function EmptyState({ art = "leaf", title, note, action }: { art?: string; title: string; note?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <Art name={art} size={38} className="empty-art" />
      <p className="empty-title">{title}</p>
      {note && <p className="empty-note">{note}</p>}
      {action}
    </div>
  );
}

export function LockedState({ note }: { note: string }) {
  return (
    <div className="locked-state">
      <Art name="lock" size={30} />
      <p className="locked-title">{copy.states.locked}</p>
      <p className="locked-note">{note}</p>
    </div>
  );
}

/* ----------------------------------------------------------------- modal -- */

export function Modal({
  title, note, onClose, children, wide,
}: { title: string; note?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const card = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const node = card.current;
    node?.querySelector<HTMLElement>("button, [href], input, select, textarea, [tabindex]")?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
      if (event.key !== "Tab" || !node) return;
      const focusable = [...node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  return (
    <motion.div
      className="modal-veil"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={easeOut}
      onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.div
        className={`modal-card ${wide ? "is-wide" : ""}`}
        role="dialog" aria-modal="true" aria-label={title} ref={card}
        {...popIn}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title">{title}</h2>
            {note && <p className="modal-note">{note}</p>}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <Art name="close" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------- progress -- */

export function DotPath({ percent, from = "seed", to = "sprout", count = 7 }: {
  percent: number; from?: string; to?: string; count?: number;
}) {
  const filled = Math.round((percent / 100) * count);
  return (
    <div className="dot-path" aria-hidden="true">
      <Art name={from} size={26} className="dot-cap" />
      <span className="dot-line">
        <span className="dot-line-fill" style={{ width: `${percent}%` }} />
        <span className="dot-marks">
          {Array.from({ length: count }, (_, index) => (
            <span className={`dot-mark ${index < filled ? "is-filled" : ""}`} key={index} />
          ))}
        </span>
      </span>
      <Art name={to} size={26} className="dot-cap" />
    </div>
  );
}

export function Meter({ label, value, max, tone }: { label: string; value: number; max: number; tone?: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, max ? value / max : 0)) * 100);
  return (
    <div className={`meter ${tone ? `meter-${tone}` : ""}`}>
      <span className="meter-label">{label}</span>
      <span className="meter-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <span className="meter-fill" style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}

export function TabBar({ tabs, active, onSelect, label }: {
  tabs: Array<{ id: string; label: string }>; active: string; onSelect: (id: string) => void; label: string;
}) {
  return (
    <div className="tab-bar" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab ${active === tab.id ? "is-active" : ""}`}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function CurrencyPill({ id, amount }: { id: "dewdrops" | "starFragments"; amount: number }) {
  return (
    <span className={`currency currency-${id}`}>
      <Art name={id === "dewdrops" ? "dewdrop" : "star"} size={15} />
      {amount}
      <span className="sr-only">{id === "dewdrops" ? " dewdrops" : " star fragments"}</span>
    </span>
  );
}

export function sparkStyle(offset: number, delay: number): CSSProperties {
  return { "--spark-x": `${offset}px`, "--spark-delay": `${delay}ms` } as CSSProperties;
}
