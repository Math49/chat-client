/**
 * @fileoverview API Notifications Web avec support vibration.
 * Gère les permissions, affichage notifications, vibration lors d'événements.
 * @module lib/notifications
 */

/**
 * Demande la permission utilisateur pour afficher des notifications.
 * Retourne l'état actuel si déjà accordé/refusé.
 * @returns {Promise<NotificationPermission|null>} 'granted'|'denied'|'default'|null si indisponible
 * @example
 * const perm = await requestNotificationPermission();
 * if (perm === 'granted') {
 *   // Afficher notification possible
 * }
 */
export const requestNotificationPermission = async (): Promise<NotificationPermission | null> => {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return null;
  }
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch (error) {
    console.error("Notification permission request failed", error);
    return null;
  }
};

/**
 * Options pour afficher une notification.
 * @typedef {Object} NotifyOptions
 * @property {string} [title="Notification"] - Titre de la notification
 * @property {string} [body] - Corps/description
 * @property {string} [icon] - URL icône badge
 * @property {string} [url="/gallery"] - URL ouverte au clic
 * @property {number|number[]|false} [vibrate] - Pattern vibration (ms) ou false pour no vibrate
 * @property {string} [tag] - Tag unique (évite doublons)
 */
interface NotifyOptions {
  title?: string;
  body?: string;
  icon?: string;
  url?: string;
  vibrate?: number | number[] | false;
  tag?: string;
}

/**
 * Convertit un pattern de vibration en tableau ms normalisé.
 * @param {number|number[]|false} value - Pattern brut
 * @returns {number[]|undefined} Tableau [vibrate_ms, pause_ms, ...] ou undefined
 * @private
 */
const resolveVibrationPattern = (value?: number | number[] | false): number[] | undefined => {
  if (value === false) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === "number") return [value];
  return [160, 80, 160];
};

/**
 * Affiche une notification via le Service Worker.
 * Gère automatiquement:
 * - Demande de permission si nécessaire
 * - Vibration patron
 * - Ouverture URL au clic
 * 
 * @param {NotifyOptions} options - Options notification
 * @returns {Promise<boolean>} Vrai si notification affichée avec succès
 * @throws Pas de throw, retourne false en cas d'erreur
 * @example
 * await showNotification({
 *   title: "Nouveau message",
 *   body: "Alice: Hello!",
 *   vibrate: [200, 100, 200],
 *   url: "/room/general"
 * });
 */
/**
 * Affiche une notification Web avec vibration optionnelle.
 * Gère automatiquement les permissions et la vibration du navigateur.
 * @param {NotifyOptions} options - Configuration notification
 * @returns {Promise<boolean>} True si notification affichée
 */
export const showNotification = async ({
  title = "Notification",
  body,
  icon,
  url = "/gallery",
  vibrate,
  tag,
}: NotifyOptions): Promise<boolean> => {
  // Vérifier disponibilité window et API Notification
  if (typeof window === "undefined") return false;
  if (typeof Notification === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;

  // Demander permission si nécessaire
  const permission = Notification.permission === "default"
    ? await requestNotificationPermission()
    : Notification.permission;

  if (permission !== "granted") return false;

  // Résoudre le pattern de vibration
  const pattern = resolveVibrationPattern(vibrate);


  // Activer vibration si supportée
  if (pattern && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }

  try {
    // Utiliser Service Worker pour afficher notification persistante
    const registration = await navigator.serviceWorker.ready;
    const options: NotificationOptions & { vibrate?: number[] } = {
      body,
      icon,
      badge: icon,
      vibrate: pattern,
      data: { url }, // URL ouverte au clic
      tag: tag ?? `chat-client-${url}`, // Éviter doublons
    };
    await registration.showNotification(title, options);
    return true;
  } catch (error) {
    console.error("Unable to show notification", error);
    return false;
  }
};
