/**
 * @fileoverview Persistance des photos en localStorage avec gestion de quota intelligente.
 * 
 * Stockage:
 * - Quota total: 5MB (limite navigateur localStorage)
 * - Limite nombre: 120 photos max
 * - Format: Data URLs (base64) pour accessibilité offline
 * 
 * Stratégie purge (si quota dépassé):
 * 1. Supprimer 50% des photos les plus anciennes
 * 2. Si toujours dépassé: Garder seulement 10 photos (emergency)
 * 
 * @module lib/photo-storage
 */

export const PHOTOS_STORAGE_KEY = "chat-client/photos";

export type StoredPhoto = {
  id: string;
  dataUrl: string;
  createdAt: number;
};

// Limites de stockage
const MAX_PHOTOS = 120;
const MAX_TOTAL_SIZE_KB = 5000; // ~5MB pour les photos

const getStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (error) {
    console.error("[PhotoStorage] LocalStorage inaccessible", error);
    return null;
  }
};

/**
 * Estime la taille en KB du contenu en localStorage
 */
const estimateStorageSize = (data: string): number => {
  if (typeof Blob === "undefined") return 0;
  return new Blob([data]).size / 1024;
};

const persistPhotos = (photos: StoredPhoto[]): boolean => {
  const storage = getStorage();
  if (!storage) return false;

  try {
    const json = JSON.stringify(photos);
    const sizeKB = estimateStorageSize(json);

    if (sizeKB > MAX_TOTAL_SIZE_KB) {
      console.warn(`[PhotoStorage] Size ${sizeKB.toFixed(2)}KB exceeds ${MAX_TOTAL_SIZE_KB}KB, purging oldest...`);
      // Purge : garder seulement les 50% photos les plus récentes
      const kept = photos
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, Math.ceil(photos.length * 0.5));
      
      return persistPhotos(kept);
    }

    storage.setItem(PHOTOS_STORAGE_KEY, json);
    return true;
  } catch (error) {
    console.error("[PhotoStorage] Failed to persist", error);
    
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      console.warn("[PhotoStorage] Quota exceeded, purging oldest photos");
      // Emergency purge : garder seulement les 10 photos les plus récentes
      const recent = photos
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10);
      
      try {
        storage.setItem(PHOTOS_STORAGE_KEY, JSON.stringify(recent));
        return true;
      } catch {
        return false;
      }
    }
    
    return false;
  }
};

const parsePhotos = (value: string | null): StoredPhoto[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as StoredPhoto[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      Boolean(
        item && typeof item.id === "string" && typeof item.dataUrl === "string" && typeof item.createdAt === "number"
      )
    );
  } catch (error) {
    console.warn("[PhotoStorage] Invalid photos in storage, reset", error);
    return [];
  }
};

export const loadPhotos = (): StoredPhoto[] => {
  const storage = getStorage();
  if (!storage) return [];
  return parsePhotos(storage.getItem(PHOTOS_STORAGE_KEY));
};

const generateId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `photo-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const savePhoto = (dataUrl: string): StoredPhoto => {
  const photos = loadPhotos();
  const photo: StoredPhoto = {
    id: generateId(),
    dataUrl,
    createdAt: Date.now(),
  };
  // Garder les MAX_PHOTOS les plus récentes
  const next = [photo, ...photos].slice(0, MAX_PHOTOS);
  persistPhotos(next);
  return photo;
};

export const removePhoto = (photoId: string): StoredPhoto[] => {
  const photos = loadPhotos();
  const next = photos.filter((photo) => photo.id !== photoId);
  persistPhotos(next);
  return next;
};

export const replacePhotos = (photos: StoredPhoto[]) => {
  persistPhotos(photos);
};

/**
 * Retourne des stats sur le storage photos (pour monitoring)
 */
export const getPhotoStorageStats = (): { count: number; sizeKB: number } => {
  const storage = getStorage();
  if (!storage) return { count: 0, sizeKB: 0 };

  try {
    const json = storage.getItem(PHOTOS_STORAGE_KEY) ?? "[]";
    const photos = parsePhotos(json);
    const sizeKB = estimateStorageSize(json);
    return { count: photos.length, sizeKB };
  } catch (error) {
    console.error("[PhotoStorage] Failed to get stats", error);
    return { count: 0, sizeKB: 0 };
  }
};

