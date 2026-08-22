"use client";

import type { PointerEvent } from "react";
import { foodOrder, foods } from "./gameConfig";
import type { FoodId } from "./gameConfig";

type Props = {
  petName: string;
  counts: Record<FoodId, number>;
  disabled: boolean;
  selected: FoodId | null;
  dragging: FoodId | null;
  onDragStart: (event: PointerEvent<HTMLButtonElement>, food: FoodId) => void;
  onDragMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onDragEnd: (event: PointerEvent<HTMLButtonElement>) => void;
  onActivate: (food: FoodId) => void;
};

export function SnackBar({
  petName,
  counts,
  disabled,
  selected,
  dragging,
  onDragStart,
  onDragMove,
  onDragEnd,
  onActivate,
}: Props) {
  return (
    <section className="snack-bar" aria-label="Snack bar">
      <div className="snack-head">
        <h2 className="snack-title">Snack bar</h2>
        <p className="snack-lead">
          {disabled
            ? `${petName} is asleep`
            : selected
              ? `Tap ${petName} to share the ${foods[selected].name.toLowerCase()}`
              : `Drag or tap a treat for ${petName}`}
        </p>
      </div>

      <ul className="snack-list">
        {foodOrder.map((food: FoodId) => {
          const shared = counts[food];
          const isSelected = selected === food;
          return (
            <li className="snack-slot" key={food}>
              <button
                className={`snack-card ${isSelected ? "is-selected" : ""} ${dragging === food ? "is-dragging" : ""}`}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                aria-label={`${foods[food].name}, shared ${shared} ${shared === 1 ? "time" : "times"}`}
                onPointerDown={(event) => onDragStart(event, food)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                onClick={() => onActivate(food)}
              >
                <span className={`snack-icon food-${food}`} aria-hidden="true" />
                <span className="snack-name">{foods[food].name}</span>
                <span className="snack-count" aria-hidden="true">{shared}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
