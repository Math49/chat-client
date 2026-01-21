/**
 * @fileoverview Hook Geolocation API pour récupérer la localisation.
 * 
 * Utilise l'API Geolocation du navigateur pour obtenir lat/lng.
 * Convertit les coordonnées en ville grâce au reverse-geocoding (Nominatim - OpenStreetMap).
 * 
 * Fallback graceful si non supporté: retourne {supported: false}
 * 
 * @module hooks/use-location
 */

"use client";

import { useEffect, useState } from "react";

/**
 * État localisation courant.
 * @typedef {Object} LocationState
 * @property {string|null} city - Nom de la ville
 * @property {number|null} latitude - Latitude
 * @property {number|null} longitude - Longitude
 * @property {boolean} loading - Vrai pendant la récupération
 * @property {string|null} error - Message d'erreur si applicable
 * @property {boolean} supported - Vrai si API disponible
 */
type LocationState = {
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  loading: boolean;
  error: string | null;
  supported: boolean;
};

const defaultState: LocationState = {
  city: null,
  latitude: null,
  longitude: null,
  loading: false,
  error: null,
  supported: true,
};

/**
 * Convertit coordonnées lat/lng en nom de ville.
 * Utilise Nominatim API d'OpenStreetMap pour le reverse-geocoding.
 * @private
 */
const getCityFromCoordinates = async (
  latitude: number,
  longitude: number
): Promise<string | null> => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
      {
        headers: {
          "User-Agent": "chat-client-pwa/1.0", // Nominatim nécessite un User-Agent
        },
      }
    );

    if (!response.ok) {
      throw new Error("Geocoding failed");
    }

    const data = await response.json() as {
      address?: {
        city?: string;
        town?: string;
        county?: string;
        region?: string;
        country?: string;
      };
    };

    // Essayer différents champs possibles
    const city = data.address?.city || data.address?.town || data.address?.county;
    
    if (city) {
      return city;
    }

    // Fallback: afficher la région ou les coordonnées
    return (
      data.address?.region ||
      `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`
    );
  } catch (error) {
    console.warn("Reverse geocoding failed:", error);
    return null;
  }
};

/**
 * Hook Geolocation.
 * Récupère la position actuelle et l'identifie en ville.
 * 
 * @hook
 * @returns {LocationState} Objet {city, latitude, longitude, loading, error, supported}
 * 
 * @example
 * const { city, latitude, longitude, loading, supported } = useLocation();
 * if (!supported) return <div>Localisation indisponible</div>;
 * if (loading) return <div>Récupération position...</div>;
 * return <div>{city || "Position inconnue"}</div>
 */
export function useLocation(): LocationState {
  const [state, setState] = useState<LocationState>(defaultState);

  useEffect(() => {
    // Vérifier disponibilité API
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((prev) => ({ ...prev, supported: false }));
      return;
    }

    let isCancelled = false;

    // Démarrer récupération position
    setState((prev) => ({ ...prev, loading: true }));

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (isCancelled) return;

        const { latitude, longitude } = position.coords;

        // Récupérer la ville
        const city = await getCityFromCoordinates(latitude, longitude);

        if (isCancelled) return;

        setState({
          city,
          latitude,
          longitude,
          loading: false,
          error: null,
          supported: true,
        });
      },
      (error) => {
        if (isCancelled) return;

        const errorMessage =
          error.code === error.PERMISSION_DENIED
            ? "Permission refusée"
            : error.code === error.POSITION_UNAVAILABLE
              ? "Position indisponible"
              : "Erreur localisation";

        setState({
          city: null,
          latitude: null,
          longitude: null,
          loading: false,
          error: errorMessage,
          supported: true,
        });
      },
      {
        enableHighAccuracy: false, // Garder false pour batterie
        timeout: 10000,
        maximumAge: 300000, // Cache 5 minutes
      }
    );

    return () => {
      isCancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  return state;
}
