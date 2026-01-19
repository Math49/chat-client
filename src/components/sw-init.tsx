/**
 * @fileoverview Initialisation Service Worker pour PWA.
 * 
 * Responsabilités:
 * - Enregistre /sw.js au démarrage (offline-first caching)
 * - Écoute Background Sync events via BroadcastChannel
 * - Gère auto-updates: détecte nouvelle SW et recharge
 * - Utilise SKIP_WAITING pour activation immédiate
 * 
 * Cycle de vie SW:
 * 1. Vérifie disponibilité serviceWorker API
 * 2. Register /sw.js avec scope "/"
 * 3. Setup BroadcastChannel pour messages SW
 * 4. Écoute updatefound: nouvelle version en background
 * 5. Écoute controllerchange: recharge page une fois
 * 
 * Features:
 * - Offline persistence via Workbox caching strategies
 * - Background sync queuing (chat messages, photos)
 * - Push notifications support
 * 
 * @module components/sw-init
 */

"use client";

import { useEffect } from "react";

/**
 * Composant d'initialisation Service Worker.
 * 
 * À insérer dans layout.tsx pour activation au démarrage app.
 * Aucun rendu UI: retourne null.
 * 
 * Logique:
 * 1. Feature detect service worker API
 * 2. Register /sw.js si disponible
 * 3. Setup BroadcastChannel pour communication SW
 * 4. Listen updatefound et post SKIP_WAITING
 * 5. Listen controllerchange pour reload après activation
 * 
 * @component
 * @returns {null} Aucun rendu UI
 * 
 * @example
 * // Dans layout.tsx
 * import ServiceWorkerInit from "@/components/sw-init";
 * export default function RootLayout({ children }) {
 *   return (
 *     <>
 *       <ServiceWorkerInit />
 *       {children}
 *     </>
 *   );
 * }
 */
export default function ServiceWorkerInit() {
  useEffect(() => {
    // Feature detection: vérifie si Service Worker supporté
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        // Enregistre le Service Worker depuis /public/sw.js
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        console.debug("[ServiceWorkerInit] Registered successfully");

        // ===== BROADCAST CHANNEL pour messages SW =====
        // Utilisé pour Background Sync events et notifications
        const ch = new BroadcastChannel("sw-messages");
        ch.onmessage = (ev) => {
          const msg = ev.data?.type;
          
          if (msg === "BG_SYNC_REPLAYED") {
            // Background Sync: messages/photos rejouées après reconnexion
            // Optionnel: invalider React Query, mettre à jour UI, etc.
            console.debug("[SW] Background sync replayed", ev.data);
          }
          // Ajouter autres types de messages au besoin
        };

        // ===== AUTO-UPDATE: Détecte nouvelle SW en background =====
        reg.addEventListener("updatefound", () => {
          const newSW = reg.installing;
          if (!newSW) return;

          // Écoute les changements d'état du nouveau SW
          newSW.addEventListener("statechange", () => {
            // Quand nouvelle SW est "installed" et ancien controller actif
            // → Demander l'activation immédiate (SKIP_WAITING)
            if (newSW.state === "installed" && navigator.serviceWorker.controller) {
              console.debug("[ServiceWorkerInit] New SW installed, sending SKIP_WAITING");
              
              // Envoie message au nouveau SW: passe en "active" immédiatement
              newSW.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        // ===== RELOAD après changement de contrôleur =====
        // Déclenché quand nouveau SW devient active
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          // Recharge une seule fois (flag __reloadedBySW)
          // Évite recharges infinies
          if (!window.__reloadedBySW) {
            window.__reloadedBySW = true;
            console.debug("[ServiceWorkerInit] Controller changed, reloading...");
            window.location.reload();
          }
        });
      } catch (err) {
        // Erreur d'enregistrement (rare: manifest missing, cert error, etc.)
        console.error("[ServiceWorkerInit] Register failed:", err);
      }
    };

    // Exécute l'enregistrement
    register();
  }, []);

  // Aucun rendu UI
  return null;
}

// ===== TYPE DECLARATION =====
// Ajoute propriété ad-hoc pour flag reload
declare global {
  interface Window {
    __reloadedBySW?: boolean;
  }
}
