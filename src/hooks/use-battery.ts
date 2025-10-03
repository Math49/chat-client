"use client";

import { useEffect, useState } from "react";

type BatteryManagerLike = {
  charging: boolean;
  level: number;
  addEventListener: (type: "chargingchange" | "levelchange", listener: () => void) => void;
  removeEventListener: (type: "chargingchange" | "levelchange", listener: () => void) => void;
};

type BatteryState = {
  charging: boolean;
  level: number;
  supported: boolean;
};

const defaultState: BatteryState = {
  charging: false,
  level: 1,
  supported: true,
};

export function useBattery(): BatteryState {
  const [state, setState] = useState<BatteryState>(defaultState);

  useEffect(() => {
    let battery: BatteryManagerLike | null = null;
    let isCancelled = false;

    const update = () => {
      if (!battery) return;
      setState({
        charging: battery.charging,
        level: battery.level,
        supported: true,
      });
    };

    const attach = (manager: BatteryManagerLike) => {
      battery = manager;
      update();
      const handler = () => update();
      manager.addEventListener("chargingchange", handler);
      manager.addEventListener("levelchange", handler);
      return () => {
        manager.removeEventListener("chargingchange", handler);
        manager.removeEventListener("levelchange", handler);
      };
    };

    if (typeof navigator === "undefined" || typeof (navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> }).getBattery !== "function") {
      setState((prev) => ({ ...prev, supported: false }));
      return;
    }

    let detach: (() => void) | null = null;

    (navigator as Navigator & { getBattery: () => Promise<BatteryManagerLike> })
      .getBattery()
      .then((manager) => {
        if (isCancelled) return;
        detach = attach(manager);
      })
      .catch(() => {
        if (isCancelled) return;
        setState({ charging: false, level: 1, supported: false });
      });

    return () => {
      isCancelled = true;
      if (detach) detach();
    };
  }, []);

  return state;
}
