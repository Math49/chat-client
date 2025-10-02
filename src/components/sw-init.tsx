// src/app/_components/sw-init.tsx
'use client';

import { useEffect } from 'react';

export default function ServiceWorkerInit() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        // Canal de messages SW (rejeu background sync)
        const ch = new BroadcastChannel('sw-messages');
        ch.onmessage = (ev) => {
          const msg = ev.data?.type;
          if (msg === 'BG_SYNC_REPLAYED') {
            // Option : rafraîchir les données du client, invalider le cache React Query, etc.
            // console.debug('[SW]', ev.data);
          }
        };

        // Auto-update : activer la nouvelle SW et recharger
        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              // Demander au SW d'activer tout de suite
              newSW.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // Rechargement quand le contrôleur change (nouvelle SW active)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          // Recharge une seule fois
          if (!window.__reloadedBySW) {
            window.__reloadedBySW = true;
            window.location.reload();
          }
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('SW register failed', err);
      }
    };

    register();
  }, []);

  return null;
}

// Déclaration pour éviter TS error sur propriété ad-hoc
declare global {
  interface Window {
    __reloadedBySW?: boolean;
  }
}
