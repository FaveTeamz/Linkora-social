"use client";

import React from "react";
import { utf8Bytes } from "linkora-sdk";

export interface CharacterCounterProps {
  value: string;
  max?: number;
  /** Percentage threshold (0–100) at which the counter turns amber. Defaults to 80. */
  amberAt?: number;
  /** Percentage threshold (0–100) at which the counter turns red. Defaults to 100. */
  redAt?: number;
  className?: string;
  id?: string;
}

export function CharacterCounter({
  value,
  max = 280,
  amberAt = 80,
  redAt = 100,
  className = "",
  id,
}: CharacterCounterProps) {
  const current = utf8Bytes(value);
  const percentage = (current / max) * 100;
  const isOverLimit = percentage >= redAt;
  const isNearLimit = !isOverLimit && percentage >= amberAt;

  const colorClass = isOverLimit
    ? "text-red-500 font-bold"
    : isNearLimit
      ? "text-amber-400 font-semibold"
      : "text-gray-400";

  return (
    <div
      id={id}
      className={`text-xs font-medium transition-colors ${colorClass} ${className}`}
      data-testid="character-counter"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`${current} of ${max} characters used`}
    >
      <span>
        {current} / {max}
      </span>
    </div>
  );
}
