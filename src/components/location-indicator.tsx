/**
 * @fileoverview Composant affichage localisation utilisateur.
 * 
 * Utilise le hook useLocation pour récupérer la position en temps réel.
 * Affiche le nom de la ville ou un fallback.
 * 
 * Design responsive:
 * - Bleu si localisation obtenue
 * - Gris neutre si non disponible
 * 
 * @module components/location-indicator
 */

"use client";

import { useLocation } from "@/hooks/use-location";

/**
 * Composant indicateur localisation header.
 * 
 * Affiche:
 * - Si localisation disponible: nom ville
 * - Si permission refusée: "Localisation refusée"
 * - Si en cours: "Localisation..."
 * - Si indisponible: "Localisation inconnue"
 * 
 * Couleur dynamique:
 * - Bleu si localisation obtenue
 * - Gris si non disponible
 * 
 * @component
 * @returns {JSX.Element} Badge localisation ou fallback
 */
export default function LocationIndicator() {
  const { city, loading, error, supported } = useLocation();

  // API non disponible ou non supportée
  if (!supported) {
    return (
      <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500">
        Localisation inconnue
      </span>
    );
  }

  // Récupération en cours
  if (loading && !city) {
    return (
      <span className="rounded-full border border-blue-300 px-3 py-1 text-xs text-blue-600 animate-pulse">
        Localisation...
      </span>
    );
  }

  // Erreur localisation
  if (error) {
    return (
      <span className="rounded-full border border-amber-300 px-3 py-1 text-xs text-amber-600">
        {error}
      </span>
    );
  }

  // Localisation obtenue
  if (city) {
    return (
      <span
        className="flex items-center gap-1 rounded-full border border-blue-300 px-3 py-1 text-xs text-blue-600"
        aria-live="polite"
      >
        <span className="font-medium">{city}</span>
        <span>📍</span>
      </span>
    );
  }

  // État par défaut
  return (
    <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500">
      Localisation inconnue
    </span>
  );
}
