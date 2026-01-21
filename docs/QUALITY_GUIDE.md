# Guide de qualité & documentation

[← Précédent](./RENDERING_SSR_SSG_ISR.md) | [Accueil / README](../README.md) | [Suivant →](../README.md)

## Sommaire
- [Guide de qualité \& documentation](#guide-de-qualité--documentation)
  - [Sommaire](#sommaire)
  - [Objectif](#objectif)
  - [Règles de documentation](#règles-de-documentation)
    - [Convention de navigation docs](#convention-de-navigation-docs)
  - [Structure recommandée du code](#structure-recommandée-du-code)
  - [JSDoc / TSDoc](#jsdoc--tsdoc)
  - [Règles “anti-régression”](#règles-anti-régression)
    - [Hydration mismatch](#hydration-mismatch)
    - [Offline / PWA](#offline--pwa)
    - [Temps réel](#temps-réel)
  - [Comment tester](#comment-tester)

## Objectif
Définir les règles de **qualité**, la stratégie de **documentation**, et les garde-fous pour éviter :
- dérive d’architecture,
- mismatch SSR/Client (hydratation),
- régression offline (PWA),
- régression temps réel (Socket/WebRTC).

## Règles de documentation
- Documentation projet : `/docs`
- Toute modification importante doit :
  1) mettre à jour le doc concerné,
  2) ajouter une note “Migration / changement”.

### Convention de navigation docs
Chaque doc doit contenir :
- “Précédent / Accueil / Suivant” en haut
- le même bloc en bas

## Structure recommandée du code
- Pages : `src/app/**/page.tsx`
- UI : `src/components/**`
- Hooks : `src/hooks/**`
- Services : `src/services/**`
- Lib : `src/lib/**`

## JSDoc / TSDoc
Priorité :
- `src/lib/*` : fonctions exposées (storage, notifications, socket client)
- `src/hooks/*` : API de hook (inputs/outputs)
- `src/services/*` : effets de bord (events socket, call state)

Exemple :
```
/**
 * Envoie un message dans une room.
 * @param roomName Nom de la room cible
 * @param content Contenu du message (texte ou data URL)
 */
```

## Règles “anti-régression”
### Hydration mismatch
- Interdit : `Date.now()` / `Math.random()` dans le rendu initial.
- Interdit : `className` conditionnel selon `window` dans un rendu SSR.
- Préférer : media queries ou `useEffect` pour localStorage.

### Offline / PWA
- Toute nouvelle route critique doit être testée offline :
  - si précachée → elle doit ouvrir,
  - sinon → fallback offline clair.

### Temps réel
- Toute modif d’événement Socket.IO doit être reflétée dans :
  - `docs/REALTIME_SOCKETIO.md`
  - types `socket-client.ts`

## Comment tester
1. `npm run dev`
2. Parcours : accueil → réception → room
3. Multi onglets / multi navigateurs
4. Offline : Application → SW → Offline
5. Lighthouse : DevTools → Lighthouse Desktop

[← Précédent](./RENDERING_SSR_SSG_ISR.md) | [Accueil / README](../README.md) | [Suivant →](../README.md)
