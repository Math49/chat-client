/**
 * @fileoverview Composant affichage état batterie device.
 * 
 * Utilise le hook useBattery pour récupérer l'état en temps réel.
 * Affiche niveau en % + état charge/batterie.
 * Fallback sur "Batterie inconnue" si API indisponible.
 * 
 * Design responsive:
 * - Vert émeraude si en charge
 * - Gris neutre si sur batterie
 * 
 * @module components/battery-indicator
 */

"use client";

import { useBattery } from "@/hooks/use-battery";

/**
 * Formate le niveau batterie en pourcentage.
 * @param {number} level - Niveau 0.0-1.0
 * @returns {string} Chaîne pourcentage arrondi "XX%"
 */
const formatLevel = (level: number) => `${Math.round(level * 100)}%`;

/**
 * Composant indicateur batterie header.
 * 
 * Affiche:
 * - Si API supportée: niveau % + état (en charge / reste)
 * - Si non supportée: texte "Batterie inconnue"
 * 
 * Couleur dynamique:
 * - Vert si charging (border-emerald-300)
 * - Gris si sur batterie (border-neutral-200)
 * 
 * @component
 * @returns {JSX.Element} Badge batterie ou fallback
 */
export default function BatteryIndicator() {
  // Récupère état batterie du hook
  const { supported, level, charging } = useBattery();

  // API non disponible: affiche fallback
  if (!supported) {
    return (
      <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500">
        Batterie inconnue
      </span>
    );
  }

  // Style conditionnel: vert si en charge, gris sinon
  const style = charging
    ? "border-emerald-300 text-emerald-600"
    : "border-neutral-200 text-neutral-600";

  return (
    <span
      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${style}`}
      aria-live="polite" // Annonce changements au lecteur écran
    >
      {/* Niveau batterie en % */}
      <span className="font-medium">{formatLevel(level)}</span>
      
      {/* État charge/batterie */}
      <span>{charging ? "en charge" : "reste"}</span>
    </span>
  );
}
