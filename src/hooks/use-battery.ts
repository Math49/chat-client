/**
 * @fileoverview Hook Battery Status API pour monitoring batterie/charge.
 * 
 * Utilise l'API Battery Status du navigateur (deprecated mais largement supportée).
 * Fournit l'état batterie en temps réel avec listeners onChange automatiques.
 * 
 * Fallback graceful si non supporté: retourne {supported: false}
 * 
 * @module hooks/use-battery
 */

"use client";

import { useEffect, useState } from "react";

/**
 * Interface Battery Manager du navigateur.
 * Représente l'état batterie et fournit les events listeners.
 * @private
 */
type BatteryManagerLike = {
  charging: boolean; // true si chargeur connecté
  level: number; // 0.0 à 1.0 (multiplier par 100 pour pourcentage)
  addEventListener: (type: "chargingchange" | "levelchange", listener: () => void) => void;
  removeEventListener: (type: "chargingchange" | "levelchange", listener: () => void) => void;
};

/**
 * État batterie courant.
 * @typedef {Object} BatteryState
 * @property {boolean} charging - true si en charge
 * @property {number} level - Pourcentage 0.0-1.0
 * @property {boolean} supported - true si API disponible
 */
type BatteryState = {
  charging: boolean;
  level: number;
  supported: boolean;
};

// État par défaut (chargeur, 100%, supporté)
const defaultState: BatteryState = {
  charging: false,
  level: 1,
  supported: true,
};

/**
 * Hook Battery Status API.
 * Retourne l'état batterie courant (charging, level%) avec auto-updates.
 * API deprecated mais largement supportée. Fallback graceful sur non-support.
 * 
 * @hook
 * @returns {BatteryState} Objet {charging, level, supported}
 * 
 * @example
 * const { charging, level, supported } = useBattery();
 * if (!supported) return <div>Batterie inconnue</div>;
 * return <div>{Math.round(level * 100)}% {charging ? "en charge" : ""}</div>
 */
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
