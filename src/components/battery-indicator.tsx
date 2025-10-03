"use client";

import { useBattery } from "@/hooks/use-battery";

const formatLevel = (level: number) => `${Math.round(level * 100)}%`;

export default function BatteryIndicator() {
  const { supported, level, charging } = useBattery();

  if (!supported) {
    return (
      <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500">
        Batterie inconnue
      </span>
    );
  }

  const style = charging
    ? "border-emerald-300 text-emerald-600"
    : "border-neutral-200 text-neutral-600";

  return (
    <span
      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${style}`}
      aria-live="polite"
    >
      <span className="font-medium">{formatLevel(level)}</span>
      <span>{charging ? "en charge" : "reste"}</span>
    </span>
  );
}
