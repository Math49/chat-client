/**
 * @fileoverview Gestion persistante des salons de chat.
 * Stockage/récupération des rooms dans localStorage avec normalisation des noms.
 * @module lib/rooms
 */

/** Clé localStorage pour persister les rooms personnalisées */
const ROOMS_STORAGE_KEY = "chat-client/rooms";

/** Salons par défaut toujours disponibles */
const DEFAULT_ROOMS = ["general", "pwa", "design", "support", "tech"];

/**
 * Lit la liste des rooms persistées depuis le localStorage.
 * @returns {string[]} Tableau de noms de rooms (normalisés)
 * @private
 */
const readStorage = (): string[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ROOMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  } catch (error) {
    console.warn("Unable to read stored rooms", error);
    return [];
  }
};

/**
 * Écrit la liste des rooms dans le localStorage.
 * @param {string[]} rooms - Tableau de noms de rooms
 * @returns {void}
 * @private
 */
const writeStorage = (rooms: string[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(rooms));
  } catch (error) {
    console.warn("Unable to persist rooms", error);
  }
};

/**
 * Normalise le nom d'une room: minuscules, tirets au lieu des espaces.
 * Ex: "Mon Salon" → "mon-salon"
 * @param {string} value - Nom brut
 * @returns {string} Nom normalisé (slug-friendly)
 * @private
 */
const normalizeRoom = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

/**
 * Récupère la liste complète des rooms disponibles.
 * Fusionne les rooms par défaut + rooms personnalisées stockées,
 * déduplique et trie alphabétiquement.
 * @returns {string[]} Tableau de noms de rooms disponibles
 * @example
 * const rooms = getAvailableRooms();
 * // → ["design", "general", "pwa", "support", "tech", "custom-room"]
 */
export const getAvailableRooms = (): string[] => {
  const stored = readStorage();
  const rooms = new Set<string>([...DEFAULT_ROOMS, ...stored]);
  return Array.from(rooms).sort((a, b) => a.localeCompare(b));
};

/**
 * Ajoute une room à l'historique persisté (si pas déjà existante).
 * Normalise le nom automatiquement.
 * @param {string} roomName - Nom de la room à mémoriser
 * @returns {void}
 * @example
 * rememberRoom("Mon Salon");
 * // localStorage mise à jour avec "mon-salon"
 */
export const rememberRoom = (roomName: string) => {
  const normalized = normalizeRoom(roomName);
  if (!normalized) return;
  const stored = readStorage();
  if (stored.includes(normalized)) return;
  const next = [...stored, normalized];
  writeStorage(next);
};

/**
 * Remplace la liste complète des rooms persistées.
 * Normalise et déduplique automatiquement.
 * @param {string[]} rooms - Nouveaux noms de rooms
 * @returns {void}
 * @private
 */
export const persistRooms = (rooms: string[]) => {
  const next = Array.from(new Set(rooms.map(normalizeRoom))).filter(Boolean);
  writeStorage(next);
};

