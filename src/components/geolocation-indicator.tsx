/**
 * @fileoverview Composant affichage statut géolocalisation PWA.
 * 
 * Utilise l'API Geolocation pour afficher l'état:
 * - Géolocalisation activée (lat/lng reçus)
 * - Géolocalisation non disponible
 * - Accès refusé
 * 
 * Design responsive:
 * - Vert si position obtenue
 * - Orange si accès refusé
 * - Gris si non disponible
 * 
 * @module components/geolocation-indicator
 */

"use client";

import { useEffect, useState } from "react";

interface GeolocationState {
  supported: boolean;
  granted: boolean;
  loading: boolean;
  latitude?: number;
  longitude?: number;
}

/**
 * Arrondit les coordonnées GPS à 3 décimales.
 * @param {number} value - Latitude ou longitude
 * @returns {string} Valeur arrondie en chaîne
 */
const formatCoordinate = (value: number) => value.toFixed(3);

/**
 * Composant indicateur géolocalisation header.
 * 
 * Affiche:
 * - Si API supportée et permission accordée: position et icône GPS
 * - Si permission refusée: "Accès refusé"
 * - Si non supportée: "GPS non disponible"
 * 
 * Couleur dynamique:
 * - Vert si position obtenue (border-emerald-300)
 * - Orange si accès refusé (border-amber-300)
 * - Gris sinon (border-neutral-200)
 * 
 * @component
 * @returns {JSX.Element} Badge géolocalisation ou fallback
 */
export default function GeolocationIndicator() {
  const [state, setState] = useState<GeolocationState>({
    supported: false,
    granted: false,
    loading: true,
  });

  useEffect(() => {
    // Vérifie si l'API Geolocation est disponible
    if (!navigator.geolocation) {
      setState({
        supported: false,
        granted: false,
        loading: false,
      });
      return;
    }

    // Demande la permission et la position une seule fois
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setState({
          supported: true,
          granted: true,
          loading: false,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        // Gère les erreurs de géolocalisation
        const granted = error.code !== error.PERMISSION_DENIED;
        setState({
          supported: true,
          granted,
          loading: false,
        });
      },
      {
        enableHighAccuracy: false, // Plus rapide, moins précis
        timeout: 10000,
        maximumAge: 300000, // Cache 5 minutes
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // API non disponible
  if (!state.supported) {
    return (
      <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500">
        GPS non disponible
      </span>
    );
  }

  // Permission refusée
  if (!state.granted) {
    return (
      <span className="rounded-full border border-amber-300 px-3 py-1 text-xs text-amber-600">
        Accès refusé
      </span>
    );
  }

  // Chargement ou pas de données
  if (state.loading || !state.latitude || !state.longitude) {
    return (
      <span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-500">
        GPS...
      </span>
    );
  }

  // Position obtenue
  return (
    <span
      className="flex items-center gap-1 rounded-full border border-emerald-300 px-3 py-1 text-xs text-emerald-600"
      aria-live="polite"
      title={`Latitude: ${state.latitude}, Longitude: ${state.longitude}`}
    >
      {/* Icône GPS */}
      <span>📍</span>

      {/* Coordonnées */}
      <span className="font-medium">
        {formatCoordinate(state.latitude)}, {formatCoordinate(state.longitude)}
      </span>
    </span>
  );
}
